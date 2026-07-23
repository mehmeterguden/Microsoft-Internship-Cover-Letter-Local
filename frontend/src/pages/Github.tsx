import { useState } from "react";
import { Github as GithubIcon, Sparkles, Star, Trash2, Users } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { AsyncBoundary } from "@/components/common/AsyncBoundary";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/common/EmptyState";
import { SkillTag } from "@/components/common/SkillTag";
import { DevInspector } from "@/components/common/DevInspector";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import type { GithubRepo, ScoredSkill } from "@/api/types";
import { analyzeRepos, fetchRepos as apiFetchRepos, saveRepos, type AnalyzeResult, type GithubProfile } from "@/api/github";
import { deleteSavedRepo, listSavedRepos } from "@/api/githubRepos";
import { useAsync } from "@/lib/useAsync";
import { langColor } from "@/lib/langColors";
import { cn } from "@/lib/utils";
import { toast } from "@/store/toast";

type Status = "new" | "saved" | "updated";

const STATUS: Record<Status, { label: string; tone: "success" | "neutral" | "gold" }> = {
  new: { label: "New", tone: "success" },
  saved: { label: "Saved", tone: "neutral" },
  updated: { label: "Update available", tone: "gold" },
};

function mergeSkills(prev: ScoredSkill[], incoming: ScoredSkill[]): ScoredSkill[] {
  const map = new Map(prev.map((s) => [s.name.toLowerCase(), s]));
  for (const s of incoming) {
    const k = s.name.toLowerCase();
    const ex = map.get(k);
    if (!ex || (s.score ?? 0) > (ex.score ?? 0)) map.set(k, s);
  }
  return Array.from(map.values()).sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
}

/** Fold a saved repo's analysis onto a freshly-fetched repo so its data shows. */
function withSaved(r: GithubRepo, s: GithubRepo | undefined): GithubRepo {
  if (!s) return r;
  return {
    ...r,
    description: s.description ?? r.description,
    purpose: s.purpose,
    highlights: s.highlights ?? [],
    technologies: s.technologies?.length ? s.technologies : r.technologies,
    contribution: s.contribution,
    involvement_rating: s.involvement_rating,
  };
}

/** Shared display of a repo's analyzed content. */
function RepoBody({ r }: { r: GithubRepo }) {
  return (
    <>
      {r.purpose && <p className="mt-1.5 text-[13px] font-semibold text-accent-ink">{r.purpose}</p>}
      {r.description && <p className="mt-1 text-[13.5px] leading-relaxed text-text-2">{r.description}</p>}
      {(r.highlights?.length ?? 0) > 0 && (
        <ul className="mt-2 grid gap-1">
          {r.highlights!.map((h) => (
            <li key={h} className="flex items-start gap-2 text-[13px] text-text-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent-ink" /> {h}
            </li>
          ))}
        </ul>
      )}
      {r.contribution && <p className="mt-2 text-[13px] italic text-text-3">{r.contribution}</p>}
      {(r.technologies?.length ?? 0) > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {r.technologies!.map((t) => (
            <SkillTag key={t}>
              <span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: langColor(t) }} />
              {t}
            </SkillTag>
          ))}
        </div>
      )}
    </>
  );
}

function Stat({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="text-center">
      <p className="font-display text-[18px] font-extrabold leading-none text-text">{value}</p>
      <p className="mt-1 text-[11px] font-medium uppercase tracking-wide text-text-3">{label}</p>
    </div>
  );
}

function ProfileBanner({ p, count }: { p: GithubProfile; count: number }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-4 rounded-[16px] border border-border bg-surface p-4 shadow-soft">
      {p.avatar_url ? (
        <img src={p.avatar_url} alt="" className="h-14 w-14 shrink-0 rounded-full ring-2 ring-border" />
      ) : (
        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-accent-soft text-accent-ink"><GithubIcon size={22} /></span>
      )}
      <div className="min-w-0 flex-1">
        <a href={p.html_url ?? "#"} target="_blank" rel="noopener noreferrer" className="text-[16px] font-bold text-text hover:text-accent-ink">
          {p.name || p.login}
        </a>
        {p.login && <span className="ml-2 text-[13px] text-text-3">@{p.login}</span>}
        {p.bio && <p className="mt-0.5 line-clamp-2 text-[13px] text-text-2">{p.bio}</p>}
      </div>
      <div className="flex gap-5 pr-1">
        <Stat value={count} label="fetched" />
        <Stat value={p.followers ?? 0} label="followers" />
        <Stat value={p.public_repos ?? 0} label="public" />
      </div>
    </div>
  );
}

export function Github() {
  const saved = useAsync(listSavedRepos, []);
  const savedByName = new Map((saved.data ?? []).map((r) => [(r.repo_name ?? "").toLowerCase(), r]));

  const [username, setUsername] = useState("mehmeterguden");
  const [login, setLogin] = useState("");
  const [profile, setProfile] = useState<GithubProfile | null>(null);
  const [phase, setPhase] = useState<"idle" | "fetching" | "loaded">("idle");
  const [repos, setRepos] = useState<GithubRepo[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [analyzingSet, setAnalyzingSet] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [skills, setSkills] = useState<ScoredSkill[]>([]);
  const [analysis, setAnalysis] = useState<AnalyzeResult | null>(null);
  const [pendingDelete, setPendingDelete] = useState<GithubRepo | null>(null);

  function statusOf(r: GithubRepo): Status {
    const s = savedByName.get((r.repo_name ?? "").toLowerCase());
    if (!s) return "new";
    return (r.last_updated ?? "") > (s.last_updated ?? "") ? "updated" : "saved";
  }
  const isSaved = (r: GithubRepo) => savedByName.has((r.repo_name ?? "").toLowerCase());

  async function fetchRepos() {
    if (!username.trim()) return;
    setPhase("fetching");
    try {
      const result = await apiFetchRepos(username, false);
      const savedMap = new Map((saved.data ?? []).map((r) => [(r.repo_name ?? "").toLowerCase(), r]));
      const merged = result.repos.map((r) => withSaved(r, savedMap.get(r.repo_name.toLowerCase())));
      setRepos(merged);
      // Pre-select only what isn't already in the profile.
      setSelected(new Set(merged.filter((r) => !savedMap.has(r.repo_name.toLowerCase())).map((r) => r.repo_name)));
      setSkills([]);
      setAnalysis(null);
      setProfile(result.profile);
      setLogin(result.profile.login ?? username);
      setPhase("loaded");
    } catch (err) {
      toast.error(err, "Couldn't fetch repos");
      setPhase("idle");
    }
  }

  function toggle(name: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  /** Analyze repos, merge results in place, and persist immediately. */
  async function runAnalysis(list: GithubRepo[]) {
    if (list.length === 0) {
      toast.warning("Nothing selected", "Pick at least one repository to analyze.");
      return;
    }
    const names = list.map((r) => r.repo_name);
    setAnalyzingSet((prev) => new Set([...prev, ...names]));
    try {
      const result = await analyzeRepos(login || username, list);
      const enriched = list.map((r) => {
        const found = result.repos?.find((x) => x.repo_name === r.repo_name);
        return found ? { ...r, ...found } : r;
      });
      setRepos((prev) => prev.map((r) => enriched.find((e) => e.repo_name === r.repo_name) ?? r));
      const union = mergeSkills(skills, result.skills ?? []);
      setSkills(union);
      setAnalysis(result);
      // Auto-save: analyzing a README persists it into the profile right away.
      const result2 = await saveRepos(enriched, union);
      saved.reload();
      setSelected((prev) => {
        const next = new Set(prev);
        names.forEach((n) => next.delete(n));
        return next;
      });
      const syncedProjects = result2.added_projects + result2.updated_projects;
      const detail = [
        syncedProjects ? `${syncedProjects} project${syncedProjects === 1 ? "" : "s"} on your profile` : null,
        result2.added_skills ? `${result2.added_skills} new skill${result2.added_skills === 1 ? "" : "s"}` : null,
        result2.skipped_projects ? `${result2.skipped_projects} kept as-is (from CV/manual)` : null,
      ].filter(Boolean).join(" · ");
      toast.success(
        names.length === 1 ? `Analyzed & saved ${names[0]}` : `${names.length} analyzed & saved`,
        detail || undefined,
      );
    } catch (err) {
      toast.error(err, "Analysis failed");
    } finally {
      setAnalyzingSet((prev) => {
        const next = new Set(prev);
        names.forEach((n) => next.delete(n));
        return next;
      });
    }
  }

  async function analyzeSelected() {
    setBulkBusy(true);
    try {
      await runAnalysis(repos.filter((r) => selected.has(r.repo_name)));
    } finally {
      setBulkBusy(false);
    }
  }

  async function confirmDelete() {
    if (pendingDelete?.id == null) return;
    try {
      await deleteSavedRepo(pendingDelete.id);
      toast.success("Removed");
      setPendingDelete(null);
      saved.reload();
    } catch (err) {
      toast.error(err, "Couldn't remove");
    }
  }

  const savedCount = saved.data?.length ?? 0;

  function RepoCard({ r, selectable }: { r: GithubRepo; selectable: boolean }) {
    const isSel = selected.has(r.repo_name);
    const busy = analyzingSet.has(r.repo_name);
    const st = statusOf(r);
    return (
      <Card className={cn("transition-colors", isSel && "ring-1 ring-accent/40")}>
        <CardContent className="pt-5">
          <div className="flex items-start gap-3">
            {selectable && (
              <Checkbox className="mt-1" checked={isSel} onChange={() => toggle(r.repo_name)} aria-label={`Select ${r.repo_name}`} />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <a href={r.url ?? "#"} target="_blank" rel="noopener noreferrer" className="text-[15.5px] font-bold text-text hover:text-accent-ink">
                    {r.repo_name}
                  </a>
                  <Badge tone={STATUS[st].tone}>{STATUS[st].label}</Badge>
                </div>
                <span className="inline-flex items-center gap-1 font-mono text-[12px] text-text-3">
                  <Star size={13} className="fill-gold text-gold" /> {r.stars ?? 0}
                </span>
              </div>
              <RepoBody r={r} />
              <div className="mt-3 flex justify-end">
                <Button size="sm" variant="ghost" onClick={() => runAnalysis([r])} loading={busy}>
                  <Sparkles size={14} /> {isSaved(r) ? "Re-analyze" : "Analyze & save"}
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const fresh = repos.filter((r) => !isSaved(r));
  const inProfile = repos.filter((r) => isSaved(r));
  const freshSelected = fresh.filter((r) => selected.has(r.repo_name)).length;

  return (
    <>
      <PageHeader
        eyebrow="Build your profile"
        title="GitHub import"
        icon={GithubIcon}
        description="Import repositories and analyze their READMEs — each analysis is saved to your profile automatically. Re-import any time to add new work or refresh what changed."
      />

      <Tabs defaultValue="saved">
        <TabsList>
          <TabsTrigger value="saved">Saved{savedCount ? ` (${savedCount})` : ""}</TabsTrigger>
          <TabsTrigger value="import"><GithubIcon size={14} /> Import from GitHub</TabsTrigger>
        </TabsList>

        {/* ── Saved repositories ── */}
        <TabsContent value="saved">
          <AsyncBoundary loading={saved.loading} error={saved.error} onRetry={saved.reload}>
            {savedCount === 0 ? (
              <EmptyState
                icon={GithubIcon}
                title="No repositories saved yet"
                description="Switch to Import from GitHub, then analyze a repo — it's saved here automatically."
              />
            ) : (
              <div className="grid gap-4">
                <div className="flex items-center gap-5 rounded-[12px] border border-border bg-surface px-5 py-3.5 shadow-soft">
                  <Stat value={savedCount} label="repositories" />
                  <span className="h-8 w-px bg-line" />
                  <Stat value={(saved.data ?? []).reduce((n, r) => n + (r.stars ?? 0), 0)} label="total stars" />
                  <span className="ml-auto flex items-center gap-1.5 text-[12.5px] text-text-3">
                    <Users size={14} /> Used when generating letters
                  </span>
                </div>
                {(saved.data ?? []).map((r) => (
                  <Card key={r.id}>
                    <CardContent className="pt-5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <a href={r.url ?? "#"} target="_blank" rel="noopener noreferrer" className="text-[15.5px] font-bold text-text hover:text-accent-ink">
                          {r.repo_name}
                        </a>
                        <div className="flex items-center gap-3">
                          <span className="inline-flex items-center gap-1 font-mono text-[12px] text-text-3">
                            <Star size={13} className="fill-gold text-gold" /> {r.stars ?? 0}
                          </span>
                          <button
                            type="button"
                            aria-label={`Remove ${r.repo_name}`}
                            onClick={() => setPendingDelete(r)}
                            className="rounded-[8px] p-1.5 text-text-3 transition-colors hover:bg-danger-soft hover:text-danger"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                      <RepoBody r={r} />
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </AsyncBoundary>
        </TabsContent>

        {/* ── Import from GitHub ── */}
        <TabsContent value="import">
          <Card className="mb-5">
            <CardContent className="flex flex-wrap items-end gap-3 pt-5">
              <Field label="GitHub username" htmlFor="ghuser" className="min-w-56 flex-1">
                <Input id="ghuser" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="octocat" />
              </Field>
              <Button onClick={fetchRepos} loading={phase === "fetching"}>
                <GithubIcon size={16} /> Fetch repos
              </Button>
            </CardContent>
          </Card>

          {phase === "idle" && (
            <EmptyState icon={GithubIcon} title="Import your work" description="Enter a username (or connect your account in Settings) and fetch." />
          )}

          {phase === "fetching" && (
            <div className="flex flex-col items-center gap-3 py-14">
              <Spinner size={34} />
              <p className="text-[14px] text-text-2">Fetching repositories for {username}…</p>
            </div>
          )}

          {phase === "loaded" && (
            <div className="grid gap-4" style={{ animation: "cll-rise 0.4s both" }}>
              {profile && <ProfileBanner p={profile} count={repos.length} />}

              {fresh.length > 0 && (
                <>
                  <div className="sticky top-2 z-10 flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-border bg-surface/90 px-4 py-3 shadow-soft backdrop-blur">
                    <span className="text-[13.5px] font-semibold text-text">
                      New — not in your profile yet ({fresh.length})
                    </span>
                    <Button variant="secondary" onClick={analyzeSelected} loading={bulkBusy} disabled={freshSelected === 0}>
                      <Sparkles size={16} /> Analyze &amp; save selected ({freshSelected})
                    </Button>
                  </div>
                  {fresh.map((r) => <RepoCard key={r.repo_name} r={r} selectable />)}
                  {skills.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2 rounded-[12px] border border-border bg-surface-2 px-4 py-3">
                      <span className="text-[13px] font-semibold text-text">Skills extracted:</span>
                      {skills.map((s) => (
                        <Badge key={s.name} tone="accent">{s.name}{s.score ? ` · ${s.score}/5` : ""}</Badge>
                      ))}
                    </div>
                  )}
                </>
              )}

              {inProfile.length > 0 && (
                <div className="mt-2 grid gap-4">
                  <div className="flex items-center gap-3">
                    <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-text-3">
                      Already in your profile ({inProfile.length})
                    </span>
                    <span className="h-px flex-1 bg-line" />
                  </div>
                  {inProfile.map((r) => <RepoCard key={r.repo_name} r={r} selectable={false} />)}
                </div>
              )}

              {analysis && <DevInspector json={analysis} title="Developer · view AI analysis (JSON)" />}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={pendingDelete != null}
        onOpenChange={(o) => !o && setPendingDelete(null)}
        title="Remove this repository?"
        description={pendingDelete?.repo_name}
        destructive
        confirmLabel="Remove"
        onConfirm={confirmDelete}
      />
    </>
  );
}

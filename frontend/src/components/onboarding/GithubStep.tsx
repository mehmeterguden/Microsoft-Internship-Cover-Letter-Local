import { useState } from "react";
import { Github as GithubIcon, RotateCcw, Sparkles, Star } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Spinner } from "@/components/ui/spinner";
import { Alert } from "@/components/ui/alert";
import { SkillTag } from "@/components/common/SkillTag";
import { analyzeRepos, fetchRepos, saveRepos } from "@/api/github";
import type { GithubRepo, ScoredSkill } from "@/api/types";
import { cn } from "@/lib/utils";
import { toast } from "@/store/toast";
import type { StepProps } from "./types";

type Phase = "idle" | "fetching" | "loaded" | "saved";

export function GithubStep({ detected, done, onDone }: StepProps) {
  const [phase, setPhase] = useState<Phase>(done && detected.repos.length > 0 ? "saved" : "idle");
  const [username, setUsername] = useState(detected.githubUsername ?? "");
  const [login, setLogin] = useState("");
  const [repos, setRepos] = useState<GithubRepo[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [savedCount, setSavedCount] = useState(detected.repos.length);

  const savedNames = new Set(detected.repos.map((r) => (r.repo_name ?? "").toLowerCase()));

  async function fetch() {
    if (!username.trim()) return;
    setPhase("fetching");
    try {
      const result = await fetchRepos(username.trim(), false);
      const list = result.repos ?? [];
      setRepos(list);
      setLogin(result.profile.login ?? username.trim());
      // Pre-select the most-starred repos that aren't already in the profile.
      const fresh = list
        .filter((r) => !savedNames.has(r.repo_name.toLowerCase()))
        .sort((a, b) => (b.stars ?? 0) - (a.stars ?? 0))
        .slice(0, 3)
        .map((r) => r.repo_name);
      setSelected(new Set(fresh));
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

  async function analyzeAndSave() {
    const list = repos.filter((r) => selected.has(r.repo_name));
    if (list.length === 0) {
      toast.warning("Nothing selected", "Pick at least one repository.");
      return;
    }
    setBusy(true);
    try {
      const result = await analyzeRepos(login || username.trim(), list);
      const enriched = list.map((r) => {
        const found = result.repos?.find((x) => x.repo_name === r.repo_name);
        return found ? { ...r, ...found } : r;
      });
      const skills: ScoredSkill[] = result.skills ?? [];
      const saved = await saveRepos(enriched, skills);
      setSavedCount((n) => n + saved.saved_repos + saved.updated_repos || list.length);
      setPhase("saved");
      onDone();
      const bits = [
        `${list.length} repo${list.length === 1 ? "" : "s"} saved`,
        saved.added_skills ? `${saved.added_skills} new skill${saved.added_skills === 1 ? "" : "s"}` : null,
      ]
        .filter(Boolean)
        .join(" · ");
      toast.success("GitHub imported", bits);
    } catch (err) {
      toast.error(err, "Analysis failed");
    } finally {
      setBusy(false);
    }
  }

  // ── Already imported ──
  if (phase === "saved") {
    return (
      <Card style={{ animation: "cll-rise 0.3s both" }}>
        <CardContent className="flex flex-wrap items-center gap-4 pt-5">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[13px] bg-accent-soft text-accent-ink">
            <GithubIcon size={22} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[15px] font-bold text-text">
                {savedCount} repositor{savedCount === 1 ? "y" : "ies"} on your profile
              </p>
              <Badge tone="success">Connected</Badge>
            </div>
            <p className="mt-0.5 text-[13px] text-text-2">These give your letters real projects to draw on.</p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setPhase("idle")}>
            <RotateCcw size={14} /> Import more
          </Button>
        </CardContent>
      </Card>
    );
  }

  // ── Fetching ──
  if (phase === "fetching") {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center" style={{ animation: "cll-rise 0.3s both" }}>
        <Spinner size={32} />
        <p className="text-[14px] text-text-2">Fetching repositories for {username}…</p>
      </div>
    );
  }

  // ── Loaded (pick + analyze) ──
  if (phase === "loaded") {
    return (
      <div className="grid gap-4" style={{ animation: "cll-rise 0.3s both" }}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[13.5px] text-text-2">
            Pick the repositories that show your best work — we'll analyze the READMEs and save them.
          </p>
          <Button variant="ghost" size="sm" onClick={() => setPhase("idle")}>
            <RotateCcw size={14} /> Change user
          </Button>
        </div>
        <div className="grid max-h-[46vh] gap-2 overflow-auto pr-1">
          {repos.map((r) => {
            const already = savedNames.has(r.repo_name.toLowerCase());
            const checked = selected.has(r.repo_name);
            return (
              <label
                key={r.repo_name}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-[12px] border bg-surface p-3.5 transition-colors",
                  checked ? "border-accent ring-1 ring-accent/30" : "border-border hover:border-border-strong",
                  already && "opacity-60",
                )}
              >
                <Checkbox
                  className="mt-0.5"
                  checked={checked}
                  disabled={already}
                  onChange={() => toggle(r.repo_name)}
                  aria-label={`Select ${r.repo_name}`}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-[14px] font-semibold text-text">{r.repo_name}</span>
                    {already && <Badge tone="neutral">In profile</Badge>}
                    <span className="ml-auto inline-flex items-center gap-1 font-mono text-[11.5px] text-text-3">
                      <Star size={12} className="fill-gold text-gold" /> {r.stars ?? 0}
                    </span>
                  </div>
                  {r.description && <p className="mt-0.5 line-clamp-2 text-[12.5px] text-text-2">{r.description}</p>}
                  {(r.technologies?.length ?? 0) > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {r.technologies!.slice(0, 5).map((t) => (
                        <SkillTag key={t}>{t}</SkillTag>
                      ))}
                    </div>
                  )}
                </div>
              </label>
            );
          })}
        </div>
        <Button onClick={analyzeAndSave} loading={busy} disabled={selected.size === 0}>
          <Sparkles size={16} /> Analyze &amp; save selected ({selected.size})
        </Button>
      </div>
    );
  }

  // ── Idle ──
  return (
    <div className="grid gap-4" style={{ animation: "cll-rise 0.3s both" }}>
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 pt-5">
          <Field label="GitHub username" htmlFor="ob-gh" className="min-w-56 flex-1">
            <Input
              id="ob-gh"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && fetch()}
              placeholder="octocat"
            />
          </Field>
          <Button onClick={fetch} disabled={!username.trim()}>
            <GithubIcon size={16} /> Fetch repos
          </Button>
        </CardContent>
      </Card>
      <Alert tone="info" title="Optional, but recommended">
        This is the one place letters get concrete details about what you've built. You can skip it and add repos
        later from the GitHub page.
      </Alert>
    </div>
  );
}

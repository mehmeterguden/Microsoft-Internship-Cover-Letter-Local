import { useState } from "react";
import { Github as GithubIcon, Sparkles, Star } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/common/EmptyState";
import { SkillTag } from "@/components/common/SkillTag";
import { RatingInput } from "@/components/common/RatingInput";
import { DevInspector } from "@/components/common/DevInspector";
import type { GithubRepo } from "@/api/types";
import { analyzeRepos, fetchRepos as apiFetchRepos, saveRepos, type AnalyzeResult } from "@/api/github";
import { errorMessage } from "@/api/client";
import { cn } from "@/lib/utils";
import { toast } from "@/store/toast";

type Phase = "empty" | "fetching" | "loaded";

export function Github() {
  const [phase, setPhase] = useState<Phase>("empty");
  const [username, setUsername] = useState("mehmeterguden");
  const [login, setLogin] = useState("");
  const [repos, setRepos] = useState<GithubRepo[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [analyzingSet, setAnalyzingSet] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [skills, setSkills] = useState<string[]>([]);
  const [analysis, setAnalysis] = useState<AnalyzeResult | null>(null);
  const [saving, setSaving] = useState(false);

  async function fetchRepos() {
    if (!username.trim()) return;
    setPhase("fetching");
    try {
      const result = await apiFetchRepos(username, false);
      setRepos(result.repos);
      setSelected(new Set(result.repos.map((r) => r.repo_name)));
      setSkills([]);
      setAnalysis(null);
      setLogin(result.profile.login ?? username);
      setPhase("loaded");
    } catch (err) {
      toast.danger("Couldn't fetch repos", errorMessage(err));
      setPhase("empty");
    }
  }

  function toggle(name: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => (prev.size === repos.length ? new Set() : new Set(repos.map((r) => r.repo_name))));
  }

  /** Analyze a set of repos, merging enriched data back in place. */
  async function runAnalysis(list: GithubRepo[]) {
    if (list.length === 0) {
      toast.warning("Nothing selected", "Pick at least one repository to analyze.");
      return;
    }
    const names = list.map((r) => r.repo_name);
    setAnalyzingSet((prev) => new Set([...prev, ...names]));
    try {
      const result = await analyzeRepos(login || username, list);
      setAnalysis(result);
      setRepos((prev) =>
        prev.map((r) => {
          const found = result.repos?.find((x) => x.repo_name === r.repo_name);
          return found ? { ...r, ...found } : r;
        }),
      );
      setSkills((prev) => Array.from(new Set([...prev, ...(result.skills ?? [])])));
      toast.success(
        names.length === 1 ? `Analyzed ${names[0]}` : `${names.length} repositories analyzed`,
        "Descriptions and skills extracted.",
      );
    } catch (err) {
      toast.danger("Analysis failed", errorMessage(err));
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

  async function save() {
    const chosen = repos.filter((r) => selected.has(r.repo_name));
    if (chosen.length === 0) {
      toast.warning("Nothing selected", "Pick the repositories to save.");
      return;
    }
    setSaving(true);
    try {
      const result = await saveRepos(chosen, skills);
      toast.success("Saved", `${result.saved_repos} repos, ${result.added_skills} new skills.`);
    } catch (err) {
      toast.danger("Save failed", errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const allSelected = repos.length > 0 && selected.size === repos.length;

  return (
    <>
      <PageHeader
        eyebrow="Build your profile"
        title="GitHub import"
        icon={GithubIcon}
        description="Pull your repositories, pick which ones to analyze, and turn their READMEs into projects and skills."
      />

      <Card className="mb-6">
        <CardContent className="flex flex-wrap items-end gap-3 pt-5">
          <Field label="GitHub username" htmlFor="ghuser" className="min-w-56 flex-1">
            <Input id="ghuser" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="octocat" />
          </Field>
          <Button onClick={fetchRepos} loading={phase === "fetching"}>
            <GithubIcon size={16} /> Fetch repos
          </Button>
        </CardContent>
      </Card>

      {phase === "empty" && (
        <EmptyState
          icon={GithubIcon}
          title="No repositories yet"
          description="Enter a username or connect your account in Settings, then fetch."
        />
      )}

      {phase === "fetching" && (
        <div className="flex flex-col items-center gap-3 py-14">
          <Spinner size={34} />
          <p className="text-[14px] text-text-2">Fetching repositories for {username}…</p>
        </div>
      )}

      {phase === "loaded" && (
        <div className="grid gap-4" style={{ animation: "cll-rise 0.4s both" }}>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-border bg-surface px-4 py-3 shadow-soft">
            <label className="flex cursor-pointer items-center gap-2.5 text-[13.5px] font-medium text-text">
              <Checkbox checked={allSelected} onChange={toggleAll} />
              {selected.size} of {repos.length} selected
            </label>
            <Button variant="secondary" onClick={analyzeSelected} loading={bulkBusy} disabled={selected.size === 0}>
              <Sparkles size={16} /> Analyze selected ({selected.size})
            </Button>
          </div>

          {repos.map((r) => {
            const isSel = selected.has(r.repo_name);
            const busy = analyzingSet.has(r.repo_name);
            return (
              <Card key={r.repo_name} className={cn("transition-colors", isSel && "ring-1 ring-accent/40")}>
                <CardContent className="pt-5">
                  <div className="flex items-start gap-3">
                    <Checkbox className="mt-1" checked={isSel} onChange={() => toggle(r.repo_name)} aria-label={`Select ${r.repo_name}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <a href={r.url ?? "#"} target="_blank" rel="noopener noreferrer" className="text-[15.5px] font-bold text-text hover:text-accent-ink">
                          {r.repo_name}
                        </a>
                        <span className="inline-flex items-center gap-1 font-mono text-[12px] text-text-3">
                          <Star size={13} className="fill-gold text-gold" /> {r.stars ?? 0}
                        </span>
                      </div>
                      {r.description && <p className="mt-1 text-[13.5px] text-text-2">{r.description}</p>}
                      {r.contribution && <p className="mt-1 text-[13px] text-text-3">{r.contribution}</p>}
                      {(r.technologies?.length ?? 0) > 0 && (
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          {r.technologies!.map((t) => <SkillTag key={t}>{t}</SkillTag>)}
                        </div>
                      )}
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                        <span className="flex items-center gap-2 text-[12.5px] text-text-3">
                          Your involvement <RatingInput value={r.involvement_rating ?? 0} readOnly />
                        </span>
                        <Button size="sm" variant="ghost" onClick={() => runAnalysis([r])} loading={busy}>
                          <Sparkles size={14} /> Analyze
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}

          <div className="flex flex-wrap items-center gap-2 rounded-[12px] border border-border bg-surface-2 px-4 py-3">
            <span className="text-[13px] font-semibold text-text">
              {skills.length > 0 ? "Skills found:" : "Analyze repositories to extract skills."}
            </span>
            {skills.map((s) => (
              <Badge key={s} tone="accent">{s}</Badge>
            ))}
            <Button size="sm" className="ml-auto" onClick={save} loading={saving} disabled={selected.size === 0}>
              Save selected ({selected.size})
            </Button>
          </div>

          {analysis && <DevInspector json={analysis} title="Developer · view AI analysis (JSON)" />}
        </div>
      )}
    </>
  );
}

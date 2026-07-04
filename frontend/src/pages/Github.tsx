import { useState } from "react";
import { Github as GithubIcon, Sparkles, Star } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/common/EmptyState";
import { SkillTag } from "@/components/common/SkillTag";
import { RatingInput } from "@/components/common/RatingInput";
import type { GithubRepo } from "@/api/types";
import { analyzeRepos, fetchRepos as apiFetchRepos, saveRepos } from "@/api/github";
import { errorMessage } from "@/api/client";
import { toast } from "@/store/toast";

type Phase = "empty" | "fetching" | "loaded";

export function Github() {
  const [phase, setPhase] = useState<Phase>("empty");
  const [username, setUsername] = useState("mehmeterguden");
  const [login, setLogin] = useState("");
  const [repos, setRepos] = useState<GithubRepo[]>([]);
  const [skills, setSkills] = useState<string[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);

  async function fetchRepos() {
    if (!username.trim()) return;
    setPhase("fetching");
    try {
      const result = await apiFetchRepos(username, false);
      setRepos(result.repos);
      setLogin(result.profile.login ?? username);
      setPhase("loaded");
    } catch (err) {
      toast.danger("Couldn't fetch repos", errorMessage(err));
      setPhase("empty");
    }
  }

  async function analyze() {
    setAnalyzing(true);
    try {
      const result = await analyzeRepos(login || username, repos);
      if (result.analysis.repos?.length) setRepos(result.analysis.repos);
      setSkills(result.analysis.skills ?? []);
      toast.success("READMEs analyzed", "Descriptions and skills extracted.");
    } catch (err) {
      toast.danger("Analysis failed", errorMessage(err));
    } finally {
      setAnalyzing(false);
    }
  }

  async function save() {
    setSaving(true);
    try {
      const result = await saveRepos(repos, skills);
      toast.success("Saved", `${result.saved_repos} repos, ${result.added_skills} new skills.`);
    } catch (err) {
      toast.danger("Save failed", errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Build your profile"
        title="GitHub import"
        description="Pull your repositories, analyze their READMEs with the local model, and turn them into projects and skills."
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
          <div className="flex items-center justify-between">
            <p className="text-[13.5px] text-text-2">{repos.length} repositories</p>
            <Button variant="secondary" onClick={analyze} loading={analyzing}>
              <Sparkles size={16} /> Analyze READMEs
            </Button>
          </div>
          {repos.map((r) => (
            <Card key={r.id} hoverable>
              <CardContent className="pt-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <a href={r.url ?? "#"} target="_blank" rel="noopener noreferrer" className="text-[15.5px] font-bold text-text hover:text-accent-ink">
                    {r.repo_name}
                  </a>
                  <span className="inline-flex items-center gap-1 font-mono text-[12px] text-text-3">
                    <Star size={13} className="fill-gold text-gold" /> {r.stars}
                  </span>
                </div>
                <p className="mt-1 text-[13.5px] text-text-2">{r.description}</p>
                <p className="mt-1 text-[13px] text-text-3">{r.contribution}</p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {r.technologies?.map((t) => (
                    <SkillTag key={t}>{t}</SkillTag>
                  ))}
                </div>
                <div className="mt-3 flex items-center gap-2 text-[12.5px] text-text-3">
                  <span>Your involvement</span>
                  <RatingInput value={r.involvement_rating ?? 0} readOnly />
                </div>
              </CardContent>
            </Card>
          ))}
          <div className="flex flex-wrap items-center gap-2 rounded-[10px] border border-border bg-surface-2 px-4 py-3">
            <span className="text-[13px] font-semibold text-text">
              {skills.length > 0 ? "Skills found:" : "Analyze READMEs to extract skills."}
            </span>
            {skills.map((s) => (
              <Badge key={s} tone="accent">{s}</Badge>
            ))}
            <Button size="sm" className="ml-auto" onClick={save} loading={saving}>
              Save to profile
            </Button>
          </div>
        </div>
      )}
    </>
  );
}

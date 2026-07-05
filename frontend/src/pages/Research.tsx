import { useEffect, useRef, useState } from "react";
import {
  Building2, CheckCircle2, Code2, Compass, Heart, Loader2, MessageSquare,
  Newspaper, Target, TrendingUp, Users, Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScoreRing } from "@/components/common/ScoreRing";
import { SourceChip } from "@/components/common/SourceChip";
import { DevInspector } from "@/components/common/DevInspector";
import { Reveal, Stagger } from "@/lib/motion";
import type { CompanyIntelReport } from "@/api/types";
import { streamResearch } from "@/api/research";
import { toast } from "@/store/toast";

type AgentState = "pending" | "running" | "done";

const DIMENSIONS: { icon: LucideIcon; title: string; body: string; tone: string }[] = [
  { icon: Building2, title: "Firmographics", body: "Size, industry, HQ, founding — the factual basics.", tone: "text-accent-ink bg-accent-soft" },
  { icon: Compass, title: "Overview", body: "What the company does and where it's headed.", tone: "text-blue bg-blue-soft" },
  { icon: Heart, title: "Values & culture", body: "How they describe themselves and what they prize.", tone: "text-danger bg-danger-soft" },
  { icon: Code2, title: "Tech stack", body: "Languages, frameworks, and tooling they use.", tone: "text-violet bg-violet-soft" },
  { icon: Newspaper, title: "Recent signals", body: "News, launches, and momentum worth citing.", tone: "text-gold bg-gold-soft" },
  { icon: Target, title: "Role fit", body: "How your profile maps to the job — matched & missing.", tone: "text-accent-ink bg-accent-soft" },
  { icon: MessageSquare, title: "Interview prep", body: "Likely questions and angles to prepare for.", tone: "text-blue bg-blue-soft" },
  { icon: Users, title: "Talking points", body: "Specific hooks to weave into your letter.", tone: "text-violet bg-violet-soft" },
];

export function Research() {
  const [company, setCompany] = useState("Microsoft");
  const [role, setRole] = useState("Software Engineering Intern");
  const [jd, setJd] = useState("");
  const [running, setRunning] = useState(false);
  const [states, setStates] = useState<Record<string, AgentState>>({});
  const [order, setOrder] = useState<string[]>([]);
  const [report, setReport] = useState<CompanyIntelReport | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  async function run() {
    if (!company.trim()) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setReport(null);
    setStates({});
    setOrder([]);
    setRunning(true);

    try {
      await streamResearch(
        { company_name: company, role_title: role || null, job_description: jd || null },
        (event) => {
          switch (event.type) {
            case "phase":
              setOrder((prev) => [...new Set([...prev, ...event.agents])]);
              setStates((s) => {
                const next = { ...s };
                for (const a of event.agents) next[a] ??= "pending";
                return next;
              });
              break;
            case "agent_started":
              setStates((s) => ({ ...s, [event.agent]: "running" }));
              break;
            case "agent_done":
              setStates((s) => ({ ...s, [event.agent]: "done" }));
              break;
            case "cached":
              toast.info("Loaded from cache", "This company was researched recently.");
              break;
            case "done":
              setReport(event.report);
              setRunning(false);
              break;
            case "fatal":
              toast.danger("Research failed", event.error);
              setRunning(false);
              break;
          }
        },
        controller.signal,
      );
    } catch (err) {
      if (!controller.signal.aborted) {
        toast.danger("Research failed", err instanceof Error ? err.message : "Stream error");
      }
      setRunning(false);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Apply"
        title="Company research"
        icon={Building2}
        description="Parallel agents research the company and role, streaming a detailed, source-cited report. Only the company name leaves your device."
      />

      <Card className="mb-6">
        <CardContent className="grid gap-4 pt-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Company" htmlFor="co" required>
              <Input id="co" value={company} onChange={(e) => setCompany(e.target.value)} />
            </Field>
            <Field label="Role" htmlFor="ro">
              <Input id="ro" value={role} onChange={(e) => setRole(e.target.value)} />
            </Field>
          </div>
          <Field label="Job description" htmlFor="jd" hint="Optional — improves the fit analysis">
            <Textarea id="jd" value={jd} onChange={(e) => setJd(e.target.value)} placeholder="Paste the posting…" />
          </Field>
          <div>
            <Button onClick={run} loading={running}>
              <Building2 size={16} /> Research company
            </Button>
          </div>
        </CardContent>
      </Card>

      {running && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-[14px]">Agents working…</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2">
            {order.map((a) => {
              const st = states[a] ?? "pending";
              return (
                <div key={a} className="flex items-center gap-2.5 rounded-[9px] border border-border bg-surface-2 px-3 py-2">
                  {st === "done" ? (
                    <CheckCircle2 size={15} className="text-good" />
                  ) : st === "running" ? (
                    <Loader2 size={15} className="animate-spin text-accent-ink" />
                  ) : (
                    <span className="h-[15px] w-[15px] rounded-full border-2 border-border-strong" />
                  )}
                  <span className={st === "pending" ? "text-[13px] text-text-3" : "text-[13px] text-text"}>{a}</span>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {!running && !report && (
        <section>
          <div className="mb-4 flex items-center gap-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-text-3">What we uncover</p>
            <span className="h-px flex-1 bg-line" />
            <span className="flex items-center gap-1.5 text-[12px] font-medium text-text-3">
              <TrendingUp size={14} className="text-accent-ink" /> 8 parallel agents
            </span>
          </div>
          <Stagger stagger={0.05} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {DIMENSIONS.map(({ icon: Icon, title, body, tone }) => (
              <Reveal key={title}>
                <div className="h-full rounded-[16px] border border-border bg-surface p-4 shadow-soft">
                  <span className={`mb-3 inline-grid h-10 w-10 place-items-center rounded-[11px] ${tone}`}>
                    <Icon size={19} />
                  </span>
                  <p className="text-[14px] font-bold">{title}</p>
                  <p className="mt-1 text-[12.5px] leading-snug text-text-2">{body}</p>
                </div>
              </Reveal>
            ))}
          </Stagger>
        </section>
      )}

      {report && <Report report={report} />}
    </>
  );
}

function Report({ report }: { report: CompanyIntelReport }) {
  const sections = report.sections ?? [];
  return (
    <div className="grid gap-6" style={{ animation: "cll-rise 0.4s both" }}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-[24px] font-bold">{report.company}</h2>
          {report.role && <p className="text-[14px] text-text-2">{report.role}</p>}
        </div>
        <div className="flex items-center gap-2">
          {report.from_cache && <Badge tone="neutral">From cache</Badge>}
          <Badge tone="accent">{report.completeness}% complete</Badge>
        </div>
      </div>

      {report.fit && (
        <Card>
          <CardContent className="flex flex-wrap items-center gap-5 pt-5">
            <ScoreRing value={report.fit.overall_score ?? 0} size={82} label="Fit" />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 text-[13px] font-semibold text-text">
                <Target size={14} className="text-accent-ink" /> Fit for this role
              </p>
              <p className="mt-1 text-[14px] text-text-2">{report.fit.recommendation}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {(report.fit.technical_skills?.matched ?? []).map((s) => (
                  <Badge key={s} tone="success">{s}</Badge>
                ))}
                {(report.fit.technical_skills?.missing ?? []).map((s) => (
                  <Badge key={s} tone="danger">missing: {s}</Badge>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {(report.ammo?.length ?? 0) > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-[15px]">
              <Zap size={16} className="text-gold" /> Talking points
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2">
            {report.ammo?.map((a, i) => (
              <div key={i} className="flex gap-2.5 text-[14px] text-text-2">
                <span className="font-mono text-[12px] text-accent-ink">{i + 1}</span>
                {a}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue={sections[0]?.key}>
        <TabsList className="flex-wrap">
          {sections.map((s) => (
            <TabsTrigger key={s.key} value={s.key}>{s.title}</TabsTrigger>
          ))}
        </TabsList>
        {sections.map((s) => (
          <TabsContent key={s.key} value={s.key}>
            <Card>
              <CardContent className="grid gap-3 pt-5">
                <p className="text-[14.5px] leading-relaxed text-text-2">{s.body}</p>
                {(s.bullets?.length ?? 0) > 0 && (
                  <ul className="grid gap-1.5">
                    {s.bullets?.map((b) => (
                      <li key={b} className="flex items-center gap-2 text-[13.5px] text-text-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-accent-ink" /> {b}
                      </li>
                    ))}
                  </ul>
                )}
                {(s.sources?.length ?? 0) > 0 && (
                  <div className="flex flex-wrap gap-1.5 border-t border-line pt-3">
                    <span className="font-mono text-[10.5px] uppercase tracking-wide text-text-3">Sources:</span>
                    {s.sources.map((src, i) => (
                      <SourceChip key={`${src.label}-${i}`} label={src.label} url={src.url} ok={src.ok} />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>

      <DevInspector json={report} title="Developer · view research report (JSON)" />
    </div>
  );
}

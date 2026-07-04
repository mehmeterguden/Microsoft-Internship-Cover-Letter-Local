import { useRef, useState } from "react";
import { Building2, CheckCircle2, Loader2, Target, Zap } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScoreRing } from "@/components/common/ScoreRing";
import { SourceChip } from "@/components/common/SourceChip";
import { EmptyState } from "@/components/common/EmptyState";
import { mockReport } from "@/mocks/data";
import type { CompanyIntelReport } from "@/api/types";

const AGENTS = [
  "Firmographics",
  "Overview",
  "Values",
  "Culture",
  "Tech stack",
  "Signals",
  "JD analyst",
  "Interview prep",
];

type AgentState = "pending" | "running" | "done";

export function Research() {
  const [company, setCompany] = useState("Microsoft");
  const [role, setRole] = useState("Software Engineering Intern");
  const [jd, setJd] = useState("");
  const [running, setRunning] = useState(false);
  const [states, setStates] = useState<Record<string, AgentState>>({});
  const [report, setReport] = useState<CompanyIntelReport | null>(null);
  const timers = useRef<number[]>([]);

  function run() {
    if (!company.trim()) return;
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setReport(null);
    setRunning(true);
    setStates(Object.fromEntries(AGENTS.map((a) => [a, "pending"])));

    AGENTS.forEach((agent, i) => {
      timers.current.push(
        window.setTimeout(() => setStates((s) => ({ ...s, [agent]: "running" })), 300 + i * 500),
      );
      timers.current.push(
        window.setTimeout(() => setStates((s) => ({ ...s, [agent]: "done" })), 700 + i * 500),
      );
    });
    timers.current.push(
      window.setTimeout(() => {
        setReport({ ...mockReport, company, role: role || undefined });
        setRunning(false);
      }, 700 + AGENTS.length * 500),
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Apply"
        title="Company research"
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
            {AGENTS.map((a) => {
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
        <EmptyState icon={Building2} title="No report yet" description="Enter a company and press Research." />
      )}

      {report && <Report report={report} />}
    </>
  );
}

function Report({ report }: { report: CompanyIntelReport }) {
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
            <ScoreRing value={report.fit.overall_score} size={82} label="Fit" />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 text-[13px] font-semibold text-text">
                <Target size={14} className="text-accent-ink" /> Fit for this role
              </p>
              <p className="mt-1 text-[14px] text-text-2">{report.fit.recommendation}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {report.fit.technical_skills.matched.map((s) => (
                  <Badge key={s} tone="success">{s}</Badge>
                ))}
                {report.fit.technical_skills.missing.map((s) => (
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

      <Tabs defaultValue={report.sections[0]?.key}>
        <TabsList className="flex-wrap">
          {report.sections.map((s) => (
            <TabsTrigger key={s.key} value={s.key}>{s.title}</TabsTrigger>
          ))}
        </TabsList>
        {report.sections.map((s) => (
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
                <div className="flex flex-wrap gap-1.5 border-t border-line pt-3">
                  <span className="font-mono text-[10.5px] uppercase tracking-wide text-text-3">Sources:</span>
                  {s.sources.map((src) => (
                    <SourceChip key={src.label} label={src.label} url={src.url} ok={src.ok} />
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

import { useRef, useState } from "react";
import { AudioLines, Building2, Copy, PenLine, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Textarea, Select } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/common/EmptyState";
import { StreamingText } from "@/components/common/StreamingText";
import { mockLetter } from "@/mocks/data";
import type { Tone } from "@/api/types";
import { toast } from "@/store/toast";

const TONES: { value: Tone; label: string }[] = [
  { value: "professional", label: "Professional" },
  { value: "warm", label: "Warm" },
  { value: "confident", label: "Confident" },
  { value: "concise", label: "Concise" },
];

export function Write() {
  const [company, setCompany] = useState("Microsoft");
  const [role, setRole] = useState("Software Engineering Intern");
  const [jd, setJd] = useState("");
  const [tone, setTone] = useState<Tone>("warm");
  const [text, setText] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [started, setStarted] = useState(false);
  const timers = useRef<number[]>([]);

  function generate() {
    if (!company.trim()) return;
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setStarted(true);
    setStreaming(true);
    setText("");

    // Simulate token-by-token streaming from the LLM.
    const tokens = mockLetter.match(/\s+|\S+/g) ?? [];
    let acc = "";
    tokens.forEach((tok, i) => {
      timers.current.push(
        window.setTimeout(() => {
          acc += tok;
          setText(acc);
          if (i === tokens.length - 1) setStreaming(false);
        }, i * 28),
      );
    });
  }

  const words = text.trim() ? text.trim().split(/\s+/).length : 0;

  return (
    <>
      <PageHeader
        eyebrow="Apply"
        title="Generate letter"
        description="A grounded, personalized cover letter that streams in — written in your own voice."
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,340px)_1fr]">
        <Card className="lg:sticky lg:top-10 lg:self-start">
          <CardContent className="grid gap-4 pt-5">
            <Field label="Company" htmlFor="w-co" required>
              <Input id="w-co" value={company} onChange={(e) => setCompany(e.target.value)} />
            </Field>
            <Field label="Role" htmlFor="w-ro">
              <Input id="w-ro" value={role} onChange={(e) => setRole(e.target.value)} />
            </Field>
            <Field label="Tone" htmlFor="w-tone">
              <Select id="w-tone" value={tone} onChange={(e) => setTone(e.target.value as Tone)}>
                {TONES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </Select>
            </Field>
            <Field label="Job description" htmlFor="w-jd" hint="Optional — grounds the letter">
              <Textarea id="w-jd" value={jd} onChange={(e) => setJd(e.target.value)} className="min-h-28" />
            </Field>
            <Button onClick={generate} loading={streaming}>
              {started ? <RefreshCw size={16} /> : <PenLine size={16} />}
              {started ? "Regenerate" : "Generate letter"}
            </Button>
            <div className="flex flex-wrap gap-1.5">
              <Badge tone="accent"><AudioLines size={11} /> Your voice</Badge>
              <Badge tone="blue"><Building2 size={11} /> Research applied</Badge>
            </div>
          </CardContent>
        </Card>

        <div className="min-w-0">
          {!started ? (
            <EmptyState icon={PenLine} title="Nothing generated yet" description="Fill in the role and press Generate." />
          ) : (
            <Card>
              <CardContent className="pt-6">
                <div className="mb-3 flex items-center justify-between">
                  <span className="font-mono text-[11px] uppercase tracking-wide text-text-3">
                    {streaming ? "Streaming…" : `${words} words`}
                  </span>
                  {!streaming && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        navigator.clipboard?.writeText(text);
                        toast.success("Copied to clipboard");
                      }}
                    >
                      <Copy size={14} /> Copy
                    </Button>
                  )}
                </div>
                <div className="rounded-[12px] bg-paper p-6">
                  <StreamingText text={text} streaming={streaming} />
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

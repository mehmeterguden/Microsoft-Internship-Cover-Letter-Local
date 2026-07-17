import { useState } from "react";
import { FileText, Plus, Quote, Sparkles, Trash2, Wand2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileDropzone } from "@/components/common/FileDropzone";
import { createPastLetter, deletePastLetter, learnVoice } from "@/api/style";
import { parseDocument } from "@/api/cv";
import type { PastCoverLetter, VoiceProfile } from "@/api/types";
import { toast } from "@/store/toast";
import type { StepProps } from "./types";

function Chips({ label, items, tone }: { label: string; items?: string[]; tone: "accent" | "gold" | "violet" }) {
  if (!items || items.length === 0) return null;
  return (
    <div>
      <p className="mb-1.5 font-mono text-[10.5px] font-semibold uppercase tracking-[0.1em] text-text-3">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {items.slice(0, 8).map((it) => (
          <Badge key={it} tone={tone}>
            {it}
          </Badge>
        ))}
      </div>
    </div>
  );
}

function Fingerprint({ v }: { v: VoiceProfile }) {
  return (
    <Card>
      <CardContent className="grid gap-4 pt-5">
        <div className="flex items-center gap-2">
          <Wand2 size={16} className="text-accent-ink" />
          <span className="text-[14px] font-bold text-text">What we learned</span>
          {v.llm_analyzed && <Badge tone="accent">Deep analysis</Badge>}
        </div>
        {v.tagline && <p className="text-[15px] font-bold text-accent-ink">{v.tagline}</p>}
        {v.summary && (
          <blockquote className="flex gap-3 rounded-[12px] bg-accent-soft p-3.5">
            <Quote size={16} className="shrink-0 text-accent-ink" />
            <p className="text-[13.5px] italic leading-relaxed text-text">{v.summary}</p>
          </blockquote>
        )}
        <div className="flex flex-wrap gap-2">
          {v.tone && <Badge tone="neutral">Tone · {v.tone}</Badge>}
          {v.formality && <Badge tone="neutral">Formality · {v.formality}</Badge>}
        </div>
        <Chips label="Themes they return to" items={v.themes} tone="accent" />
        <Chips label="Strengths they foreground" items={v.strengths} tone="accent" />
        <Chips label="Signature phrases" items={v.signature_phrases} tone="violet" />
      </CardContent>
    </Card>
  );
}

export function VoiceStep({ detected, onDone }: StepProps) {
  const [letters, setLetters] = useState<PastCoverLetter[]>(detected.letters);
  const [draft, setDraft] = useState("");
  const [tab, setTab] = useState("paste");
  const [adding, setAdding] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [learning, setLearning] = useState(false);
  const [voice, setVoice] = useState<VoiceProfile | null>(null);

  async function addLetter() {
    const content = draft.trim();
    if (content.length < 40) {
      toast.warning("Too short", "Paste a full letter so we can learn from it.");
      return;
    }
    setAdding(true);
    try {
      const saved = await createPastLetter({ content });
      setLetters((prev) => [saved, ...prev]);
      setDraft("");
      toast.success("Letter added");
    } catch (err) {
      toast.error(err, "Couldn't add letter");
    } finally {
      setAdding(false);
    }
  }

  async function handleFile(file: File) {
    setParsing(true);
    try {
      const res = await parseDocument(file);
      const text = (res.text ?? "").trim();
      if (text.length < 40) {
        toast.warning("Not much text", "Couldn't extract a full letter from that file.");
      } else {
        setDraft(text);
        setTab("paste");
        toast.success("Text extracted", "Review it, then add.");
      }
    } catch (err) {
      toast.error(err, "Couldn't read file");
    } finally {
      setParsing(false);
    }
  }

  async function remove(id: number | null | undefined) {
    if (id == null) return;
    try {
      await deletePastLetter(id);
      setLetters((prev) => prev.filter((l) => l.id !== id));
    } catch (err) {
      toast.error(err, "Couldn't delete");
    }
  }

  async function learn() {
    setLearning(true);
    try {
      const result = await learnVoice();
      if (result.style_profile) setVoice(result.style_profile);
      if (result.analysis_failed) {
        toast.warning(
          "Couldn't fully analyze your style",
          "The model didn't respond fully — you can try again or continue for now.",
        );
      } else {
        onDone();
        toast.success("Style learned", `Analyzed ${result.samples} letter${result.samples === 1 ? "" : "s"}.`);
      }
    } catch (err) {
      toast.error(err, "Learning failed");
    } finally {
      setLearning(false);
    }
  }

  return (
    <div className="grid gap-4" style={{ animation: "cll-rise 0.3s both" }}>
      <Card>
        <CardContent className="grid gap-3 pt-5">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="w-full">
              <TabsTrigger value="paste" className="flex-1">
                <Quote size={14} /> Paste text
              </TabsTrigger>
              <TabsTrigger value="upload" className="flex-1">
                <FileText size={14} /> Upload file
              </TabsTrigger>
            </TabsList>
            <TabsContent value="paste" className="grid gap-3">
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Paste a cover letter you're proud of…"
                className="min-h-36"
              />
              <Button onClick={addLetter} loading={adding} disabled={draft.trim().length < 40} className="justify-center">
                <Plus size={15} /> Add letter
              </Button>
            </TabsContent>
            <TabsContent value="upload">
              {parsing ? (
                <div className="flex flex-col items-center gap-3 py-10 text-center">
                  <Spinner size={28} />
                  <p className="text-[13.5px] text-text-2">Reading your file…</p>
                </div>
              ) : (
                <FileDropzone
                  accept=".pdf,.docx,.png,.jpg,.jpeg"
                  hint="PDF, DOCX or image · text is extracted locally"
                  onFile={handleFile}
                />
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {letters.length > 0 && (
        <div className="grid gap-2">
          <p className="px-1 font-mono text-[10.5px] font-semibold uppercase tracking-[0.12em] text-text-3">
            {letters.length} letter{letters.length === 1 ? "" : "s"} to learn from
          </p>
          {letters.map((l, i) => (
            <div key={l.id ?? i} className="flex items-start gap-3 rounded-[12px] border border-border bg-surface p-3">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-[8px] bg-accent-soft text-[12px] font-bold text-accent-ink">
                {i + 1}
              </span>
              <p className="min-w-0 flex-1 line-clamp-2 text-[13px] leading-relaxed text-text-2">{l.content}</p>
              <button
                type="button"
                aria-label="Remove letter"
                onClick={() => remove(l.id)}
                className="rounded-[7px] p-1.5 text-text-3 transition-colors hover:bg-danger-soft hover:text-danger"
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
          <Button onClick={learn} loading={learning} className="mt-1 justify-center">
            <Sparkles size={16} /> Learn my style
          </Button>
        </div>
      )}

      {learning && !voice && (
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <Spinner size={30} />
          <p className="text-[13.5px] text-text-2">Studying your letters — distilling tone, phrasing, and structure…</p>
        </div>
      )}

      {voice && voice.enough_signal === false ? (
        <Alert tone="warning" title="Not enough to learn a style">
          {voice.summary || "This doesn't look like real cover letters."} Add a genuine letter or two, then learn again.
        </Alert>
      ) : voice ? (
        <Fingerprint v={voice} />
      ) : letters.length === 0 ? (
        <Alert tone="info" title="Optional, but it's what makes letters sound like you">
          Add one or two past letters and we'll match their tone, phrasing, and structure. No letters yet? Skip this —
          you can teach your voice any time from the Writing Style page.
        </Alert>
      ) : null}
    </div>
  );
}

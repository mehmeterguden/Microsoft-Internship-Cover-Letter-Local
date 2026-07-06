import { useEffect, useState } from "react";
import { AudioLines, Ban, FileText, Plus, Quote, Sparkles, Trash2, Wand2 } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { AsyncBoundary } from "@/components/common/AsyncBoundary";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/common/EmptyState";
import { FileDropzone } from "@/components/common/FileDropzone";
import { DevInspector } from "@/components/common/DevInspector";
import { RatingInput } from "@/components/common/RatingInput";
import type { PastCoverLetter, VoiceProfile } from "@/api/types";
import {
  createPastLetter,
  deletePastLetter,
  getStyle,
  learnVoice,
  listPastLetters,
  updatePastLetter,
} from "@/api/style";
import { parseDocument } from "@/api/cv";
import { errorMessage } from "@/api/client";
import { useAsync } from "@/lib/useAsync";
import { toast } from "@/store/toast";

function ChipRow({ label, items, tone }: { label: string; items: string[]; tone: "accent" | "gold" | "danger" | "violet" }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="mb-1.5 font-mono text-[10.5px] font-semibold uppercase tracking-[0.1em] text-text-3">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {items.map((it) => (
          <Badge key={it} tone={tone}>{it}</Badge>
        ))}
      </div>
    </div>
  );
}

function Trait({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="grid grid-cols-[130px_1fr] gap-3 border-b border-line py-2.5 last:border-0">
      <span className="font-mono text-[11px] font-semibold uppercase tracking-wide text-text-3">{label}</span>
      <span className="text-[13.5px] text-text-2">{value}</span>
    </div>
  );
}

function VoiceFingerprint({ v }: { v: VoiceProfile }) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Wand2 size={16} className="text-accent-ink" /> Your voice fingerprint
        </CardTitle>
        {v.llm_analyzed && <Badge tone="accent">Deep analysis</Badge>}
      </CardHeader>
      <CardContent className="grid gap-5">
        {v.summary && (
          <blockquote className="flex gap-3 rounded-[12px] bg-accent-soft p-4">
            <Quote size={18} className="shrink-0 text-accent-ink" />
            <p className="text-[14.5px] italic leading-relaxed text-text">{v.summary}</p>
          </blockquote>
        )}
        <div>
          <Trait label="Self-image" value={v.self_presentation} />
          <Trait label="Tone" value={v.tone} />
          <Trait label="Sentences" value={v.sentence_patterns} />
          <Trait label="Argument" value={v.rhetorical_moves} />
          <Trait label="Opens" value={v.opening_habits} />
          <Trait label="Closes" value={v.closing_habits} />
        </div>
        <ChipRow label="Emphasizes" items={v.emphasis ?? []} tone="accent" />
        <ChipRow label="Signature phrases" items={v.signature_phrases ?? []} tone="violet" />
        <ChipRow label="Favored vocabulary" items={v.vocabulary ?? []} tone="gold" />
        {(v.avoid?.length ?? 0) > 0 && (
          <div>
            <p className="mb-1.5 flex items-center gap-1 font-mono text-[10.5px] font-semibold uppercase tracking-[0.1em] text-text-3">
              <Ban size={11} /> Never uses
            </p>
            <div className="flex flex-wrap gap-1.5">
              {v.avoid?.map((a) => <Badge key={a} tone="danger">{a}</Badge>)}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function Voice() {
  const loaded = useAsync(
    async () => {
      const [style, letters] = await Promise.all([getStyle(), listPastLetters()]);
      return { style, letters };
    },
    [],
  );

  const [letters, setLetters] = useState<PastCoverLetter[]>([]);
  const [draft, setDraft] = useState("");
  const [tab, setTab] = useState("paste");
  const [adding, setAdding] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [learning, setLearning] = useState(false);
  const [voice, setVoice] = useState<VoiceProfile | null>(null);

  useEffect(() => {
    if (loaded.data) {
      setLetters(loaded.data.letters);
      setVoice(loaded.data.style.style_profile);
    }
  }, [loaded.data]);

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
      toast.danger("Couldn't add letter", errorMessage(err));
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
        toast.success("Text extracted", "Review it below, then add.");
      }
    } catch (err) {
      toast.danger("Couldn't read file", errorMessage(err));
    } finally {
      setParsing(false);
    }
  }

  async function rate(letter: PastCoverLetter, value: number) {
    if (letter.id == null) return;
    setLetters((prev) => prev.map((x) => (x.id === letter.id ? { ...x, user_rating: value } : x)));
    try {
      await updatePastLetter(letter.id, { ...letter, user_rating: value });
    } catch (err) {
      toast.danger("Couldn't save rating", errorMessage(err));
    }
  }

  async function remove(id: number) {
    try {
      await deletePastLetter(id);
      setLetters((prev) => prev.filter((x) => x.id !== id));
    } catch (err) {
      toast.danger("Couldn't delete", errorMessage(err));
    }
  }

  async function learn() {
    setLearning(true);
    try {
      const result = await learnVoice();
      setVoice(result.style_profile);
      toast.success("Voice learned", `Analyzed ${result.samples} letters.`);
    } catch (err) {
      toast.danger("Learning failed", errorMessage(err));
    } finally {
      setLearning(false);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Build your profile"
        title="Writing voice"
        icon={AudioLines}
        description="Add letters you've written. We reverse-engineer how you write and think, so new letters read as if you wrote them."
        actions={
          <Button onClick={learn} loading={learning} disabled={letters.length === 0}>
            <Sparkles size={16} /> Learn my voice
          </Button>
        }
      />

      <AsyncBoundary loading={loaded.loading} error={loaded.error} onRetry={loaded.reload}>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="grid gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Add a past cover letter</CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs value={tab} onValueChange={setTab}>
                <TabsList className="w-full">
                  <TabsTrigger value="paste" className="flex-1"><Quote size={14} /> Paste text</TabsTrigger>
                  <TabsTrigger value="upload" className="flex-1"><FileText size={14} /> Upload PDF</TabsTrigger>
                </TabsList>

                <TabsContent value="paste" className="grid gap-3">
                  <Textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="Paste a cover letter you're proud of…"
                    className="min-h-40"
                  />
                  <Button onClick={addLetter} loading={adding} disabled={draft.trim().length < 40} className="justify-center">
                    <Plus size={15} /> Add letter
                  </Button>
                </TabsContent>

                <TabsContent value="upload">
                  {parsing ? (
                    <div className="flex flex-col items-center gap-3 py-10 text-center">
                      <Spinner size={30} />
                      <p className="text-[13.5px] text-text-2">Reading your file…</p>
                    </div>
                  ) : (
                    <FileDropzone
                      accept=".pdf,.docx,.png,.jpg,.jpeg"
                      hint="PDF, DOCX or image · we extract the text locally"
                      onFile={handleFile}
                    />
                  )}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          {letters.length > 0 && (
            <p className="px-1 text-[12px] font-semibold uppercase tracking-wide text-text-3">
              {letters.length} letter{letters.length > 1 ? "s" : ""}
            </p>
          )}

          {letters.length === 0 ? (
            <EmptyState icon={Quote} title="No letters yet" description="Paste or upload at least one to learn your voice." />
          ) : (
            letters.map((l) => (
              <Card key={l.id} hoverable>
                <CardContent className="pt-5">
                  <p className="line-clamp-3 whitespace-pre-wrap text-[13.5px] leading-relaxed text-text-2">{l.content}</p>
                  <div className="mt-3 flex items-center justify-between border-t border-line pt-3">
                    <span className="flex items-center gap-2 text-[12px] text-text-3">
                      Your rating <RatingInput value={l.user_rating ?? 0} onChange={(v) => rate(l, v)} />
                    </span>
                    <button
                      type="button"
                      aria-label="Delete letter"
                      onClick={() => l.id != null && remove(l.id)}
                      className="rounded-[7px] p-1.5 text-text-3 transition-colors hover:bg-danger-soft hover:text-danger"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        <div>
          {learning ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
                <Spinner size={34} />
                <p className="text-[14px] text-text-2">Studying your letters…</p>
              </CardContent>
            </Card>
          ) : voice ? (
            <VoiceFingerprint v={voice} />
          ) : (
            <EmptyState
              icon={Wand2}
              title="No voice learned yet"
              description="Add letters and press “Learn my voice” to see your fingerprint."
            />
          )}
          {voice && (
            <Alert tone="info" className="mt-4">
              This fingerprint guides every letter you generate, so they sound like you.
            </Alert>
          )}
          {voice && <DevInspector json={voice} title="Developer · view voice profile (JSON)" />}
        </div>
      </div>
      </AsyncBoundary>
    </>
  );
}

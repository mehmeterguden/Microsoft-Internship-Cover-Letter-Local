import { useEffect, useState } from "react";
import { AlignLeft, Ban, BookOpen, Database, Expand, FileText, Fingerprint, Plus, Quote, Sparkles, Target, Trash2, Wand2 } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { AsyncBoundary } from "@/components/common/AsyncBoundary";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ModelUnavailableDialog } from "@/components/settings/ModelUnavailableDialog";
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
import { useAsync } from "@/lib/useAsync";
import { cn } from "@/lib/utils";
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

function VoiceFingerprint({ v, letters, embeddings }: { v: VoiceProfile; letters: number; embeddings: boolean }) {
  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2">
          <Wand2 size={16} className="text-accent-ink" /> What we learned
        </CardTitle>
        <div className="flex flex-wrap gap-1.5">
          <Badge tone="neutral">{letters} letter{letters === 1 ? "" : "s"}</Badge>
          {v.llm_analyzed && <Badge tone="accent">Deep analysis</Badge>}
          {embeddings && <Badge tone="violet"><Database size={11} /> RAG on</Badge>}
        </div>
      </CardHeader>
      <CardContent className="grid gap-5">
        {v.tagline && (
          <p className="text-[15px] font-bold text-accent-ink">{v.tagline}</p>
        )}
        {v.summary && (
          <blockquote className="flex gap-3 rounded-[12px] bg-accent-soft p-4">
            <Quote size={18} className="shrink-0 text-accent-ink" />
            <p className="text-[14.5px] italic leading-relaxed text-text">{v.summary}</p>
          </blockquote>
        )}

        <div>
          <Trait label="Self-image" value={v.self_presentation} />
          <Trait label="Tone" value={v.tone} />
          <Trait label="Formality" value={v.formality} />
          <Trait label="Structure" value={v.structure} />
          <Trait label="Sentences" value={v.sentence_patterns} />
          <Trait label="Argument" value={v.rhetorical_moves} />
          <Trait label="Opens" value={v.opening_habits} />
          <Trait label="Closes" value={v.closing_habits} />
        </div>

        <ChipRow label="Themes they return to" items={v.themes ?? []} tone="accent" />
        <ChipRow label="Strengths they foreground" items={v.strengths ?? []} tone="accent" />
        <ChipRow label="Emphasizes" items={v.emphasis ?? []} tone="gold" />
        <ChipRow label="Signature phrases" items={v.signature_phrases ?? []} tone="violet" />
        <ChipRow label="Favored vocabulary" items={v.vocabulary ?? []} tone="gold" />

        {(v.example_sentences?.length ?? 0) > 0 && (
          <div>
            <p className="mb-1.5 font-mono text-[10.5px] font-semibold uppercase tracking-[0.1em] text-text-3">
              Signature sentences (verbatim)
            </p>
            <div className="grid gap-2">
              {v.example_sentences!.map((s) => (
                <p key={s} className="border-l-2 border-accent bg-surface-2 px-3 py-2 text-[13px] italic leading-relaxed text-text-2">“{s}”</p>
              ))}
            </div>
          </div>
        )}

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

/** One saved letter: a preview card; "Read full letter" opens it in a centered dialog. */
function PastLetterCard({
  index,
  letter,
  onRate,
  onRemove,
}: {
  index: number;
  letter: PastCoverLetter;
  onRate: (value: number) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const content = letter.content ?? "";
  const words = content.trim() ? content.trim().split(/\s+/).length : 0;
  // Only offer the full-view when there's meaningfully more than the preview shows.
  const isLong = content.length > 320 || content.split("\n").length > 6;

  return (
    <>
      <Card hoverable>
        <CardContent className="grid gap-3 pt-5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-[8px] bg-accent-soft text-[12px] font-bold text-accent-ink">
                {index}
              </span>
              <span className="text-[13px] font-semibold text-text">Cover letter</span>
              <span className="text-[12px] text-text-3">· {words} words</span>
            </div>
            {letter.ai_rating != null && <Badge tone="neutral">AI {letter.ai_rating}/5</Badge>}
          </div>

          <p className={cn("whitespace-pre-wrap text-[13.5px] leading-relaxed text-text-2", isLong && "line-clamp-6")}>
            {content}
          </p>

          <div className="flex items-center justify-between gap-2 border-t border-line pt-3">
            {isLong ? (
              <button
                type="button"
                onClick={() => setOpen(true)}
                className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-accent-ink transition-colors hover:text-accent"
              >
                <Expand size={14} /> Read full letter
              </button>
            ) : (
              <span />
            )}
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-2 text-[12px] text-text-3">
                Your rating <RatingInput value={letter.user_rating ?? 0} onChange={onRate} />
              </span>
              <button
                type="button"
                aria-label="Delete letter"
                onClick={onRemove}
                className="rounded-[7px] p-1.5 text-text-3 transition-colors hover:bg-danger-soft hover:text-danger"
              >
                <Trash2 size={15} />
              </button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Centered modal with the full letter, scrollable for long ones. */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-[min(94vw,760px)]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Quote size={18} className="text-accent-ink" /> Cover letter {index}
            </DialogTitle>
            <p className="text-[12.5px] text-text-3">
              {words} words{letter.ai_rating != null ? ` · AI rated ${letter.ai_rating}/5` : ""}
            </p>
          </DialogHeader>
          <div className="max-h-[70vh] overflow-auto rounded-[12px] border border-line bg-surface-2 p-5">
            <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-text">{content}</p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// The traits we distil from the letters — shown as a preview before anything is
// learned, so the page tells its own story even when empty.
const LEARN_DIMENSIONS: { icon: typeof Quote; label: string; desc: string }[] = [
  { icon: Quote, label: "Tone & formality", desc: "Warm, confident, or formal — how you come across" },
  { icon: Sparkles, label: "Signature phrases", desc: "The exact lines you reach for again and again" },
  { icon: Target, label: "Themes & strengths", desc: "What you keep returning to and foreground" },
  { icon: BookOpen, label: "Vocabulary", desc: "The words and turns of phrase you favor" },
  { icon: AlignLeft, label: "Structure", desc: "How you open, build the case, and close" },
  { icon: Ban, label: "What you avoid", desc: "Clichés and words you never use" },
];

/** A calm grid of the traits we'll learn — `dim` for the not-yet-learned teaser. */
function LearnPreview({ dim = false }: { dim?: boolean }) {
  return (
    <div className={cn("grid gap-3 sm:grid-cols-2", dim && "opacity-80")}>
      {LEARN_DIMENSIONS.map(({ icon: Icon, label, desc }) => (
        <div key={label} className="flex items-start gap-3 rounded-[13px] border border-border bg-surface p-3.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-accent-soft text-accent-ink">
            <Icon size={17} />
          </span>
          <div className="min-w-0">
            <p className="text-[13.5px] font-semibold text-text">{label}</p>
            <p className="mt-0.5 text-[12px] leading-snug text-text-3">{desc}</p>
          </div>
        </div>
      ))}
    </div>
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
  const [tab, setTab] = useState("upload");
  const [adding, setAdding] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [learning, setLearning] = useState(false);
  const [voice, setVoice] = useState<VoiceProfile | null>(null);
  const [modelDialog, setModelDialog] = useState<{ open: boolean; model: string }>({ open: false, model: "" });
  const embeddingsOn = loaded.data?.style.embeddings_available ?? false;

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
        toast.success("Text extracted", "Review it below, then add.");
      }
    } catch (err) {
      toast.error(err, "Couldn't read file");
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
      toast.error(err, "Couldn't save rating");
    }
  }

  async function remove(id: number) {
    try {
      await deletePastLetter(id);
      setLetters((prev) => prev.filter((x) => x.id !== id));
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
        if (result.suggest_model_switch) {
          // The model itself is unavailable — offer to switch models and retry.
          setModelDialog({ open: true, model: result.model ?? "" });
        } else {
          toast.warning(
            "Couldn't analyze your style",
            result.llm_analyzed
              ? "The model didn't respond, so we kept your previous profile. Please try again."
              : "The model didn't respond fully — only basic metrics were saved. Please try again.",
          );
        }
      } else {
        toast.success("Style learned", `Analyzed ${result.samples} letters.`);
      }
    } catch (err) {
      toast.error(err, "Learning failed");
    } finally {
      setLearning(false);
    }
  }

  const addPanel = (
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList className="w-full">
        <TabsTrigger value="upload" className="flex-1"><FileText size={14} /> Upload PDF</TabsTrigger>
        <TabsTrigger value="paste" className="flex-1"><Quote size={14} /> Paste text</TabsTrigger>
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
  );

  return (
    <>
      <PageHeader
        eyebrow="Build your profile"
        title="Writing style"
        icon={Fingerprint}
        description="Add a few cover letters you've written. We learn how you write — your tone, phrasing, and structure — so new letters sound like you."
        actions={
          <Button onClick={learn} loading={learning} disabled={letters.length === 0}>
            <Sparkles size={16} /> Learn my style
          </Button>
        }
      />

      <AsyncBoundary loading={loaded.loading} error={loaded.error} onRetry={loaded.reload}>
        {letters.length === 0 ? (
          // ── First run: an inviting onboarding, not two empty boxes ──
          <div className="mx-auto grid max-w-3xl gap-6">
            <Card>
              <CardContent className="grid gap-6 pt-6">
                <div className="flex flex-col items-center gap-2 text-center">
                  <span className="grid h-14 w-14 place-items-center rounded-[16px] bg-accent-soft text-accent-ink">
                    <Fingerprint size={26} />
                  </span>
                  <h2 className="text-[20px] font-bold text-text">Teach the AI how you write</h2>
                  <p className="max-w-md text-[13.5px] leading-relaxed text-text-2">
                    Paste or upload one or two cover letters you're proud of. We study your style and reuse
                    it — everything stays on your device.
                  </p>
                </div>
                {addPanel}
              </CardContent>
            </Card>
            <div>
              <p className="mb-3 flex items-center gap-1.5 font-mono text-[10.5px] font-semibold uppercase tracking-[0.12em] text-text-3">
                <Sparkles size={12} /> What we'll learn from them
              </p>
              <LearnPreview dim />
            </div>
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Left: add + manage the letters we learn from */}
            <div className="grid gap-4">
              <Card>
                <CardHeader>
                  <CardTitle>Add a cover letter</CardTitle>
                </CardHeader>
                <CardContent>{addPanel}</CardContent>
              </Card>

              <p className="px-1 text-[12px] font-semibold uppercase tracking-wide text-text-3">
                {letters.length} letter{letters.length > 1 ? "s" : ""}
              </p>
              {letters.map((l, i) => (
                <PastLetterCard
                  key={l.id}
                  index={i + 1}
                  letter={l}
                  onRate={(v) => rate(l, v)}
                  onRemove={() => l.id != null && remove(l.id)}
                />
              ))}
            </div>

            {/* Right: the fingerprint — or the state on the way to it */}
            <div className="grid gap-4">
              {learning ? (
                <Card>
                  <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
                    <Spinner size={34} />
                    <p className="text-[14px] text-text-2">Studying your letters…</p>
                    <p className="text-[12.5px] text-text-3">Distilling tone, phrasing, and structure.</p>
                  </CardContent>
                </Card>
              ) : voice && voice.enough_signal === false ? (
                <Card>
                  <CardContent className="pt-5">
                    <Alert tone="warning" title="Not enough to learn a style">
                      {voice.summary || "This text doesn't look like real cover letters."} Add a couple of
                      genuine letters (paste or upload a PDF), then press “Learn my style” again.
                    </Alert>
                  </CardContent>
                </Card>
              ) : voice ? (
                <>
                  <VoiceFingerprint v={voice} letters={letters.length} embeddings={embeddingsOn} />
                  <Alert tone="info" title="How this is used">
                    Every letter you generate is guided by this fingerprint, and — with RAG — your most
                    relevant past passages are retrieved from a local vector store and woven in, so new
                    letters read like you. All on your device.
                  </Alert>
                  <DevInspector json={voice} title="Developer · view style profile (JSON)" />
                </>
              ) : (
                // Has letters, nothing learned yet — a real CTA, not an empty box.
                <Card>
                  <CardContent className="grid gap-5 pt-6">
                    <div className="flex flex-col items-center gap-2 text-center">
                      <span className="grid h-12 w-12 place-items-center rounded-[14px] bg-accent-soft text-accent-ink">
                        <Wand2 size={22} />
                      </span>
                      <h3 className="text-[17px] font-bold text-text">Ready to learn your style</h3>
                      <p className="max-w-sm text-[13px] leading-relaxed text-text-2">
                        You've added {letters.length} letter{letters.length > 1 ? "s" : ""}. Analyze{" "}
                        {letters.length > 1 ? "them" : "it"} to build your writing fingerprint.
                      </p>
                    </div>
                    <Button onClick={learn} loading={learning} className="justify-center">
                      <Sparkles size={16} /> Learn my style
                    </Button>
                    <div className="border-t border-line pt-4">
                      <p className="mb-3 font-mono text-[10.5px] font-semibold uppercase tracking-[0.12em] text-text-3">
                        What you'll get
                      </p>
                      <LearnPreview dim />
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        )}
      </AsyncBoundary>

      <ModelUnavailableDialog
        open={modelDialog.open}
        onOpenChange={(o) => setModelDialog((prev) => ({ ...prev, open: o }))}
        currentModel={modelDialog.model}
        onSwitched={() => void learn()}
      />
    </>
  );
}

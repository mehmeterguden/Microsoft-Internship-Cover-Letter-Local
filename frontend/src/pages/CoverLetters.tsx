import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Check, CircleDot, FileText, PenLine, Plus, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { AsyncBoundary } from "@/components/common/AsyncBoundary";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/common/EmptyState";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { deleteJob, listJobs, updateJob } from "@/api/jobs";
import { useAsync } from "@/lib/useAsync";
import { toast } from "@/store/toast";
import type { Job } from "@/api/types";

/** First line / short preview of a saved letter's text. */
function snippet(text?: string): string {
  const clean = (text ?? "").replace(/\s+/g, " ").trim();
  return clean.length > 160 ? `${clean.slice(0, 160)}…` : clean;
}

export function CoverLetters() {
  const loaded = useAsync(listJobs, []);
  const navigate = useNavigate();
  const jobs = loaded.data ?? [];
  const [pendingDelete, setPendingDelete] = useState<Job | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const drafts = jobs.filter((j) => !j.letter?.completed);
  const completed = jobs.filter((j) => j.letter?.completed);

  async function toggleCompleted(job: Job) {
    if (job.id == null) return;
    setBusyId(job.id);
    const next = !job.letter?.completed;
    try {
      await updateJob(job.id, { ...job, letter: { ...(job.letter ?? {}), completed: next } });
      toast.success(next ? "Marked as completed" : "Moved back to draft");
      loaded.reload();
    } catch (err) {
      toast.error(err, "Couldn't update");
    } finally {
      setBusyId(null);
    }
  }

  async function confirmDelete() {
    if (pendingDelete?.id == null) return;
    setDeleting(true);
    try {
      await deleteJob(pendingDelete.id);
      toast.success("Cover letter deleted");
      setPendingDelete(null);
      loaded.reload();
    } catch (err) {
      toast.error(err, "Couldn't delete");
    } finally {
      setDeleting(false);
    }
  }

  function LetterCard({ job }: { job: Job }) {
    const done = Boolean(job.letter?.completed);
    return (
      <Card>
        <CardContent className="grid gap-3 pt-5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-[15px] font-bold text-text">{job.company}</p>
              <p className="truncate text-[13px] text-text-2">{job.role}</p>
            </div>
            <Badge tone={done ? "success" : "neutral"}>{done ? "Completed" : "Draft"}</Badge>
          </div>

          <p className="min-h-[3.2em] text-[13px] leading-snug text-text-2">
            {snippet(job.letter?.text) || <span className="text-text-3">No text yet.</span>}
          </p>

          <div className="flex items-center gap-1 border-t border-line pt-3">
            <Button size="sm" variant="ghost" onClick={() => navigate(`/write?job=${job.id}`)}>
              <PenLine size={14} /> Open
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => toggleCompleted(job)}
              loading={busyId === job.id}
            >
              {done ? <><CircleDot size={14} /> Draft</> : <><Check size={14} /> Complete</>}
            </Button>
            <button
              type="button"
              aria-label="Delete cover letter"
              onClick={() => setPendingDelete(job)}
              className="ml-auto rounded-[8px] p-2 text-text-3 transition-colors hover:bg-danger-soft hover:text-danger"
            >
              <Trash2 size={15} />
            </button>
          </div>
        </CardContent>
      </Card>
    );
  }

  function Group({ title, items }: { title: string; items: Job[] }) {
    if (items.length === 0) return null;
    return (
      <section className="grid gap-3">
        <div className="flex items-center gap-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-text-3">{title}</p>
          <Badge tone="neutral">{items.length}</Badge>
          <span className="h-px flex-1 bg-line" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((j) => <LetterCard key={j.id} job={j} />)}
        </div>
      </section>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Write & apply"
        title="Cover letters"
        icon={FileText}
        description="Every letter you've saved — drafts you're still working on and the ones you've marked completed."
        actions={
          <Button asChild>
            <Link to="/write"><Plus size={16} /> New cover letter</Link>
          </Button>
        }
      />

      <AsyncBoundary loading={loaded.loading} error={loaded.error} onRetry={loaded.reload}>
        {jobs.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No cover letters yet"
            description="Generate a letter and save it — it'll show up here as a draft."
            action={<Button asChild><Link to="/write">Write a letter</Link></Button>}
          />
        ) : (
          <div className="grid gap-8">
            <Group title="Drafts" items={drafts} />
            <Group title="Completed" items={completed} />
          </div>
        )}
      </AsyncBoundary>

      <ConfirmDialog
        open={pendingDelete != null}
        onOpenChange={(o) => !o && setPendingDelete(null)}
        title="Delete this cover letter?"
        description={pendingDelete ? `${pendingDelete.company} · ${pendingDelete.role}` : ""}
        destructive
        confirmLabel="Delete"
        loading={deleting}
        onConfirm={confirmDelete}
      />
    </>
  );
}

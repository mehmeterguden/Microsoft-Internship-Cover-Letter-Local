import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { LayoutGrid, PenLine, Plus, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { AsyncBoundary } from "@/components/common/AsyncBoundary";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { EmptyState } from "@/components/common/EmptyState";
import { StatusBadge, type JobStatus } from "@/components/common/StatusBadge";
import { ScoreRing } from "@/components/common/ScoreRing";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { deleteJob, listJobs } from "@/api/jobs";
import { errorMessage } from "@/api/client";
import { useAsync } from "@/lib/useAsync";
import { toast } from "@/store/toast";
import type { Job } from "@/api/types";

const STATS: { label: string; key: JobStatus }[] = [
  { label: "Draft", key: "draft" },
  { label: "Sent", key: "sent" },
  { label: "Interview", key: "interview" },
  { label: "Offer", key: "offer" },
];

export function Applications() {
  const loaded = useAsync(listJobs, []);
  const navigate = useNavigate();
  const jobs = loaded.data ?? [];
  const [pendingDelete, setPendingDelete] = useState<Job | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function confirmDelete() {
    if (pendingDelete?.id == null) return;
    setDeleting(true);
    try {
      await deleteJob(pendingDelete.id);
      toast.success("Application deleted");
      setPendingDelete(null);
      loaded.reload();
    } catch (err) {
      toast.danger("Couldn't delete", errorMessage(err));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Apply"
        title="Applications"
        icon={LayoutGrid}
        description="Every role you're pursuing — match scores, statuses, and the letters you've saved."
        actions={
          <Button asChild>
            <Link to="/write"><Plus size={16} /> New application</Link>
          </Button>
        }
      />

      <AsyncBoundary loading={loaded.loading} error={loaded.error} onRetry={loaded.reload}>
        {jobs.length === 0 ? (
          <EmptyState
            icon={LayoutGrid}
            title="No applications yet"
            description="Generate a cover letter and save it to start tracking your applications."
            action={<Button asChild><Link to="/write">Write a letter</Link></Button>}
          />
        ) : (
          <div className="grid gap-6">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {STATS.map((s) => (
                <Card key={s.key}>
                  <CardContent className="pt-5">
                    <p className="text-[12px] font-semibold uppercase tracking-wide text-text-3">{s.label}</p>
                    <p className="mt-1 font-display text-[28px] font-extrabold text-text">
                      {jobs.filter((j) => j.status === s.key).length}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Table>
              <THead>
                <TR>
                  <TH>Company</TH>
                  <TH>Role</TH>
                  <TH>Status</TH>
                  <TH className="text-right">Match</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {jobs.map((j) => (
                  <TR key={j.id}>
                    <TD className="font-semibold text-text">{j.company}</TD>
                    <TD>{j.role}</TD>
                    <TD><StatusBadge status={j.status} /></TD>
                    <TD>
                      <div className="flex justify-end">
                        {j.match_score != null ? <ScoreRing value={j.match_score} size={44} /> : <span className="text-text-3">—</span>}
                      </div>
                    </TD>
                    <TD>
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => navigate(`/write?job=${j.id}`)}>
                          <PenLine size={14} /> Open
                        </Button>
                        <button
                          type="button"
                          aria-label="Delete application"
                          onClick={() => setPendingDelete(j)}
                          className="rounded-[8px] p-2 text-text-3 transition-colors hover:bg-danger-soft hover:text-danger"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        )}
      </AsyncBoundary>

      <ConfirmDialog
        open={pendingDelete != null}
        onOpenChange={(o) => !o && setPendingDelete(null)}
        title="Delete this application?"
        description={pendingDelete ? `${pendingDelete.company} · ${pendingDelete.role}` : ""}
        destructive
        confirmLabel="Delete"
        loading={deleting}
        onConfirm={confirmDelete}
      />
    </>
  );
}

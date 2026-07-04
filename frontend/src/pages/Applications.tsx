import { useState } from "react";
import { Link } from "react-router-dom";
import { LayoutGrid, PenLine, Plus } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { EmptyState } from "@/components/common/EmptyState";
import { StatusBadge, type JobStatus } from "@/components/common/StatusBadge";
import { ScoreRing } from "@/components/common/ScoreRing";
import { mockJobs } from "@/mocks/data";

const STATS: { label: string; key: JobStatus }[] = [
  { label: "Draft", key: "draft" },
  { label: "Sent", key: "sent" },
  { label: "Interview", key: "interview" },
  { label: "Offer", key: "offer" },
];

export function Applications() {
  const [jobs] = useState(mockJobs);

  return (
    <>
      <PageHeader
        eyebrow="Apply"
        title="Applications"
        description="Every role you're pursuing — match scores, statuses, and the letters you've generated."
        actions={
          <Button asChild>
            <Link to="/write"><Plus size={16} /> New application</Link>
          </Button>
        }
      />

      {jobs.length === 0 ? (
        <EmptyState
          icon={LayoutGrid}
          title="No applications yet"
          description="Generate your first cover letter to start tracking."
          action={<Button asChild><Link to="/write">Write a letter</Link></Button>}
        />
      ) : (
        <div className="grid gap-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {STATS.map((s) => (
              <Card key={s.key}>
                <CardContent className="pt-5">
                  <p className="font-mono text-[11px] uppercase tracking-wide text-text-3">{s.label}</p>
                  <p className="mt-1 font-display text-[28px] font-bold text-text">
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
                <TH className="text-right">Letter</TH>
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
                      <ScoreRing value={j.match_score ?? 0} size={44} />
                    </div>
                  </TD>
                  <TD>
                    <div className="flex justify-end">
                      <Button size="sm" variant="ghost" asChild>
                        <Link to="/write"><PenLine size={14} /> Open</Link>
                      </Button>
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      )}
    </>
  );
}

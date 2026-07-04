import { Badge, type BadgeProps } from "@/components/ui/badge";

/** Maps a Job status to a colored badge tone. Mirrors backend JobStatus. */
export type JobStatus = "draft" | "sent" | "interview" | "rejected" | "offer";

const STATUS_TONE: Record<JobStatus, NonNullable<BadgeProps["tone"]>> = {
  draft: "neutral",
  sent: "blue",
  interview: "gold",
  rejected: "danger",
  offer: "success",
};

const STATUS_LABEL: Record<JobStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  interview: "Interview",
  rejected: "Rejected",
  offer: "Offer",
};

export function StatusBadge({ status }: { status: JobStatus }) {
  return <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>;
}

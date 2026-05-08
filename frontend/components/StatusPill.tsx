// Tiny color-coded status indicator for job rows.

import type { JobStatus } from "@/lib/jobs";
import { STATUS_LABELS } from "@/lib/jobs";

const STYLES: Record<JobStatus, string> = {
  draft: "bg-muted-100 text-muted-600",
  open_for_signup: "bg-accent-muted text-accent",
  in_progress: "bg-amber-100 text-amber-700",
  delivered: "bg-green-100 text-green-700",
  archived: "bg-muted-100 text-muted-400",
};

export function StatusPill({ status }: { status: JobStatus }) {
  return (
    <span
      className={
        "inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium " +
        STYLES[status]
      }
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

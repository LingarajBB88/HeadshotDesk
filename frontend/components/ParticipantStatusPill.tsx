// Small at-a-glance status indicator for a participant on the dashboard.

import type { Participant } from "@/lib/participants";

export function ParticipantStatusPill({ p }: { p: Participant }) {
  // The most useful summary in one badge:
  //   - "N photos" (green) if any photos uploaded for them
  //   - "Shot" (blue) if marked shot but no photos yet
  //   - "Pending" (gray) otherwise
  if (p.photo_count > 0) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-green-100 text-green-700">
        {p.photo_count} {p.photo_count === 1 ? "photo" : "photos"}
      </span>
    );
  }
  if (p.shot_at) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-accent-muted text-accent">
        Shot
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-muted-100 text-muted-600">
      Pending
    </span>
  );
}

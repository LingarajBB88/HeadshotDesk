// Jobs API client.

import { api } from "./api";
import { getAccessToken } from "./auth";

export type ShootMode = "queue" | "time_slot";

export type SlotBreak = { start: string; end: string };

export type TimeSlotConfig = {
  start: string;         // "09:00"
  end: string;           // "17:00"
  slot_minutes: number;
  buffer_minutes: number;
  breaks: SlotBreak[];
  /** Individually removed slots (HH:MM start times). */
  blocked?: string[];
  /** One-off slots outside the grid, any length. */
  extra?: { start: string; minutes: number }[];
  /** HSD-71: per-day settings for multi-day shoots, keyed by ISO date.
   *  A day without an entry uses the base settings above. */
  day_overrides?: Record<string, DayConfig>;
};

export type DayConfig = {
  start: string;
  end: string;
  slot_minutes: number;
  buffer_minutes: number;
  breaks: SlotBreak[];
};

export type ScheduleEntry = {
  slot_start: string;
  slot_end: string;
  participant_id: string;
  participant_name: string;
  shot: boolean;
};

export type JobStatus =
  | "draft"
  | "open_for_signup"
  | "in_progress"
  | "delivered"
  | "archived";

export type Job = {
  id: string;
  public_slug: string;
  name: string;
  client_name: string | null;
  client_email: string | null;
  shoot_date: string | null;
  /** HSD-71: additional days when the shoot spans more than one date. */
  extra_shoot_dates: string[] | null;
  location: string | null;
  status: JobStatus;
  // F5b.1: per-job hard cap on unique photos each participant can download
  // from their /g/{token} gallery. 0 disables downloads entirely.
  download_cap: number;
  // HSD-55: how shoot day runs.
  shoot_mode: ShootMode;
  time_slot_config: TimeSlotConfig | null;
  // HSD-67: null until the client dashboard is shared.
  client_token: string | null;
  // HSD-36: linked Client entity (branding owner), when set.
  client_id: string | null;
  // F5b.2: participant favorites — off by default; cap 0 = unlimited.
  picks_enabled: boolean;
  pick_cap: number;
  /** Whether participants may move their own booked time. Off unless the
   *  photographer turns it on. */
  allow_reschedule: boolean;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

export type JobListItem = {
  id: string;
  public_slug: string;
  name: string;
  client_name: string | null;
  shoot_date: string | null;
  status: JobStatus;
  created_at: string;
};

export type JobList = {
  items: JobListItem[];
  total: number;
};

function authToken(): string {
  const t = getAccessToken();
  if (!t) throw new Error("Not authenticated");
  return t;
}

export async function listJobs(opts: { includeArchived?: boolean } = {}): Promise<JobList> {
  const qs = opts.includeArchived ? "?include_archived=true" : "";
  return api<JobList>(`/api/v1/jobs${qs}`, { token: authToken() });
}

export async function getJob(id: string): Promise<Job> {
  return api<Job>(`/api/v1/jobs/${id}`, { token: authToken() });
}

export async function createJob(input: {
  name: string;
  client_name?: string | null;
  client_email?: string | null;
  shoot_date?: string | null;
  location?: string | null;
  download_cap?: number | null;
  shoot_mode?: ShootMode;
  // HSD-36: link an existing Client (branding owner).
  client_id?: string | null;
  // HSD-71: extra days for a multi-day shoot.
  extra_shoot_dates?: string[];
}): Promise<Job> {
  // Strip empty strings → null so backend doesn't try to validate them as emails/dates.
  const body: Record<string, unknown> = { name: input.name };
  if (input.client_name) body.client_name = input.client_name;
  if (input.client_email) body.client_email = input.client_email;
  if (input.shoot_date) body.shoot_date = input.shoot_date;
  if (input.location) body.location = input.location;
  if (typeof input.download_cap === "number" && Number.isFinite(input.download_cap)) {
    body.download_cap = input.download_cap;
  }
  if (input.shoot_mode) body.shoot_mode = input.shoot_mode;
  if (input.client_id) body.client_id = input.client_id;
  if (input.extra_shoot_dates?.length) {
    body.extra_shoot_dates = input.extra_shoot_dates;
  }

  return api<Job>("/api/v1/jobs", {
    method: "POST",
    token: authToken(),
    body: JSON.stringify(body),
  });
}

export async function updateJob(
  id: string,
  patch: {
    // HSD-55: acknowledge that a slot-config change cancels existing
    // bookings. Without it the API refuses (409) when bookings exist.
    clear_slot_bookings?: boolean;
  } & Partial<
    Pick<
      Job,
      | "name"
      | "client_name"
      | "client_email"
      | "shoot_date"
      | "location"
      | "status"
      | "download_cap"
      | "shoot_mode"
      | "time_slot_config"
      | "client_id"
      | "picks_enabled"
      | "pick_cap"
      | "extra_shoot_dates"
      | "allow_reschedule"
    >
  >,
): Promise<Job> {
  return api<Job>(`/api/v1/jobs/${id}`, {
    method: "PATCH",
    token: authToken(),
    body: JSON.stringify(patch),
  });
}

// HSD-67: client dashboard link — share (create/return) and revoke.
export async function shareClientLink(
  jobId: string,
): Promise<{ client_token: string; url: string }> {
  return api<{ client_token: string; url: string }>(
    `/api/v1/jobs/${jobId}/client-link`,
    { method: "POST", token: authToken() },
  );
}

export async function revokeClientLink(jobId: string): Promise<void> {
  await api(`/api/v1/jobs/${jobId}/client-link`, {
    method: "DELETE",
    token: authToken(),
  });
}

// HSD-55 follow-up: owner-side slot assignment. The photographer books or
// frees a time for a participant from the job page (manual adds, CSV rows).
export async function bookSlotForParticipant(
  jobId: string,
  participantId: string,
  slotStart: string,
): Promise<ScheduleEntry> {
  return api<ScheduleEntry>(
    `/api/v1/jobs/${jobId}/participants/${participantId}/book-slot`,
    {
      method: "POST",
      token: authToken(),
      body: JSON.stringify({ slot_start: slotStart }),
    },
  );
}

export async function cancelParticipantBooking(
  jobId: string,
  participantId: string,
): Promise<void> {
  await api(`/api/v1/jobs/${jobId}/participants/${participantId}/booking`, {
    method: "DELETE",
    token: authToken(),
  });
}

export async function getSchedule(id: string): Promise<ScheduleEntry[]> {
  const res = await api<{ entries: ScheduleEntry[] }>(
    `/api/v1/jobs/${id}/schedule`,
    { token: authToken() },
  );
  return res.entries;
}

export async function archiveJob(id: string): Promise<Job> {
  return api<Job>(`/api/v1/jobs/${id}/archive`, {
    method: "POST",
    token: authToken(),
  });
}

// --- F5c: Bulk gallery delivery ---

export type DeliveryResult = {
  sent: number;
  skipped_already_delivered: number;
  skipped_no_photos: number;
  skipped_no_email: number;
  errors: string[];
};

export async function deliverJob(
  id: string,
  opts: { includeAlreadyDelivered?: boolean } = {},
): Promise<DeliveryResult> {
  return api<DeliveryResult>(`/api/v1/jobs/${id}/deliver`, {
    method: "POST",
    token: authToken(),
    body: JSON.stringify({
      include_already_delivered: opts.includeAlreadyDelivered ?? false,
    }),
  });
}

// --- Display helpers ---

export const STATUS_LABELS: Record<JobStatus, string> = {
  draft: "Draft",
  open_for_signup: "Open for signup",
  in_progress: "In progress",
  delivered: "Delivered",
  archived: "Archived",
};

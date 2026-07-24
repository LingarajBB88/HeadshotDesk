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
  location: string | null;
  status: JobStatus;
  // F5b.1: per-job hard cap on unique photos each participant can download
  // from their /g/{token} gallery. 0 disables downloads entirely.
  download_cap: number;
  // HSD-55: how shoot day runs.
  shoot_mode: ShootMode;
  time_slot_config: TimeSlotConfig | null;
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

  return api<Job>("/api/v1/jobs", {
    method: "POST",
    token: authToken(),
    body: JSON.stringify(body),
  });
}

export async function updateJob(
  id: string,
  patch: Partial<
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
    >
  >,
): Promise<Job> {
  return api<Job>(`/api/v1/jobs/${id}`, {
    method: "PATCH",
    token: authToken(),
    body: JSON.stringify(patch),
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

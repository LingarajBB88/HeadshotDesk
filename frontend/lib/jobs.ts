// Jobs API client.

import { api } from "./api";
import { getAccessToken } from "./auth";

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
}): Promise<Job> {
  // Strip empty strings → null so backend doesn't try to validate them as emails/dates.
  const body: Record<string, unknown> = { name: input.name };
  if (input.client_name) body.client_name = input.client_name;
  if (input.client_email) body.client_email = input.client_email;
  if (input.shoot_date) body.shoot_date = input.shoot_date;
  if (input.location) body.location = input.location;

  return api<Job>("/api/v1/jobs", {
    method: "POST",
    token: authToken(),
    body: JSON.stringify(body),
  });
}

export async function updateJob(
  id: string,
  patch: Partial<Pick<Job, "name" | "client_name" | "client_email" | "shoot_date" | "location" | "status">>,
): Promise<Job> {
  return api<Job>(`/api/v1/jobs/${id}`, {
    method: "PATCH",
    token: authToken(),
    body: JSON.stringify(patch),
  });
}

export async function archiveJob(id: string): Promise<Job> {
  return api<Job>(`/api/v1/jobs/${id}/archive`, {
    method: "POST",
    token: authToken(),
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

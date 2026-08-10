// Shoot-day sync: keep working when the backend doesn't.
//
// The shoot screen only needs three things to function: the participant
// list, the ability to mark someone shot, and photo upload. This module
// covers the first two. Everything the photographer does is applied to the
// screen immediately and queued for replay, so a dead network looks like a
// small banner rather than a stalled shoot.
//
// Why this exists at all: marking someone shot used to fail silently. The
// row didn't move, no error appeared, and that person was missing from the
// attendance report and never got a gallery. An outage you can see is
// survivable; one you can't is not.

import {
  bumpActionAttempts,
  deletePendingAction,
  listPendingActions,
  loadJobSnapshot,
  queueAction,
  saveJobSnapshot,
  type PendingAction,
} from "./idbStore";
import {
  listParticipants,
  markShot,
  resetShot,
  setNoShow,
  type Participant,
} from "./participants";

/** Give up after this many replay failures and tell the photographer. */
const MAX_ATTEMPTS = 8;

export type ShootData = {
  participants: Participant[];
  /** True when this came from cache rather than the server. */
  stale: boolean;
  /** When the cache was written, for "as of 14:32" wording. */
  savedAt: number | null;
  /** Actions waiting to reach the server. */
  pending: number;
};

/**
 * Participants for the shoot screen, from the network when possible and
 * from the last snapshot when not.
 *
 * Locally queued actions are replayed over whatever list comes back, so a
 * server response that predates them doesn't visibly undo work the
 * photographer already did.
 */
export async function loadShootData(jobId: string): Promise<ShootData> {
  const pending = await listPendingActions(jobId);

  try {
    const res = await listParticipants(jobId);
    await saveJobSnapshot(jobId, res.items);
    return {
      participants: applyPending(res.items, pending),
      stale: false,
      savedAt: Date.now(),
      pending: pending.length,
    };
  } catch {
    const snap = await loadJobSnapshot<Participant[]>(jobId);
    if (!snap) throw new Error("offline-and-no-cache");
    return {
      participants: applyPending(snap.data, pending),
      stale: true,
      savedAt: snap.savedAt,
      pending: pending.length,
    };
  }
}

/**
 * Replay queued actions onto a participant list.
 *
 * Applied in queue order, so mark-shot followed by reset ends up reset.
 * Timestamps are approximate here: the server's value wins once the action
 * actually lands, and nothing on the shoot screen depends on the exact
 * second.
 */
function applyPending(
  participants: Participant[],
  pending: PendingAction[],
): Participant[] {
  if (pending.length === 0) return participants;
  const byId = new Map(participants.map((p) => [p.id, { ...p }]));
  for (const action of pending) {
    const p = byId.get(action.participantId);
    if (!p) continue;
    const now = new Date(action.at).toISOString();
    switch (action.kind) {
      case "mark-shot":
        p.shot_at = now;
        p.no_show_at = null;
        break;
      case "reset-shot":
        p.shot_at = null;
        break;
      case "no-show":
        p.no_show_at = now;
        p.shot_at = null;
        break;
      case "un-no-show":
        p.no_show_at = null;
        break;
    }
  }
  return participants.map((p) => byId.get(p.id) ?? p);
}

/**
 * Perform a shoot-queue action.
 *
 * Tries the network first, because the common case is that it works and an
 * immediate round trip keeps the server authoritative. On any failure the
 * action is queued instead of thrown away, and the caller updates the UI
 * either way: from the photographer's side, tapping Done always works.
 */
export async function performAction(
  jobId: string,
  participantId: string,
  kind: PendingAction["kind"],
): Promise<{ queued: boolean }> {
  try {
    await callFor(kind, participantId);
    return { queued: false };
  } catch {
    await queueAction({ jobId, participantId, kind });
    return { queued: true };
  }
}

function callFor(kind: PendingAction["kind"], participantId: string) {
  switch (kind) {
    case "mark-shot":
      return markShot(participantId);
    case "reset-shot":
      return resetShot(participantId);
    case "no-show":
      return setNoShow(participantId, true);
    case "un-no-show":
      return setNoShow(participantId, false);
  }
}

export type FlushResult = {
  sent: number;
  remaining: number;
  /** Actions that have failed too many times to keep retrying quietly. */
  givenUp: number;
};

/**
 * Push queued actions to the server, oldest first.
 *
 * Stops at the first failure rather than hammering through the rest: if the
 * server is down, the second call will fail too, and order matters. An
 * action that has failed MAX_ATTEMPTS times is dropped from the queue and
 * counted, because a queue that never drains is worse than an honest "these
 * didn't save".
 */
export async function flushPendingActions(jobId: string): Promise<FlushResult> {
  const pending = await listPendingActions(jobId);
  let sent = 0;
  let givenUp = 0;

  for (const action of pending) {
    if (action.id == null) continue;
    if (action.attempts >= MAX_ATTEMPTS) {
      await deletePendingAction(action.id);
      givenUp += 1;
      continue;
    }
    try {
      await callFor(action.kind, action.participantId);
      await deletePendingAction(action.id);
      sent += 1;
    } catch {
      await bumpActionAttempts(action.id);
      break; // still down; try again on the next tick
    }
  }

  const left = await listPendingActions(jobId);
  return { sent, remaining: left.length, givenUp };
}

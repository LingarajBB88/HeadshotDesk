# Reliability

## The actual goal

Not "100% uptime" — that isn't achievable and pretending otherwise leads to
spending money in the wrong places. The goal is:

> **A HeadshotDesk outage never stops a shoot, and never loses data
> silently.**

Those are different problems and the second one is worse. An outage you can
see is survivable: the photographer keeps shooting and finds out later that
something needs re-sending. Data that vanishes without a message is how a
client ends up missing from an attendance report, or a set of frames never
reaches a gallery, and nobody notices until it's too late to fix.

## The shoot-day critical path

During a live shoot the photographer needs exactly three things:

1. The participant list, to copy names to the clipboard for Capture One
2. Marking people shot
3. Photos uploading

Everything else — signup pages, galleries, delivery emails, the admin
dashboard — can be unavailable for an hour without hurting anyone. That
narrowness is what makes this tractable: harden three operations and a
platform incident becomes something the photographer doesn't notice.

## What protects those three

### Offline shoot queue

`frontend/lib/shootSync.ts` plus the `job-snapshots` and `pending-actions`
stores in `frontend/lib/idbStore.ts`.

- The participant list is cached in IndexedDB on every successful fetch. If
  the backend is unreachable, the shoot screen loads from cache and says so.
- Mark shot, reset, and no-show are applied to the screen immediately and
  queued if the call fails. From behind the camera, tapping Done always
  works.
- The queue drains every 15 seconds and on the browser's `online` event.
- Queued actions are replayed over any list that comes back from the
  server, so a stale response doesn't visibly undo work already done.
- After 8 failed attempts an action is dropped and reported loudly. A queue
  that never drains is worse than an honest "these didn't save".

The one case this can't cover: a shoot opened for the first time on a
device with no connection. There's nothing cached, so there's nothing to
show. **Open the shoot screen once before the event**, on the machine
you'll use, while you still have signal.

### Uploads

`frontend/lib/folderWatcher.ts` marks a file "seen" only after the server
has accepted it. It used to mark them before the upload, which meant a
single 500 retired those frames permanently — the next scan skipped them
and only unmapping the folder recovered them. Now a failed batch is simply
picked up by the next 10-second scan.

## Infrastructure

### Health checks

| Endpoint | Checks | On failure |
|---|---|---|
| `/health` | Database connectivity | 503, so Render pulls and restarts the instance |
| `/health/live` | Process is running | Always 200; restarting won't fix a DB outage |
| `/health/storage` | R2 write→read→delete round trip | 503 |

`/health` previously returned 200 without touching the database, so an
instance with a dead connection looked healthy: never restarted, never
alerted on, 500ing every request until someone noticed by hand.

`/health/storage` is deliberately *not* the Render health check. A storage
outage shouldn't take the API down, because the shoot queue keeps working
without it. Point an external monitor at it instead.

### Deploys

- `preDeployCommand: alembic upgrade head` runs migrations once per deploy,
  in a separate container, before any new instance takes traffic. A failed
  migration aborts the deploy and the old version keeps serving.
- `numInstances: 2`, so a deploy, crash, or OOM isn't a full outage.

**Don't deploy on a weekday morning.** Most corporate shoots run 09:00 to
17:00 European time. This is a policy, not code.

### Monitoring

Sentry is wired into the backend and no-ops without a DSN. Set `SENTRY_DSN`
in the Render dashboard.

Still to set up by hand, outside this repo:

- [ ] External uptime check on `https://api.headshotdesk.com/health`, one
      minute interval, alerting to a phone. Render's own health check
      restarts instances but doesn't tell you anything.
- [ ] Second check on `/health/storage`, five minute interval. Storage
      failures are silent and cost a live shoot on 2026-07-27.
- [ ] Verify the Postgres backup **restore**, not just that backups exist.
      An untested backup is a hypothesis.

## What we deliberately haven't built

- Multi-region Postgres, read replicas, autoscaling. At this volume they
  add failure modes and cost more than they prevent.
- A service worker. The offline queue covers the shoot path; making the
  whole app installable is a bigger surface than the problem needs.
- A status page. Worth it when there are enough customers that individual
  emails don't scale.

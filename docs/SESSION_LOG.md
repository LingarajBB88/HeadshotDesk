# Session Log

Append-only chronicle of what each session accomplished and what's queued next.
Future Claude: read the **most recent entry** at the start of every session.

---

## Session 5 — 2026-05-07

### What got done
**Mobile responsive pass + logo polish + forgot password flow shipped.**

Mobile fixes:
- App nav header: HD wordmark hides on phones (icon only), account name hides on small screens, tighter spacing
- `/jobs` list: stacked cards on mobile, table on desktop (`sm:` breakpoint)
- Job detail header wraps cleanly on mobile (title + status + archive button)
- Marketing hero: 4xl → 5xl → 6xl progressive scale instead of jumping
- Marketing/auth/app layouts all use `px-4 sm:px-6` for breathing room

Logo (`components/Logo.tsx`):
- New reusable `<Logo />` component with the accent dot at top-right corner of the HD tile
- Two sizes (`sm`, `md`), optional wordmark, optional `hideWordmarkOnMobile`
- Replaces inline HD tiles in 3 places: marketing nav, app nav, AuthCard

Forgot password flow:
- Migration 0002: `password_reset_token_hash` + `password_reset_token_expires_at` columns on `users`
- `services/email_service.py`: dev mode logs to stdout, production wired for Postmark
- `auth_service`: `request_password_reset` (email-enumeration safe) + `reset_password` (revokes all sessions on success)
- `POST /api/v1/auth/forgot-password` (always 204, even for unknown emails)
- `POST /api/v1/auth/reset-password` (token-based, single-use, 1-hour expiry)
- Frontend: `/forgot-password` page, `/reset-password?token=...` page with token validation, "Forgot password?" link from login
- 8 new tests (`test_password_reset.py`)

Bugs caught + fixed:
- **`docker-compose.yml`**: backend now runs uvicorn with `--reload`, so file edits are picked up automatically. Was causing stale-code 404s on new routes.
- **`lib/api.ts`**: helper threw on 204 No Content responses (empty body, can't parse JSON). Added explicit 204 handling. Affected logout, forgot-password, reset-password — all silently broken.

### Tested manually (browser)
- ✅ Logo dot visible in all 3 places (marketing, auth card, app nav)
- ✅ Mobile layout pass on Chrome DevTools iPhone SE preset
- ✅ Forgot password → dev email URL in logs → reset → new password works → old password fails
- ✅ Job creation works (was failing due to stale-code 404 — fixed by `--reload`)
- ✅ Job detail page rendering correctly (screenshot verified)

### What's queued for next session
**Feature 3 — Participant signup forms** (Task #15)

Specifically:
1. Backend: `Participant` model, schemas, service, routes
2. CSV import (parse, dedupe by email, bulk create)
3. Public signup form at `/s/{slug}` (no auth required)
4. Frontend: participant list inside `/jobs/[id]`, CSV upload UI, signup form share link
5. Tests for participant flow

### Open questions still parked
- Free trial length (proposed default: 14 days, no card needed at signup)
- Photographer beta tester names (3-5 needed)

---

## Session 7 — 2026-05-08 (continued)

### What got done
**Feature 3 — Participant signup forms shipped + UX iterations.**

Initial Feature 3 build:
- Participant SQLAlchemy model
- Schemas: ParticipantCreate, ParticipantUpdate, PublicJobOut, PublicParticipantSignup, CsvImportResult
- Service with cross-account isolation, dedupe-by-email, idempotent public signup
- Authed routes: list/create/update/delete + CSV import (multipart/form-data)
- Public routes (no auth) at `/api/v1/public/jobs/{slug}` and `/api/v1/public/jobs/{slug}/signup`
- Frontend: lib/participants.ts client, <ParticipantsSection> component, /s/[slug] public signup page
- 21 initial tests

UX iterations applied today:
- **Sample CSV download** — "Download a blank template" link in the upload area
- **Signup link UX** — clickable URL that opens in new tab + Copy button (was just Copy)
- **Signup link relocated** — moved out of Participants section, placed at top-level on the job detail page (more discoverable, better information hierarchy)
- **Hidden for archived jobs** — backend returns 404 anyway, no point showing a dead link
- **CSV parser hardened** — auto-detects delimiter (comma/semicolon/tab/pipe); handles BOM, CRLF/CR, Excel `sep=` preamble, blank rows; row-level Pydantic validation (StrictEmail per row, length checks); per-row error reporting
- Extracted reusable `<SignupLinkBar>` component

### Tested manually
- Manual add participant ✓
- CSV upload from comma-delimited template ✓
- CSV upload from semicolon-delimited (European Excel) ✓
- Public signup page works in incognito ✓
- Copy / open signup link ✓

### Tests
**90 passing total** (20 auth + 8 password reset + 32 jobs + 30 participants).

### What's queued for next session
**Feature 4 — Shoot queue / tether** (Task #21)

Specifically:
1. New "Shoot mode" view inside `/jobs/[id]` (or separate `/jobs/[id]/shoot`)
2. Participant queue, large-text rendering for shoot-day visibility
3. Click/double-click a name → copy to system clipboard
4. Capture One picks up via "Clipboard Contents" rename token on the next shot
5. Active-participant indicator + "shot count" badge per participant (counts files we've received for them)
6. Done/skip buttons to advance through the queue
7. (Later session) desktop helper for watch-folder upload, but the in-browser queue is the MVP

### Open questions still parked
- Free trial length (proposed default: 14 days)
- Photographer beta tester names (3-5 needed)
- Email validation depth — `gmail.co` accepted (`.co` is a real TLD)
- Shoot queue UX: separate page vs. tab/modal inside job detail?

---

## Session 6 — 2026-05-08

### What got done
**Feature 2 — Jobs CRUD shipped + lots of polish/bug fixes.**

Jobs CRUD (separate session block — see end of Session 5 entry which got
inlined here over the day):
- Backend: Job model, schemas, service, routes, 32 tests
- Frontend: list with Active/Archived tabs, create form, detail with archive,
  clickable rows, StatusPill component
- Cross-account isolation enforced in the service layer (defense-in-depth)

Validation hardening:
- StrictEmail type rejects single-char TLDs
- shoot_date required + must be today or later (create-time only)
- location required + must contain at least one letter (no pure digits)
- Reusable form-error helper that maps Pydantic 422 to inline field errors

Form error handling overhaul:
- ApiError.fieldErrors getter for Pydantic 422 detail arrays
- classifyFormError helper used by all 5 forms (signup/login/forgot/reset/new-job)
- Friendlier wording mapping ("value is not a valid email address" →
  "Enter a valid email address.")

Bug fixes:
- docker-compose: uvicorn now runs with --reload (was causing stale-code 404s)
- lib/api.ts: handle 204 No Content responses (was crashing logout, forgot/reset)
- Job rows: entire row clickable, not just the name link
- "[object Object]" form errors fixed via the new error classifier

### Tested manually
- Sign up / sign in / sign out cycle ✓
- Forgot password → dev email URL → reset → old fails / new works ✓
- Create job with valid input ✓
- Job creation with invalid email shows inline error ✓
- Job creation with past date / missing fields blocked ✓
- Active / Archived tabs work ✓
- Clicking anywhere on a job row navigates ✓

### Tests
**60 passing total** (20 auth + 8 password reset + 32 jobs).

### What's queued for next session
**Feature 3 — Participant signup forms** (Task #15)

Specifically:
1. Backend: `Participant` model (table already exists in schema), schemas, service, routes
2. CSV import endpoint (parse, dedupe by email, bulk create)
3. Public signup form at `/s/{slug}` (no auth required) — visitors fill in name + email + custom fields
4. Frontend: participant list + counts inside `/jobs/[id]`, CSV upload UI, "Copy signup link" button
5. Tests for participant flow

After Feature 3 lands, a photographer can run a complete shoot end-to-end on HeadshotDesk (minus AI retouch + galleries which are v0.2).

### Open questions still parked
- Free trial length (proposed default: 14 days)
- Photographer beta tester names (3-5 needed)
- Email validation depth — `gmail.co` is technically valid (`.co` is a real TLD).
  Future options: confirm-email field on signup, MX record validation, "did
  you mean .com?" warnings. For MVP, accept the looseness.

---

## Session 5 — 2026-05-07
(merged into Session 6 above due to continuous work over multiple days)

---

## Session 4 — 2026-05-06

### What got done
**Feature 2 — Jobs CRUD shipped.** Full backend + frontend + tests.

Backend (6 new + 3 modified files):
- `models/job.py` — SQLAlchemy `Job` model (mirrors existing SQL schema, no new migration needed)
- `core/slugs.py` — URL-safe slug generator using Crockford-style alphabet (no confusable chars)
- `schemas/job.py` — `JobCreate`, `JobUpdate`, `JobOut`, `JobListItem`, `JobList`
- `services/job_service.py` — create/list/get/update/archive, all account-scoped
- `api/jobs.py` — REST routes:
  - `POST   /api/v1/jobs`
  - `GET    /api/v1/jobs?include_archived=true`
  - `GET    /api/v1/jobs/{id}`
  - `PATCH  /api/v1/jobs/{id}`
  - `POST   /api/v1/jobs/{id}/archive`
- Wired into `main.py`

**Cross-account safety enforced in the service layer**, not the route layer — so it's impossible to accidentally leak data even if a future route forgets the check. Tests verify this.

Frontend (4 new + 1 modified files):
- `lib/jobs.ts` — typed API client + display helpers
- `components/StatusPill.tsx` — color-coded job status indicator
- `/jobs` — real list view (replaces placeholder), shows table OR empty state
- `/jobs/new` — create form
- `/jobs/[id]` — detail page with archive button + placeholder participant section

Tests (1 new file, 24 tests):
- Auth required on all endpoints
- Create (minimal, full, validation, slug uniqueness)
- List (empty, populated, **cross-account isolation**, archived filtering)
- Get (own, other-account returns 404, nonexistent returns 404)
- Update (single field, partial, status, **cross-account rejected**)
- Archive (sets status + timestamp, idempotent, cross-account rejected)

### How to test locally
```bash
cd ~/HeadshotDesk
docker compose up

# In another terminal — run all tests (auth + jobs):
docker compose exec backend pytest tests/ -v

# Then in browser, while logged in:
# - http://localhost:3000/jobs       → empty state
# - Click "New job" → create one
# - Click the job → see detail page
# - Archive it
```

### What's queued for next session
**Feature 3 — Participant signup forms** (Task #15)

Specifically:
1. Backend: `Participant` model, schemas, service, routes
2. CSV import (parse, dedupe by email, create participants in bulk)
3. Public signup form at `/s/{slug}` (no auth required) — visitors fill in their name + email + optional fields
4. Frontend: participant list inside `/jobs/[id]`, CSV upload UI, signup form share link
5. Tests for participant flow

### Open questions still parked
- Free trial length (proposed default: 14 days, no card needed at signup)
- Photographer beta tester names (3-5 needed)

### Browser-redirect scenarios still to manually verify (~30s each)
- Refresh /jobs while logged in → should stay logged in
- Visit /jobs in incognito → should redirect to /login
- Edit `hsd_access` in localStorage to garbage → should redirect to /login

---

## Session 3 — 2026-05-05

### What got done
**Feature 1 — Authentication shipped.** Full backend + frontend.

Backend:
- SQLAlchemy models: `Account`, `User`, `AuthSession`
- Alembic migration `0001` runs the SQL schema (proper Python migration that wraps the `.sql` file)
- Refresh token helpers in `core/security.py` (random URL-safe tokens, SHA256 hashed at rest)
- Auth service: `signup`, `login`, `refresh`, `logout` (in `services/auth_service.py`)
- Pydantic schemas for all auth requests/responses
- Auth API routes under `/api/v1/auth/...`
- `get_current_user` and `get_current_account` FastAPI dependencies
- Auth router wired into `main.py`

Frontend:
- `lib/auth.ts` — token storage (localStorage for v0.1), signup/login/logout/fetchMe wrappers
- `components/AuthCard.tsx`, `components/FormField.tsx` — shared UI
- `/signup` page with full form + error handling
- `/login` page
- `/(app)/layout.tsx` — protected layout, redirects to `/login` if not authed, shows nav + sign-out
- `/(app)/jobs/page.tsx` — placeholder dashboard until Feature 2
- Marketing landing page updated with header + Sign in link

### How to run locally
```bash
cd ~/HeadshotDesk
docker compose up
# in another terminal:
docker compose exec backend alembic upgrade head
# Then open:
#   http://localhost:3000        — landing
#   http://localhost:3000/signup — create account
#   http://localhost:8000/docs   — API explorer
```

### Tests added + bugs fixed (same session)
- **20-test pytest suite** under `backend/tests/test_auth.py`
- Dev dependencies now installed in Docker image (`Dockerfile` updated)
- Tests cover signup, login, refresh, logout, /me, email case-insensitivity, security parity (wrong-email / wrong-password indistinguishable), refresh token can't be used as access token, idempotent logout
- **Bug caught + fixed:** `auth_sessions.ip_address` is Postgres `INET`. FastAPI TestClient sets `request.client.host = "testclient"` which fails `INET` validation. Fixed in `_client_meta` to validate IP via `ipaddress.ip_address()` before storing — drops invalid IPs to None.
- **Test strengthening:** `test_refresh_returns_working_access_token` now verifies functional behavior (new token authenticates on /me) instead of byte-comparing tokens (which fail when issued in the same second with identical claims).
- **Final state: 20/20 passing.**

### Tested manually (browser)
- ✅ Sign up → redirected to /jobs
- ✅ Sign out → redirected to /login
- ✅ Sign in → redirected to /jobs

### What's queued for next session
**Feature 2 — Jobs CRUD** (Task #14)

Specifically:
1. Backend: `Job` model, schemas, service, routes (create/list/get/update/archive)
2. Public job slug generation (URL-safe, unique)
3. Frontend: `/jobs` (real list, replacing placeholder), `/jobs/new`, `/jobs/[id]`
4. Photographer dashboard with job cards + status
5. Tests for jobs alongside auth tests

### Open questions still parked
- Free trial length (proposed default: 14 days, no card needed at signup)
- Photographer beta tester names (3-5 needed)

### Browser-redirect scenarios still to manually verify (~30s each)
- Refresh /jobs while logged in → should stay logged in
- Visit /jobs in incognito → should redirect to /login
- Edit `hsd_access` in localStorage to garbage → should redirect to /login

---

## Session 2 — 2026-05-04

### What got done
- Brand name locked: **HeadshotDesk** (was working name "ShootDesk", renamed across entire scaffold)
- Logo locked: **HD monogram tile + two-tone wordmark** (combined Concept C + B)
  - Assets in `docs/logo-final.svg`, `docs/logo-icon.svg`
  - Production copies in `frontend/public/`
  - Favicon wired into `frontend/app/layout.tsx`
- Color palette locked: **Cool Studio** — accent `#5B6CFF`, ink `#0B0F1A`
- Domain registered: **headshotdesk.com**
- Infrastructure scalability decisions made (D-011 through D-022):
  - Vercel Pro, Neon Pro, Postmark from launch
  - Add Sentry + PostHog + Axiom at launch
  - Auth: roll our own JWT, plan Clerk swap at ~$50K ARR
- GitHub repo created at `LingarajBB88/HeadshotDesk`
- Scaffold pushed via GitHub Desktop. Initial commit: `7c88359`

### What's queued for next session
**Build v0.1 Feature 1 — Authentication** (Task #13)

Specifically:
1. SQLAlchemy models: `Account`, `User`, `AuthSession` (mirror the SQL in `backend/alembic/versions/0001_initial_schema.sql`)
2. Wire up Alembic so `alembic upgrade head` creates the tables
3. Backend API endpoints:
   - `POST /api/v1/auth/signup` — create account + first user, return access + refresh tokens
   - `POST /api/v1/auth/login` — verify password, return tokens
   - `POST /api/v1/auth/refresh` — exchange refresh token for new access token
   - `POST /api/v1/auth/logout` — revoke refresh token
   - `GET /api/v1/auth/me` — return current user (JWT-authed)
4. FastAPI dependency for "current user" injection
5. Frontend pages:
   - `/signup` — email + password + account name
   - `/login` — email + password
   - Auth context provider that stores tokens (httpOnly cookie ideally)
   - Auto-redirect to `/jobs` on success
6. Hook the marketing landing page CTAs (`/signup`, `/login`) to the new pages

By end of next session: photographer can `docker compose up` locally and sign up at localhost:3000.

### Open questions still parked
- Free trial length OR money-back guarantee period
- Photographer beta tester names (3-5 needed)

### User homework still outstanding
- Cloudflare account + transfer DNS
- Vercel + Railway + Neon + Stripe + Postmark accounts
- (None of these block feature development locally — only deployment)

---

## Session 1 — 2026-05-03 (kickoff)

### What got done
- Market research + feasibility analysis
- Profit model: $0.5M-$1.5M annual at #1/#2 position
- Pricing tiers (Solo/Pro/Studio + Hibernate)
- Strategic positioning: photographers + corporate self-capture (no marketplace until v2)
- Tech stack chosen: FastAPI + Next.js + Postgres + R2
- Full project scaffold committed (40 files): docs, backend, frontend, schema, docker-compose
- Brand directions drafted (3 logos, 3 color options) — locked in Session 2

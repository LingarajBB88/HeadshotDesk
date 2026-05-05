# Session Log

Append-only chronicle of what each session accomplished and what's queued next.
Future Claude: read the **most recent entry** at the start of every session.

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

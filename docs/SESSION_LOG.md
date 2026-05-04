# Session Log

Append-only chronicle of what each session accomplished and what's queued next.
Future Claude: read the **most recent entry** at the start of every session.

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

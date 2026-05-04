# Architecture

## High-level

```
┌──────────────────────┐      ┌──────────────────────┐
│   Web Frontend       │      │  Desktop Helper      │
│   Next.js + Tailwind │      │  Python (PyInstaller)│
│   (Vercel)           │      │  Tether bridge       │
└──────────┬───────────┘      └──────────┬───────────┘
           │                              │
           │  HTTPS / JSON                │  HTTPS + clipboard
           ▼                              ▼
       ┌──────────────────────────────────────────┐
       │       FastAPI Backend                    │
       │       (Render or Railway)                │
       │                                          │
       │  ┌─────────────┐  ┌──────────────────┐  │
       │  │ Auth & API  │  │ Background jobs  │  │
       │  │ JWT, OAuth  │  │ (RQ + Redis)     │  │
       │  └─────────────┘  └──────────────────┘  │
       └──────────┬───────────────────┬──────────┘
                  │                   │
                  ▼                   ▼
         ┌────────────────┐  ┌────────────────────┐
         │   Postgres     │  │  Cloudflare R2     │
         │  (Supabase     │  │  Image storage,    │
         │   or Neon)     │  │  S3-compatible     │
         └────────────────┘  └────────────────────┘
                  │
                  ▼
       ┌──────────────────────────────────┐
       │  External services               │
       │  - Stripe (billing)              │
       │  - Postmark (email)              │
       │  - Replicate (AI inference)      │
       │  - PhotoRoom (background remove) │
       └──────────────────────────────────┘
```

## Components

### Frontend (Next.js 14, App Router, TypeScript, Tailwind)
- Marketing site (public)
- Photographer dashboard (auth required)
- Participant gallery (private link, no auth required)
- Corporate HR portal (v0.3)
- Self-capture web app (v0.3, mobile-first)

### Backend (FastAPI, Python 3.11+, SQLAlchemy 2.x, Pydantic v2)
- REST API (versioned, `/api/v1/...`)
- Auth: JWT access + refresh, optional magic link
- Background workers: RQ + Redis for AI processing, file uploads, email
- Webhooks: Stripe events, R2 upload completion
- Admin endpoints (later): customer management, support

### Desktop Helper (Python + PyInstaller, Mac + Windows)
- Lightweight system tray app
- Connects to HeadshotDesk API for active job
- Shows participant queue
- On click: copies participant name to system clipboard
- Capture One / Smart Shooter pick up clipboard via "Clipboard Contents" rename token
- Watches export folder, auto-uploads to HeadshotDesk

### Database (Postgres 15+)
- Managed via Supabase or Neon
- Migrations via Alembic
- Connection pooling via PgBouncer

### Storage (Cloudflare R2)
- Originals, retouched images, thumbnails
- Signed URLs for participant gallery access
- Cold tier for hibernated accounts (cost optimization)

### External services
- **Stripe** — subscriptions, metered billing, webhooks
- **Postmark** — transactional email (gallery delivery, invites, receipts)
- **Replicate** — AI inference (face restoration, skin retouch)
- **PhotoRoom** — background removal (alternative: BiRefNet on Replicate)

## Data flow: a typical shoot

1. Photographer creates job in dashboard.
2. Photographer uploads CSV of participants OR shares signup form URL with the company.
3. Day of shoot: photographer opens desktop helper, signs in, picks active job.
4. Active queue shows participant names. Photographer double-clicks a name → copied to clipboard.
5. Photographer shoots. Capture One renames files using clipboard token: `{ParticipantName}_{Index}.RAW`.
6. Photographer exports JPEGs to a watch folder.
7. Desktop helper detects new files, uploads to HeadshotDesk backend.
8. Backend parses filename, sorts into per-participant gallery, generates thumbnails.
9. (v0.2) Backend kicks off AI processing job — background swap + retouch + auto-crops.
10. Once gallery is finalized, backend sends per-participant email with private link.
11. Participant opens gallery, picks favorites, downloads at chosen sizes.

## Tech decisions log
See `DECISIONS.md` for the full reasoning behind each choice.

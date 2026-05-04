# HeadshotDesk

> Headshot workflow software for professional photographers and corporate teams.
> Project status: **scaffolding — Day 0.** No features built yet.

## Project documentation

Start here at the beginning of every session:

- [`docs/PROJECT_OVERVIEW.md`](docs/PROJECT_OVERVIEW.md) — what we're building and why
- [`docs/MVP_ROADMAP.md`](docs/MVP_ROADMAP.md) — three-release plan
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — tech architecture and data flow
- [`docs/DECISIONS.md`](docs/DECISIONS.md) — append-only log of every meaningful decision
- [`docs/BRAND.md`](docs/BRAND.md) — colors, logos, naming conventions
- [`docs/OPEN_QUESTIONS.md`](docs/OPEN_QUESTIONS.md) — pending decisions
- [`docs/USER_TASKS.md`](docs/USER_TASKS.md) — homework that only Lingaraj can do

## Repo layout

```
headshotdesk/
├── backend/        FastAPI + SQLAlchemy + Alembic
├── frontend/       Next.js 15 + Tailwind + TypeScript
├── desktop-helper/ Python tether helper (Capture One / Smart Shooter clipboard bridge)
├── docs/           All project documentation
├── scripts/        Dev convenience scripts
├── docker-compose.yml
└── .env.example
```

## Local development

You'll need: Docker Desktop, Node 22+, Python 3.11+ (only if running outside Docker).

```bash
# 1. Copy env template and fill in any local values
cp .env.example .env

# 2. Start everything (Postgres, Redis, backend, frontend)
docker compose up

# 3. Open
#    Frontend:  http://localhost:3000
#    API docs:  http://localhost:8000/docs
```

To run the database migration once the backend is up:

```bash
docker compose exec backend alembic upgrade head
```

## Tech stack

| Layer | Choice |
|---|---|
| Backend | FastAPI (Python 3.11+) |
| Frontend | Next.js 15 + Tailwind |
| Database | Postgres 16 (managed: Supabase or Neon) |
| Storage | Cloudflare R2 |
| Background jobs | RQ + Redis |
| Hosting (frontend) | Vercel |
| Hosting (backend) | Render or Railway |
| Email | Postmark |
| Payments | Stripe |
| AI inference (v0.2+) | Replicate, PhotoRoom |
| Desktop helper | Python + PyInstaller |

## Contributing

This is a single-developer project. Claude writes the code; Lingaraj reviews at agreed checkpoints (auth, billing, anything touching user data) and handles all account creation + deployment.

## License

TBD — likely proprietary at launch, will revisit later.

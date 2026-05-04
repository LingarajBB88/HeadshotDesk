# HeadshotDesk — Project Overview

> Working brief. This is the file Claude reads first at the start of every session.
> Last updated: kickoff (Day 0)

## What we're building

A SaaS workflow tool for professional headshot photographers and (later) corporate teams. Modeled after headshottools.com but with three structural differentiators:

1. **Lower price** — Pro tier at $44/mo (vs. competitor's $59/mo flat rate).
2. **AI processing built in** — background swap, skin retouch, auto-crop. Competitor has none.
3. **Hibernate plan** — pause subscription at $7/mo during slow seasons; galleries stay live, data preserved. No one in the category offers this.

Two audiences, in this order:
- **v0.1–v0.2:** Professional photographers running team/event headshot shoots.
- **v0.3:** Corporate HR teams running self-capture employee headshot programs (mobile-first guided capture flow).

## Why this is feasible

- Tech is mature: FastAPI + Next.js + Postgres + R2; AI features via Replicate/PhotoRoom APIs (no GPU infra needed at start).
- Tether integration with Capture One and Smart Shooter both work via the same trick: put the active participant's name on the system clipboard and their "Clipboard Contents" rename token picks it up.
- Realistic profit model: $0.5M–$1.5M annual net profit at #1 or #2 position in the category.

## Big strategic decisions made (locked in)

| Decision | Choice | Why |
|---|---|---|
| MVP first or build big? | MVP first, three small releases | Faster validation, paying customers earlier |
| Tether software | Capture One first, Smart Shooter close behind | Both use same clipboard mechanism — minimal extra cost for both |
| Tech stack | FastAPI + Next.js + Postgres + R2 + Vercel/Render | Python backend per user preference; modern minimal stack |
| AI strategy | Build in-app via hosted model APIs (not Evoto integration) | Evoto has no API; in-app gives controlled UX |
| Corporate audience | Yes, but via self-capture (not direct competition with photographers) | Expands TAM without losing photographer trust |
| Capture mode for corporates | Smartphone-guided self-capture for v0.3; marketplace for v2 | Smaller MVP scope, validates self-capture flow first |
| Pricing | Solo $29 / Pro $44 / Studio $89 / Hibernate $7 + AI overage | Undercuts competitor, hibernate is unique retention play |

## Roles

- **User (Lingaraj):** Decisions, account creation, photographer beta testers, final reviews.
- **Claude:** All coding, docs, scaffolding, deployment configs.

## Files in this docs folder

- `PROJECT_OVERVIEW.md` — this file. Start here every session.
- `SESSION_LOG.md` — **read the latest entry first when resuming.** Per-session log.
- `MVP_ROADMAP.md` — release-by-release feature list.
- `ARCHITECTURE.md` — tech architecture, data model, services map.
- `DECISIONS.md` — log of every meaningful decision and the reasoning.
- `BRAND.md` — colors, logo direction, naming conventions.
- `OPEN_QUESTIONS.md` — things still to answer.
- `USER_TASKS.md` — homework list for the user (account setup, etc.).

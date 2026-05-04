# Decisions Log

A running list of meaningful decisions and the reasoning behind each. Append-only — new decisions go at the bottom with a date.

---

## 2026-05-03 — Project kickoff decisions

### D-001 — MVP-first build approach
**Decision:** Ship in three small releases (v0.1 photographer core, v0.2 AI layer, v0.3 corporate self-capture).
**Why:** Faster validation, paying customers earlier, lower risk than a "big bang" release.

### D-002 — Tether software priority
**Decision:** Capture One first; Smart Shooter immediately after.
**Why:** User preference. Both use the same clipboard-rename mechanism so supporting both is minimal extra cost.

### D-003 — Tech stack
**Decision:** FastAPI (Python) + Next.js (TypeScript) + Postgres + Cloudflare R2 + Vercel/Render hosting.
**Why:** User comfort with Python; Next.js is the standard for modern minimal SaaS frontends; R2 has S3 compatibility with cheaper egress; Vercel + Render gets us live without server admin.

### D-004 — AI strategy: build in-app, not integrate Evoto
**Decision:** Build AI features natively using hosted model APIs (Replicate, PhotoRoom).
**Why:** Evoto has no public API. Filesystem integration is brittle and forces customers to maintain a separate Evoto subscription. In-app gives controlled UX and is the differentiator vs. competitors.

### D-005 — Two audiences
**Decision:** Serve both photographers AND corporates, but route corporate work in a way that doesn't compete with photographers.
**Why:** Massively expands TAM. Photographer relationship preserved by (a) self-capture mode for cases where a photographer wouldn't have been hired anyway, and (b) optional marketplace mode in v2 that sends paid work to photographers.

### D-006 — Corporate capture mode for MVP
**Decision:** Smartphone-guided self-capture only for v0.3. Marketplace deferred to v2.
**Why:** Smaller MVP scope, validates self-capture before building marketplace mechanics (vetting, payouts, ratings).

### D-007 — Pricing tiers
**Decision:**
- Solo: $29/mo (1 photographer, 5 active jobs, 200 AI images included)
- Pro: $44/mo (unlimited jobs, 1000 AI images included)
- Studio: $89/mo (everything unlimited, white-label, priority support)
- Hibernate: $7/mo (read-only, galleries stay live, no new jobs)
- AI overage: $0.05/image (Solo), $0.03/image (Pro), $0 (Studio)
**Why:** Undercuts headshottools.com's $59 flat rate while including AI features they don't have. Hibernate is unique in the category and addresses photography's seasonal cycle.

### D-008 — Brand name (locked 2026-05-04)
**Decision:** HeadshotDesk.
**Why:** Includes "headshot" keyword for SEO discoverability. Workspace metaphor scales from photographers ("my headshot desk") to corporate ("the team's headshot desk"). Monogram HD has a happy double-meaning with High Definition. Codebase, docs, and brand assets renamed from working name "ShootDesk".

### D-009 — Hosting / deployment targets
**Decision:**
- Frontend: Vercel
- Backend: Render or Railway (decide at deploy time)
- Database: Supabase or Neon (decide at deploy time)
- Storage: Cloudflare R2
- Email: Postmark (or Resend as alternative)
- Payments: Stripe
- AI: Replicate + PhotoRoom
**Why:** Minimum infra ops, all have generous free/dev tiers, all are pivot-able later.

### D-010 — Code ownership
**Decision:** Claude writes all code. User reviews at agreed checkpoints (especially auth, billing, data security).
**Why:** User wants to hand off coding entirely; will spot-check critical paths.

---

---

## 2026-05-04 — Scalability-driven infrastructure decisions

### D-011 — Vercel Pro from launch
**Decision:** Vercel Pro ($20/mo per seat) starting at launch.
**Why:** Hobby plan forbids commercial use; would violate TOS once we have paying customers. Pro also unlocks 1TB bandwidth and analytics. Vercel scales to massive sites (Stripe, Notion) — no migration ceiling.

### D-012 — Database: Neon Pro (not Supabase)
**Decision:** Neon Pro ($19/mo) from launch.
**Why:** Database branching (every PR gets ephemeral Postgres copy), autoscaling compute, point-in-time recovery. Supabase ships features we don't need (auth, realtime). Neon is "just Postgres, but better."

### D-013 — Backend hosting: Railway, with Fly.io migration plan
**Decision:** Start on Railway (~$20-25/mo for backend + Redis). Plan to migrate to Fly.io or AWS ECS around $1M ARR.
**Why:** Fastest DX for MVP. Migration is mechanical, not architectural — keep services stateless to make it easy.

### D-014 — Email: Postmark (not Resend)
**Decision:** Postmark $15/mo from launch.
**Why:** Highest deliverability in the industry. Email is the gallery-delivery channel — must land in inbox. Resend is cheaper at huge scale; revisit at >100k emails/mo.

### D-015 — Storage: Cloudflare R2 with cold-tier strategy
**Decision:** R2 from day one. Pay-per-use, no fixed monthly. Move hibernated accounts to R2 Infrequent Access (cold tier) automatically.
**Why:** Zero egress fees vs S3 = $0 vs $90/mo per TB downloaded. Hibernate cold-tier optimization keeps that $7/mo plan margin-positive.

### D-016 — AI: Replicate + PhotoRoom for MVP, abstract for future swap
**Decision:** Replicate (pay-per-call) for skin retouch + face restoration, PhotoRoom Pro ($99/mo, only after v0.2 launches) for background removal. Build AI service behind one interface so we can swap.
**Why:** Fastest integration. PhotoRoom quality > open-source for portraits. Migration trigger: >5,000 images/day → move to Modal or self-hosted GPU (3-5× cheaper at volume).

### D-017 — Auth: roll our own JWT for MVP, plan Clerk swap at ~$50K ARR
**Decision:** Use the JWT-based auth already scaffolded. Migrate to Clerk when complexity (MFA, social login, SSO) starts mattering.
**Why:** ~50 lines of throwaway code now, save the $25/mo + integration time. Auth code is straightforward to swap because it's contained in one module.

### D-018 — Add monitoring, logging, analytics from day one
**Decisions:**
- **Sentry** for error monitoring (free up to 5k errors/mo, $26/mo Team after)
- **PostHog** for product analytics + feature flags + session replay (free up to 1M events/mo)
- **Axiom** for log aggregation (free up to 0.5GB/day)

**Why:** All have free tiers that cover MVP scale. Skipping these means flying blind at 2am when something breaks. Add the SDKs at scaffold time, not later.

### D-019 — Domain registrar: Cloudflare
**Decision:** Cloudflare Registrar.
**Why:** At-cost pricing (no markup). ~$10/year vs $15-20 elsewhere. Domain DNS already there, simpler ops.

### D-022 — Domain (locked 2026-05-04)
**Decision:** `headshotdesk.com` registered.
**Why:** Matches the brand exactly. `.com` for trust.
**Next:** Once Cloudflare account exists, transfer DNS to Cloudflare for at-cost renewals + R2 + DDoS protection. Set `frontend.headshotdesk.com` and `api.headshotdesk.com` as planned subdomains.

### D-021 — Logo direction (locked 2026-05-04)
**Decision:** Combined design — Concept C "HD" monogram tile + Concept B two-tone wordmark ("Headshot" in `#5B6CFF`, "Desk" in `#0B0F1A`).
**Why:**
- HD monogram doubles as "High Definition" — earned double-meaning for a photography product.
- Tile gives us a strong, square icon for favicons, app icons, and social avatars.
- Two-tone wordmark adds personality without requiring a separate graphic mark.
- Blue is anchored at two scales (the accent dot on the tile + the "Headshot" wordmark) — feels like a system, not a repeat.

**Assets:**
- `docs/logo-final.svg` — full lockup
- `docs/logo-icon.svg` — icon only
- `frontend/public/logo.svg`, `logo-icon.svg`, `favicon.svg` — production copies

The three original concept drafts (`logo-concept-a/b/c.svg`) remain in `docs/` for historical reference but are superseded. Do not use them.

### D-020 — Estimated monthly burn
- **Pre-launch dev:** ~$60/mo (Vercel + Railway + Neon + Postmark)
- **Post-launch, first 50 paying customers:** ~$200-250/mo fixed + variable AI/Stripe costs
- All within projected gross margin from the unit economics model.

---

## Decisions still pending (move to above when made)
- Final brand name (currently working as HeadshotDesk)
- Logo direction (3 options drafted: A aperture, B wordmark, C monogram)
- Primary accent color (3 options drafted in BRAND.md; recommendation: B Cool Studio)
- Domain name
- Whether to add per-shoot "Day Pass" SKU at launch or wait for v2
- Free trial vs. money-back guarantee
- Photographer beta tester recruitment plan

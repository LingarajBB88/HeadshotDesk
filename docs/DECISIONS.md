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
**Status:** Superseded on 2026-07-25 by D-024 (Path B: Evoto via hot folder). Kept for the record.
**Decision:** Build AI features natively using hosted model APIs (Replicate, PhotoRoom).
**Why:** Evoto has no public API. Filesystem integration is brittle and forces customers to maintain a separate Evoto subscription. In-app gives controlled UX and is the differentiator vs. competitors.

### D-005 — Two audiences
**Decision:** Serve both photographers AND corporates, but route corporate work in a way that doesn't compete with photographers.
**Why:** Massively expands TAM. Photographer relationship preserved by (a) self-capture mode for cases where a photographer wouldn't have been hired anyway, and (b) optional marketplace mode in v2 that sends paid work to photographers.

### D-006 — Corporate capture mode for MVP
**Decision:** Smartphone-guided self-capture only for v0.3. Marketplace deferred to v2.
**Why:** Smaller MVP scope, validates self-capture before building marketplace mechanics (vetting, payouts, ratings).

### D-007 — Pricing tiers
**Status:** Superseded on 2026-07-25 by D-023. The AI allotments below no longer apply (see D-024).
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
**Status:** Superseded on 2026-07-25 by D-024. HeadshotDesk hosts no AI processing.
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

## 2026-07-25 — Pricing, trial, and retouching strategy

### D-023 — Free trial and billing model (locked 2026-07-25, prices revised and frozen 2026-10-25)
**Decision:** Tiers, USD only at launch. Prices are frozen until 20 paying customers; do not reopen before then.

| Tier | Monthly | Yearly (two months free) | Included |
|---|---|---|---|
| Starter | $25 | $250 | 1 active job at a time. (Participant cap of 40 dropped 2026-10-25 by Lingaraj: one active job already defines the tier.) |
| Pro | $59 | $590 | Unlimited jobs and participants, and every workflow differentiator: client entity and dashboard, Evoto bridge, duplicate job, proofing flow, multi-photographer when shipped. |
| Studio | $100 | $1,000 | Pro plus the identity and service layer: emails from the photographer's own domain (with the deliverability engineering on the branded-email card), white-label galleries (custom domain at v0.3), priority support same business day, one-time concierge onboarding call (extra setup calls $49), feature-request fast lane (flags and early access, never per-customer forks). Shown on the pricing page from day one as a priced waitlist; opens when the own-domain email ships. |
| Hibernate | $10 | | Read-only for paying customers going seasonal: galleries stay live, no new jobs. |

Founding offer, private and never on the website: beta partners get 50% off Pro for their first twelve months, offered personally in demos and outreach. Implemented as a Stripe promotion code, not in product code.

Decided out: per-seat billing (shelved until there is demand), multi-photographer in Studio (it stays in Pro, where it wins the comparison), a $50 Pro price, any public founding banner, a perpetual monthly concierge call.

Tier-split principle: workflow differentiators go to Pro; identity and service go to Studio.

Free trial: one month, no card required. The principle is free to test the workflow, pay to deliver real work.
- Free during the trial: creating jobs, adding participants (manual, CSV, public signup link), shoot mode, uploads, the watch folder, and the photographer previewing galleries.
- Paid only, always: sharing a gallery link with a participant, delivery emails, and (probably) branded galleries.
- Day 31: soft lock. The account becomes read-only, data is kept, and subscribing unlocks it at any time. No dunning and no involuntary charges, since no card is on file until the photographer chooses to pay.

Add-on revenue (F6 paid extras, v0.2): HeadshotDesk takes 0%; the photographer keeps everything. Revisit a small share once F6 has traction.

**Why:** Starter undercuts every competitor and is a true entry price for solo and low-volume work. Pro at $59 is parity with HeadshotTools' flat rate with more product behind it ("same price, twice the product"); a $50 price was a round-number preference that gave up ARPU and signalled less. Studio is priced from day one so the ladder is visible and demand is measurable before its features exist. Annual from day one because photographers budget by season. The trial lets a photographer run one real shoot end to end before paying, which is the activation moment.
**Watch:** Starter's single active job is tight by design. After six months, if more than 30% of Starter cancellations cite it rather than upgrading, loosen it to 2 active jobs.
**Implementation status (2026-10-26):** Built on branch `stripe-billing` (HSD-21): monthly and yearly Checkout, Customer Portal, webhook mirror, Studio waitlist button; paywalls stay off until Stripe keys are set. Trial-ending and trial-ended emails exist but stay off (`trial_emails_enabled = False`) until billing is live.

### D-024 — Retouching: integrate Evoto via hot folder, no native AI (Path B, supersedes D-004 and D-016)
**Decision:** HeadshotDesk does not build or host AI retouching, background swap, or skin work. Photographers keep their own retouching tool (Evoto, Retouch4Me, Imagen, or by hand) and connect it through folders: HeadshotDesk exports picks to the tool's hot folder and picks finished files back up from its export folder.
**Why:** Photographers already pay for and trust these tools; meeting them where they work beats asking them to switch. It removes per-tier AI credits and overage maths from pricing (D-023), lowers cost to serve, and keeps HeadshotDesk focused on the workflow around the camera, which is where competitors are weakest. The original objection in D-004 (no Evoto API, brittle filesystem integration) is answered by the watch folder already proving reliable in production.
**Consequences:** No "AI included" claims anywhere in product or marketing copy. Evoto is presented as a partner. The v0.2 story is the Evoto help guide (HSD-73), the hot-folder pipeline (HSD-72), and the job setup wizard (HSD-74).

## 2026-10 — Analytics

### D-025 — Web analytics: Plausible, never on token routes
**Decision:** Plausible (paid plan from 2026-10) for website analytics and custom events (`Signup`, `Job created`, `Start free clicked`, `Demo clicked`), sent through `frontend/lib/track.ts`. The script is never loaded on `/g/ /q/ /c/ /r/`, whose paths carry access tokens. See `docs/ANALYTICS.md`.
**Why:** Cookieless and privacy-first like Cloudflare's free analytics, but with goals, UTM conversion, scroll depth, and funnels, which is what tells us which channel produces accounts rather than visits. Replaces PostHog from D-018 for marketing-site analytics; product analytics in the app can be revisited later.

### D-026 — Payments: Stripe, not Mollie (2026-10-24)
**Decision:** Stripe Billing (Checkout, Customer Portal, webhook) for subscriptions. USD first; EUR prices can be added later as configuration only, with each customer's currency fixed at first checkout.
**Why:** US-first customers paying by card; hosted checkout and self-serve billing management without building them; Stripe Tax for US and EU tax; one provider with the planned Stripe Connect for paid extras (F8 Phase 3). Mollie is stronger for iDEAL and SEPA in the Benelux but would need much of the subscription management built by hand, and Stripe also supports iDEAL.
**Implementation:** `docs/BILLING.md`. Paywalls stay off until Stripe keys are configured.

---

## Decisions still pending (move to above when made)
- Whether to add a per-shoot "Day Pass" SKU at launch or wait for v2
- Photographer beta tester recruitment plan

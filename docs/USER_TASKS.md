# User Tasks

Things only Lingaraj can do. Claude can't create accounts, deploy to production, or talk to humans.

## Before next session

### Required (~1-2 hours total)
- [ ] **Domain name** — buy via Cloudflare Registrar (at-cost pricing). Suggested: `headshotdesk.com` or `headshotdesk.app`.
- [ ] **GitHub** — create account, create a private repo named `headshotdesk`. We'll move the scaffolded code there.
- [ ] **Cloudflare** — sign up (free). Manages domain DNS + R2 storage.
- [ ] **Vercel** — sign up with GitHub login. Free tier for dev; **upgrade to Pro ($20/mo) before launch** (Hobby plan forbids commercial use).
- [ ] **Railway** — sign up. Plan: $5 trial credit, then ~$20-25/mo once we deploy backend + Redis.
- [ ] **Neon** — sign up. Free for dev (0.5GB); **upgrade to Pro ($19/mo) before launch** for branching, autoscaling, point-in-time recovery.
- [ ] **Stripe** — create account, stay in test mode for now. No card needed yet.
- [ ] **Postmark** — sign up. Free for 100 emails/month while we build; **upgrade to $15/mo plan before launch.**

### Add at launch (don't pay yet, but we'll wire them up)
- [ ] **Sentry** — error monitoring. Free up to 5k errors/mo.
- [ ] **PostHog** — product analytics + feature flags + session replay. Free up to 1M events/mo.
- [ ] **Axiom** — log aggregation. Free up to 0.5GB/day.

### Add for v0.2 (AI features)
- [ ] **Replicate** — sign up, add $10 credit. Pay-per-prediction.
- [ ] **PhotoRoom** — sign up. $99/mo for 5,000 background-removal API calls (only kicks in once you have real volume).

## Beta tester recruitment
- [ ] Reach out to the photographers you mentioned. We don't need them yet, but warming them up now helps.
- [ ] Goal: 3–5 active beta photographers willing to test v0.1 and give feedback within 48 hours of release.

## Decisions to make
- [ ] Pick a primary accent color from the brand options (see `BRAND.md` once drafted)
- [ ] Pick a logo direction (3 options will be drafted)
- [ ] Confirm pricing structure (current proposal in `DECISIONS.md` D-007)
- [ ] Free trial — yes or no? What length?

## After accounts are created — share with Claude next session
For each account, you'll need to either:
- Add Claude/me as a collaborator (GitHub repo)
- Generate API keys (Stripe, Postmark, Replicate, R2 bucket creds) and share securely

We'll set this up when you come back. Nothing needs to be live yet.

## What you do NOT need to do right now
- ❌ Connect billing on any of the dev-tier services (free is enough)
- ❌ Buy a finished logo from a designer (we'll iterate on drafts first)
- ❌ Write any code (Claude handles that end to end)
- ❌ Set up servers or deployment manually (we'll wire up Vercel + Render auto-deploy from GitHub)

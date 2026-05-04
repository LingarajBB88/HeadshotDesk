# User Tasks

Things only Lingaraj can do. Claude can't create accounts, deploy to production, or talk to humans.

## Before next session

### Done ✅
- [x] **Domain** — `headshotdesk.com` registered
- [x] **GitHub** — `LingarajBB88/HeadshotDesk` repo, scaffold pushed (commit `7c88359`)

### Still needed before deployment (~30 min)
- [ ] **Cloudflare** — sign up (free). Transfer domain DNS here for at-cost renewals + R2 storage. Then create an empty R2 bucket called `headshotdesk-dev`.
- [ ] **Vercel** — sign up with GitHub login. Free tier for dev; **upgrade to Pro ($20/mo) before launch.**
- [ ] **Railway** — sign up. ~$20-25/mo once we deploy.
- [ ] **Neon** — sign up. Free for dev; **Pro ($19/mo) before launch.**
- [ ] **Stripe** — create account, test mode is fine. No card yet.
- [ ] **Postmark** — sign up. Free for 100 emails/mo; $15/mo before launch.

### Add at launch
- [ ] **Sentry** — error monitoring (free up to 5k errors/mo)
- [ ] **PostHog** — analytics + feature flags + session replay (free up to 1M events/mo)
- [ ] **Axiom** — log aggregation (free up to 0.5GB/day)

### Add for v0.2 (AI features)
- [ ] **Replicate** — sign up, $10 credit
- [ ] **PhotoRoom** — sign up ($99/mo only when volume justifies)

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

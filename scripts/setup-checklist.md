# Setup Checklist (next session)

Bring these to the next session and we'll wire everything up.

## Accounts you should create
- [ ] Domain registered (suggest `headshotdesk.com` or `headshotdesk.app`)
- [ ] GitHub account + private repo `headshotdesk` (push the scaffolded code into it)
- [ ] Cloudflare account (for DNS + R2)
- [ ] Vercel account (frontend deploy)
- [ ] Render OR Railway (pick one for backend deploy)
- [ ] Supabase OR Neon (pick one for managed Postgres)
- [ ] Stripe account (test mode is fine)
- [ ] Postmark account (free tier)

## Decisions to bring
- [ ] Logo: which of A / B / C concepts in `docs/`?
- [ ] Color: confirm Cool Studio (B), or pick A/C?
- [ ] Final brand name (or proceed with HeadshotDesk?)
- [ ] Free trial — yes, what length?
- [ ] Photographer beta testers — names + a way to invite them when v0.1 hits internal beta

## What I'll do next session (assuming above is done)
1. Move scaffold to your GitHub repo
2. Wire up Vercel → frontend, Render → backend, Supabase → Postgres
3. Build the first feature: **auth + account creation**
4. Build the second feature: **job CRUD + CSV participant import**

By end of next session, you should be able to log in to a deployed dev environment and create your first job.

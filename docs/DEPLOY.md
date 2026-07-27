# Deploying HeadshotDesk to production

Target architecture (decided 2026-07-20):

```
headshotdesk.com        → Vercel (Next.js frontend)
api.headshotdesk.com    → Render, Frankfurt (FastAPI backend, Docker)
Postgres                → Render managed DB, Frankfurt
Photos                  → Cloudflare R2, bucket headshotdesk-prod
Email                   → Postmark (DKIM-verified on headshotdesk.com)
DNS                     → Cloudflare (nameservers already there)
```

Redis is intentionally NOT deployed — configured in code but unused in
v0.1. Add it when background jobs land.

Everything below is ordered. Steps marked **[you]** need dashboard access /
billing; steps marked **[auto]** happen because of files in this repo.

---

## 0. Prerequisites

- [ ] GitHub repo is pushed and up to date (`render.yaml` at repo root).
- [ ] You can log into: Cloudflare (owns headshotdesk.com DNS), GitHub.
- [ ] Generate the production JWT secret now and keep it somewhere safe:
  `python3 -c "import secrets; print(secrets.token_urlsafe(64))"`

## 1. Cloudflare R2 (photo storage) **[you]**

1. Cloudflare dashboard → R2 → Create bucket → name: `headshotdesk-prod`.
   Location hint: European Union.
2. R2 → Manage API tokens → Create API token:
   - Permissions: Object Read & Write
   - Scope: only the `headshotdesk-prod` bucket
3. Note down: **Account ID**, **Access Key ID**, **Secret Access Key**.

## 2. Postmark (email) **[you]**

1. Create account at postmarkapp.com (new accounts start in "test mode" —
   you may need to request approval to send to arbitrary addresses; do this
   early, approval can take a day).
2. Add a Sender Signature / Domain: `headshotdesk.com`.
3. Postmark shows you two DNS records (DKIM + Return-Path). Add both in
   Cloudflare DNS. Wait for Postmark to show "Verified".
4. Note down the **Server API token** (Server → API Tokens).

## 3. Render (backend + Postgres) **[you]**

1. Create account at render.com → New → **Blueprint** → connect the GitHub
   repo. Render reads `render.yaml` and proposes:
   - Web service `headshotdesk-api` (Docker, Frankfurt, starter plan)
   - Postgres `headshotdesk-db` (Frankfurt, basic plan)
2. Before first deploy, fill the secrets it asks for:

   | Env var | Value |
   | --- | --- |
   | `JWT_SECRET` | the token you generated in step 0 |
   | `POSTMARK_SERVER_TOKEN` | from step 2 |
   | `R2_ACCOUNT_ID` | the **32-char hex Account ID** from the R2 dashboard sidebar — NOT an API token (`cfat_…`) and not the access key. It becomes part of the endpoint hostname. |
   | `R2_ACCESS_KEY_ID` | from step 1 (32 hex chars) |
   | `R2_SECRET_ACCESS_KEY` | from step 1 (64 hex chars) |

3. Deploy. The docker command runs `alembic upgrade head` first — the
   database schema comes up automatically.
4. When the service is live, open its `onrender.com` URL + `/health` —
   should return OK.
4b. **Then open `/health/storage`.** It round-trips an object through R2
   and returns `{"status":"ok","mode":"r2",...}`. Anything else means
   uploads will fail: photos and client logos get skipped silently by
   design (the API still answers 200), so this check is the only quick
   way to know storage is really working. Re-run it after any change to
   the R2 variables.
5. Service → Settings → Custom Domain → add `api.headshotdesk.com`.
   Render shows a CNAME target — add it in Cloudflare DNS (see step 5).

## 4. Vercel (frontend) **[you]**

1. Create account at vercel.com → Add New Project → import the GitHub repo.
2. Settings:
   - **Root Directory:** `frontend`
   - Framework preset: Next.js (auto-detected)
3. Environment variable (Production):

   | Env var | Value |
   | --- | --- |
   | `NEXT_PUBLIC_API_URL` | `https://api.headshotdesk.com` |

4. Deploy. Then Project → Settings → Domains → add `headshotdesk.com`
   (and `www.headshotdesk.com` → redirect to apex). Vercel shows the DNS
   records to add.

## 5. Cloudflare DNS records **[you]**

Final record set (exact targets come from the Render/Vercel/Postmark
dashboards in the steps above):

| Type | Name | Target | Proxy |
| --- | --- | --- | --- |
| CNAME (or A per Vercel's instruction) | `headshotdesk.com` | Vercel target | DNS only (grey cloud) |
| CNAME | `www` | Vercel target | DNS only |
| CNAME | `api` | Render target (`headshotdesk-api.onrender.com`) | DNS only |
| TXT/CNAME | DKIM name from Postmark | Postmark value | DNS only |
| CNAME | Return-Path name from Postmark | Postmark value | DNS only |

**Keep the proxy OFF (grey cloud)** for the Vercel + Render records — both
platforms manage their own TLS and Cloudflare proxying in front of them
causes redirect loops and cert issues.

## 6. Smoke test checklist

After DNS propagates (minutes on Cloudflare):

- [ ] `https://headshotdesk.com` loads the app, `https://api.headshotdesk.com/health` returns OK.
- [ ] Sign up a fresh photographer account (real email).
- [ ] Forgot-password → email actually arrives via Postmark.
- [ ] Create a job → open signup link in a private window → sign up as a
      participant **with the consent checkbox**.
- [ ] Upload a photo → confirm it lands in the R2 bucket (Cloudflare
      dashboard → R2 → bucket → objects).
- [ ] Mark shot, Deliver → participant email arrives with working gallery
      link on https://headshotdesk.com/g/…
- [ ] Download a photo from the gallery (JPEG) and two (zip).
- [ ] `https://headshotdesk.com/privacy` and `/terms` render.

## 7. Post-launch

- Set up Render's health-check alerts (Settings → Notifications).
- Postmark: watch the Activity tab for bounces on the first real delivery.
- Backups: Render basic Postgres has automated daily backups — verify
  they're on. R2 objects have no versioning by default; acceptable for
  beta, revisit before charging customers.
- When background jobs arrive: add the Redis (`keyvalue`) service to
  render.yaml and set `REDIS_URL`.

## Costs (approx, monthly)

| Item | Plan | ~Cost |
| --- | --- | --- |
| Render web service | Starter | $7 |
| Render Postgres | Basic 256MB | $7 |
| Vercel | Hobby (fine for beta) | $0 |
| Cloudflare R2 | Pay-as-you-go | ~$0–2 at beta scale |
| Postmark | Free tier 100 emails/mo, then $15/10k | $0–15 |
| **Total** | | **~$15–30/mo** |

Note: Vercel Hobby is for non-commercial use — HeadshotDesk beta
(free, invite-only) is borderline; move to Pro ($20/mo) when charging
customers or if Vercel flags it.

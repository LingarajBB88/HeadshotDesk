# MVP Roadmap

Three small releases. Each ships independently and each can generate revenue.

---

## v0.1 — Photographer Core
**Goal:** Replace headshottools.com workflow end-to-end (minus AI features).
**Calendar target:** 3–5 weeks from kickoff.
**Done when:** A photographer can run a complete shoot through HeadshotDesk and bill it.

### Features
- [ ] Authentication (email + password, magic link optional)
- [ ] Photographer onboarding flow
- [ ] Stripe billing (Solo / Pro / Studio / Hibernate tiers)
- [ ] Job CRUD (create, edit, archive)
- [ ] Participant CSV upload
- [ ] Auto-generated participant signup form (public URL per job)
- [ ] Capture One tether integration (clipboard rename helper — desktop app)
- [ ] Watch-folder upload pipeline (export from Capture One → auto-upload to HeadshotDesk)
- [ ] Auto-sort uploaded files into per-participant galleries by filename
- [ ] Branded participant gallery (private link)
- [ ] Email delivery to each participant with their gallery link
- [ ] Basic favorite/select photos in gallery
- [ ] Photographer dashboard (job list, status, simple metrics)

### Out of scope for v0.1
- AI processing (deferred to v0.2)
- Smart Shooter integration (deferred — Capture One first)
- Multi-photographer event mode (v1.x)
- Model release e-signatures (v1.x)

---

## v0.2 — AI Layer
**Goal:** Differentiate on substance. Beat competitor on features, not just price.
**Calendar target:** 2–3 weeks after v0.1 launches.
**Done when:** Photographer can apply AI processing to entire gallery with one click.

### Features
- [ ] Background removal + swap (3-4 preset backgrounds + custom upload)
- [ ] Skin retouching with preset "looks" (Natural / Editorial / Corporate)
- [ ] Auto-crop pack (LinkedIn 400×400, Slack, Teams 360×360, badge sizes)
- [ ] AI processing job queue (with progress display)
- [ ] Stripe metered billing for AI overage
- [ ] Per-job AI settings (which look, which background, which crops)

### Tech additions
- Replicate API integration for skin retouch + face restoration
- PhotoRoom or BiRefNet for background removal
- MediaPipe / InsightFace for face detection (auto-crop)
- Background job processing (Celery or simpler RQ)

---

## v0.3 — Corporate Self-Capture
**Goal:** Open up the second audience using all the same backend.
**Calendar target:** 3–4 weeks after v0.2 launches.
**Done when:** A company can invite 50 employees, who each self-capture, and HR gets a dashboard with retouched results.

### Features
- [ ] Corporate workspace type (separate from photographer accounts)
- [ ] HR admin invites employees via email or CSV
- [ ] Mobile-first guided self-capture web app
  - Real-time face position guides
  - Lighting hints
  - Multi-frame capture
- [ ] Same AI pipeline applied to self-captured photos
- [ ] HR admin dashboard (who's done, who's pending, bulk download)
- [ ] Per-company branded galleries
- [ ] Employee can review + retake their headshot

### Out of scope for v0.3
- Native mobile apps (web works on phone — native is v1.x)
- Office kiosk mode (v1.x)
- White-label (v1.x)

---

## Post-MVP backlog (v1.x — not committed, ranked by value)
- Smart Shooter tether helper
- Photographer marketplace (corporate ↔ photographer matching)
- Multi-photographer event mode
- Model release e-signatures
- White-label gallery branding
- Native iOS/Android capture app
- Office kiosk mode (iPad-based)
- Slack / Teams integration for delivery
- API + Zapier integration
- Lightroom watch-folder mode (no rename, manual sort)
- Live preview screen at events

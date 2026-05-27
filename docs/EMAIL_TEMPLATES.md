# Email & messaging templates

HSD-48 — engineering principle: every outbound HeadshotDesk message (email
today, eventually any participant-visible system message) is rendered from a
file-backed template through `app.services.template_service.render_email`.
**No hardcoded copy in code.** This page is the canonical variable namespace
those templates can use.

If you're adding a new outbound message, add a 3-file bundle to
`backend/app/templates/emails/`:

```
emails/{name}.subject.txt
emails/{name}.txt         ← plain-text body
emails/{name}.html        ← HTML body
```

…and call `render_email("{name}", context)` from `email_service.py`. The
helper returns `{subject, text, html}`.

`StrictUndefined` is on, so a template referencing a missing variable raises
at render time. That is intentional — better to fail loudly in dev than
quietly send "Hi ,".

---

## Variable namespace

Variables are namespaced by entity. The canonical set is enumerated below;
templates should only reference variables from this list. When a new message
needs a new variable, add it here first, then make every send-site that
calls that template populate it.

### `app.*` — application-level constants

| Variable | Type | Notes |
| --- | --- | --- |
| `app.name` | string | `"HeadshotDesk"`. Used in subject lines and signatures. |

### `participant.*` — the person receiving the email

| Variable | Type | Notes |
| --- | --- | --- |
| `participant.name` | string | Full name as entered by the photographer or filled at signup. |
| `participant.first_name` | string | First whitespace-delimited token of `participant.name`. Falls back to `"there"` if name is empty. |
| `participant.email` | string | Their email address. Rarely templated (it's already the `To:`). |

### `photographer.*` — the studio user the message is being sent on behalf of

| Variable | Type | Notes |
| --- | --- | --- |
| `photographer.display_name` | string | The user's name on the photographer account. Falls back to the account/studio name when the user has no name set. |

### `job.*` — the shoot

| Variable | Type | Notes |
| --- | --- | --- |
| `job.name` | string | The job title, e.g. `"Headshots for ABN AMRO"`. |
| `job.shoot_date` | date or null | Shoot day. Format inside the template (`{{ job.shoot_date.strftime("%a %d %b %Y") }}`). |
| `job.location` | string or null | Shoot location string. |
| `job.client_name` | string or null | Free-text client name. Will be replaced by `client.name` once the Client entity ships. |

### `gallery.*` — links into the per-participant gallery

| Variable | Type | Notes |
| --- | --- | --- |
| `gallery.url` | string | Full `https://headshotdesk.com/g/{token}` URL. Required for the gallery delivery email; required-variable check at render time will catch its absence. |

### `reset.*` — password reset specifics

| Variable | Type | Notes |
| --- | --- | --- |
| `reset.url` | string | The full reset URL with token. |
| `reset.expires_in` | string | Human-readable TTL, e.g. `"1 hour"`. |

### `user.*` — the photographer account user (separate from `photographer`, used in account-level emails like password reset)

| Variable | Type | Notes |
| --- | --- | --- |
| `user.name` | string | Display name to greet in the body. |

---

## Future variables (reserved, not yet wired)

These are anticipated by the variable contract but not yet plumbed because
the underlying entity / feature hasn't shipped. Listed here so template
authors don't accidentally pick conflicting names.

| Variable | Reserved for |
| --- | --- |
| `client.name`, `client.logo_url` | HSD-36 — Client entity with logo. Will replace the free-text `job.client_name` once the migration runs. |
| `account.studio_name` | If we ever expose the account name separately from photographer display name. |
| `signup.url` | Signup invite emails when those land. |
| `picks.*` | F5b.2 participant picks. |
| `messages.*` | In-app messaging email digests. |

---

## Conventions

- **Subject lines** are a `.subject.txt` file (single line, but kept in a
  template file so customization UI can edit it). The helper strips trailing
  whitespace so a trailing newline in the file doesn't break the email
  header.
- **Plain text body** is the source of truth for content. Mail clients that
  strip HTML still get a readable message.
- **HTML body** mirrors the text body but with HTML structure + the brand
  accent color for CTA buttons.
- **No conditional logic** inside templates beyond simple variable
  substitution. If a message needs branching (e.g. different copy for first
  send vs resend), that's the calling code's job, not Jinja's.
- **No personally-identifying surprises**: only use variables documented
  here. If a template needs a new field, add it to this doc first.

---

## v0.2 — customizable communications

HSD-49 will let photographers override these templates from the settings
UI. The variable namespace above becomes the contract: drag-in chips in
the editor map 1:1 to these names. Adding a new variable here is the same
as adding a new chip to the customization editor — coordinated change.

When HSD-49 lands, `render_email` grows a per-photographer override lookup
that checks for a custom version before falling back to the file. The
template authoring conventions on this page don't change.

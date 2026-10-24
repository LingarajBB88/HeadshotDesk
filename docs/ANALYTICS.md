# Analytics (Plausible)

The script loads everywhere except token routes (`/g/ /q/ /c/ /r/`), see
`frontend/components/Analytics.tsx`. Custom events are sent through
`frontend/lib/track.ts`, never directly.

## Goals to create in Plausible

Site settings → Goals → Add goal → Custom event, names exactly:

| Event | Fired when | Props |
|---|---|---|
| `Signup` | an account is created | none |
| `Job created` | a job is created (unique conversions ≈ accounts that made one) | none |
| `Start free clicked` | a "Try it free" or "Create your account" CTA on the home page | `where`: nav, hero, closing |
| `Demo clicked` | a "Book a 30-min walkthrough" button (only shown when `NEXT_PUBLIC_DEMO_URL` is set). Bookings themselves happen on Google's page and are not seen here | `where`: hero, closing |

The `where` prop is a custom property. Plausible shows it under the goal's
breakdown if the plan includes custom properties.

## Useful views

- Sources and UTM campaigns, filtered by goal `Signup`: which channel brings
  accounts, not just visits.
- Funnel (if the plan includes funnels): page `/` → page `/signup` → event
  `Signup` → event `Job created`.
- Scroll depth on `/`: whether visitors reach How it works and Features.
- Search Console integration (Site settings → Integrations): search terms.

Never send personal data (names, emails, tokens) as event props.

# Billing (HSD-21)

Stripe Checkout to subscribe, Stripe's Customer Portal to manage, a webhook
to mirror the subscription onto the account. Rules are D-023; code is
`backend/app/services/billing_service.py`.

## Nothing is gated until billing is switched on

`settings.billing_enabled` is true only when `STRIPE_SECRET_KEY` and
`STRIPE_PRICE_PRO_USD` are both set. Until then every paywall is off and the
Plan and billing page says plans open soon. Deploying this code changes
nothing for anyone.

## What each state may do

| State | Deliver | Write | Limits |
|---|---|---|---|
| trial (first month) | no | yes | none |
| expired trial | no | read-only | |
| starter | yes | yes | 1 active job at a time; no participant cap (changed 2026-10-25) |
| pro (and old solo, studio) | yes | yes | none |
| beta seat | yes | yes | none, never expires, survives a cancelled subscription |
| hibernate, cancelled | no | read-only | |

"Deliver" covers the Deliver button, per-person resend, and gallery links
opening for participants. A gallery delivered while paying stays live after
a cancellation. The client handover only exists after delivery, so it
follows.

## Setting up Stripe (once, in test mode first)

1. Create the Stripe account (dashboard.stripe.com), business Panther
   Studios, and stay in **Test mode** until the end-to-end test below passes.
2. **Products** (or let Claude create them through the Stripe connector in test mode): create "HeadshotDesk Starter" with a recurring monthly price
   of 29 USD, and "HeadshotDesk Pro" at 59 USD. Copy each **price ID**
   (`price_...`).
3. **Customer Portal** (Settings → Billing → Customer portal): allow updating
   payment methods, viewing invoices, cancelling (at period end), and
   switching between the two products.
4. **Tax** (optional now, needed before selling widely): turn on Stripe Tax
   and set the products' tax behaviour.
5. **Webhook** (Developers → Webhooks → Add endpoint):
   `https://api.headshotdesk.com/api/v1/billing/webhook`, events
   `checkout.session.completed`, `customer.subscription.created`,
   `customer.subscription.updated`, `customer.subscription.deleted`. Copy the
   **signing secret** (`whsec_...`).
6. **Render**, API service → Environment, add yourself (never paste keys in
   chat): `STRIPE_SECRET_KEY` (test `sk_test_...`), `STRIPE_WEBHOOK_SECRET`,
   `STRIPE_PRICE_STARTER_USD`, `STRIPE_PRICE_PRO_USD`. Save; Render redeploys.
7. The migration runs automatically before the deploy goes live (Render preDeployCommand). Check the Plan and
   billing page shows the two plans.

## End-to-end test (test mode)

1. Sign up a fresh account. Deliver is refused with the "paid plan" note.
2. Settings → Plan and billing → Choose Pro → pay with card
   `4242 4242 4242 4242`, any future date, any CVC.
3. Back on the page within a minute: Current plan Pro, renews on a date.
   Deliver works.
4. Manage billing → switch to Starter → the page shows Starter and the job
   and participant usage.
5. Manage billing → cancel → after the period (or "cancel immediately" in the
   Stripe dashboard) the account turns read-only; delivered galleries still
   open.

Then switch Stripe to live mode, create the same two products there, and
replace the four Render values with the live ones.

## EUR later

Create EUR prices on the same two products and set `STRIPE_PRICE_STARTER_EUR`
and `STRIPE_PRICE_PRO_EUR`. No code change. A customer's currency is fixed at
their first checkout. Choosing the currency by visitor country on the Plan
and billing page is the remaining small piece of work.

## Not yet

- Referral credit months (`accounts.credit_months`) are not applied to Stripe
  invoices yet; apply them as a coupon or customer balance when the first
  referral pays out.
- Hibernate plan is HSD-22.
- Trial emails stay off (`TRIAL_EMAILS_ENABLED`) until billing is live; their
  link now points at /settings/billing.

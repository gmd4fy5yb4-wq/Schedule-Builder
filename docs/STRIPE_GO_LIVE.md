# FieldDay Planner — Stripe Go-Live Runbook

The payment code is already built (Checkout, Customer Portal, signature-verified
webhook, subscription tiers). Nothing here is a code change — this is the
configuration needed to switch payments **on**, plus the two database migrations
that must be applied.

Do **test mode** end-to-end first (Steps 1–6), confirm a test subscription
works, then repeat for **live mode** (Step 7).

> Security note: secret keys (`sk_...`, `whsec_...`, service-role key) go in
> `.env.local` (local) and Vercel env vars (production) **only**. Never commit
> them, never put them in any `NEXT_PUBLIC_*` var, never paste them into chat.

---

## The plan model (already defined in code)

From `src/lib/plans.ts` — your Stripe prices must match these:

| Tier   | Name           | Price      | Limits (leagues / divisions / teams) |
|--------|----------------|------------|--------------------------------------|
| trial  | Free Trial     | $0         | 1 / 2 / 8   (no Stripe price needed) |
| small  | Small League   | $12 / mo   | 1 / 4 / 16                           |
| medium | Mid-Size League| $25 / mo   | 2 / 8 / 32                           |
| large  | Unlimited      | $49 / mo   | 999 / 999 / 999                      |

---

## Step 1 — Apply the database migrations (Supabase SQL editor)

Run in the Supabase SQL editor for project **Alfred Digital Sports**
(`actgfxrinoxlyrprzkoh`). Per project convention, do **not** use the Supabase CLI.

1. If not already applied, run `src/db/migrations/002_create_subscriptions.sql`.
2. **Required:** run `src/db/migrations/009_fix_subscription_rls_policy.sql`.
   This closes a hole where any logged-in user could grant themselves any plan
   for free. **Do not take live payments before this is applied.**

Verify afterward (should return only the SELECT policy, no permissive ALL policy):

```sql
select policyname, cmd, roles
from pg_policies
where tablename = 'user_subscriptions';
```

---

## Step 2 — Create the products & prices in Stripe (TEST mode)

In the Stripe Dashboard, confirm the toggle says **Test mode** (top right).

For each of the three paid tiers, create a Product with a **recurring monthly**
price:

- Product "Small League"  → price **$12.00 / month** → copy the `price_...` ID
- Product "Mid-Size League" → price **$25.00 / month** → copy the `price_...` ID
- Product "Unlimited"     → price **$49.00 / month** → copy the `price_...` ID

These three IDs become `STRIPE_PRICE_SMALL` / `_MEDIUM` / `_LARGE`.

## Step 3 — Get your API keys (TEST mode)

Stripe Dashboard → Developers → API keys:

- **Secret key** (`sk_test_...`) → `STRIPE_SECRET_KEY`
- Publishable key (`pk_test_...`) → only needed if you later add Stripe.js;
  the current redirect Checkout flow does not use it.

## Step 4 — Local `.env.local`

Fill these in `fieldday-planner/.env.local` with the **test** values:

```
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PRICE_SMALL=price_...      # $12 test price
STRIPE_PRICE_MEDIUM=price_...     # $25 test price
STRIPE_PRICE_LARGE=price_...      # $49 test price
STRIPE_WEBHOOK_SECRET=            # filled in by the CLI in Step 5
```

## Step 5 — Test the webhook locally with the Stripe CLI

```bash
cd fieldday-planner

# One-time: install + log in
brew install stripe/stripe-cli/stripe
stripe login

# Terminal A — forward Stripe events to your local webhook route
stripe listen --forward-to localhost:3000/api/payments/webhook
```

`stripe listen` prints a signing secret like `whsec_...`. Put that in
`.env.local` as `STRIPE_WEBHOOK_SECRET`, then in another terminal:

```bash
cd fieldday-planner
npm run dev
```

Go to `http://localhost:3000/pricing`, subscribe with test card
**4242 4242 4242 4242**, any future expiry, any CVC/ZIP. Confirm:

- `stripe listen` shows `checkout.session.completed` → your route returns 200.
- The `user_subscriptions` row for your user flips to `plan_tier` =
  small/medium/large and `subscription_status` = `active`.
- You can now reach the gated app (middleware lets you through).
- `/account` → "Manage billing" opens the Stripe Customer Portal.

Then test cancellation in the portal and confirm the `customer.subscription.deleted`
event resets the row back to `trial` and you're redirected to `/pricing`.

---

## Step 6 — Register the production webhook endpoint

Stripe Dashboard → Developers → Webhooks → **Add endpoint**:

- URL: `https://fielddayplanner.app/api/payments/webhook`
- Events to send:
  - `checkout.session.completed`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`

Copy that endpoint's **Signing secret** (`whsec_...`) — this is the *production*
webhook secret, different from the CLI one. It goes in Vercel (Step 7).

## Step 7 — Go live (Vercel production env vars)

1. In Stripe, flip to **Live mode** and repeat Steps 2–3 and 6 to get **live**
   price IDs, a **live** secret key (`sk_live_...`), and the **live** webhook
   signing secret.
2. In Vercel → project `fieldday-planner` → Settings → Environment Variables,
   set for **Production**:

```
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...   # the LIVE endpoint's secret from Step 6
STRIPE_PRICE_SMALL=price_...      # live $12
STRIPE_PRICE_MEDIUM=price_...     # live $25
STRIPE_PRICE_LARGE=price_...      # live $49
NEXT_PUBLIC_SITE_URL=https://fielddayplanner.app
```

3. Redeploy production (merge `dev` → `main` per repo convention; do not push
   directly to `main`).
4. Do one real-card live purchase yourself, confirm the row updates, then refund
   it from the Stripe Dashboard.

---

## Pre-launch checklist

- [ ] Migration 009 applied — `pg_policies` shows no permissive ALL policy.
- [ ] Test-mode purchase + cancellation verified locally.
- [ ] Production webhook registered; test-event delivery shows 200.
- [ ] All 5 Stripe env vars set in Vercel **Production** with **live** values.
- [ ] `NEXT_PUBLIC_SITE_URL` = `https://fielddayplanner.app` in production
      (controls Checkout success/cancel + portal return URLs).
- [ ] Resend keys set (`RESEND_API_KEY`, `RESEND_FROM_EMAIL`) — currently empty,
      and magic-link login depends on email delivery.
- [ ] One real live purchase made and refunded.

## Known gaps (not blockers, worth a follow-up)

- **Duplicate Stripe customers:** `create-session` always passes
  `customer_email`, so a user who cancels and resubscribes may get a second
  Stripe customer. The Portal still works (it uses the stored `customer_id`),
  but consider reusing an existing customer when one is known.
- **Webhook idempotency / ordering:** Stripe can deliver events more than once
  and out of order. The upserts are mostly safe, but for higher volume consider
  recording processed `event.id`s and handling `invoice.payment_failed`
  (→ `past_due`).

# FieldDay Planner — Stripe Go-Live Runbook

The payment code is already built (Checkout, Customer Portal, signature-verified
webhook, sports-based tiers with annual + one-time season pass). Nothing here is a
code change — this is the configuration needed to switch payments **on**, plus the
database migrations (002, 009, 012) that must be applied.

Do **test mode** end-to-end first (Steps 1–6), confirm a test subscription
works, then repeat for **live mode** (Step 7).

> Security note: secret keys (`sk_...`, `whsec_...`, service-role key) go in
> `.env.local` (local) and Vercel env vars (production) **only**. Never commit
> them, never put them in any `NEXT_PUBLIC_*` var, never paste them into chat.

---

## The plan model (already defined in code)

From `src/lib/plans.ts` — your Stripe prices must match these. Each paid tier has
**two** prices: an annual recurring subscription and a one-time 3-month season pass.

| Tier    | Name       | Annual | Season (one-time) | Limits (sports / divisions / teams) |
|---------|------------|--------|-------------------|-------------------------------------|
| trial   | Free Trial | $0     | —                 | 3 / 10 / 100 for 14 days (no Stripe price) |
| starter | Starter    | $99/yr | $39               | 1 / 3 / 24                          |
| pro     | Pro        | $199/yr| $69               | 3 / 10 / 100                        |
| org     | Org        | $399/yr| $129              | 999 / 999 / 999                     |

Gate is on **sports** (headline); divisions + teams are silent abuse guards.
Annual → Checkout `mode: 'subscription'`. Season pass → `mode: 'payment'` (one-time,
no auto-renew; webhook grants `subscription_end = now+90d`, `stripe_subscription_id=NULL`).

---

## Step 1 — Apply the database migrations (Supabase SQL editor)

Run in the Supabase SQL editor for project **Alfred Digital Sports**
(`actgfxrinoxlyrprzkoh`). Per project convention, do **not** use the Supabase CLI.

1. If not already applied, run `src/db/migrations/002_create_subscriptions.sql`.
2. **Required:** run `src/db/migrations/009_fix_subscription_rls_policy.sql`.
   This closes a hole where any logged-in user could grant themselves any plan
   for free. **Do not take live payments before this is applied.**
3. **Applied June 17, 2026:** `src/db/migrations/012_pricing_sports_gate.sql`
   (`sports_limit`, `trial_started_at`, `billing_period`). Verify the three columns
   exist on `user_subscriptions` and that `sports_limit=999` for all `leagues_limit>=999`
   rows (protects the unlimited testers).

Verify afterward (should return only the SELECT policy, no permissive ALL policy):

```sql
select policyname, cmd, roles
from pg_policies
where tablename = 'user_subscriptions';
```

---

## Step 2 — Create the products & prices in Stripe (TEST mode)

In the Stripe Dashboard, confirm the toggle says **Test mode** (top right).

Create **3 products** (Starter, Pro, Org). Each product gets **two prices** — add
the second via "+ Add another price" on the product page:

- **Starter** → $99.00 **Recurring/Yearly** + $39.00 **One time** ⚠️
- **Pro** → $199.00 **Recurring/Yearly** + $69.00 **One time** ⚠️
- **Org** → $399.00 **Recurring/Yearly** + $129.00 **One time** ⚠️

⚠️ The season prices MUST be **One time**, not recurring — a recurring season price
would auto-renew and defeat the one-off design.

The 6 `price_...` IDs become:
`STRIPE_PRICE_STARTER_ANNUAL` / `_STARTER_SEASON` / `_PRO_ANNUAL` / `_PRO_SEASON`
/ `_ORG_ANNUAL` / `_ORG_SEASON`.

## Step 3 — Get your API keys (TEST mode)

Stripe Dashboard → Developers → API keys:

- **Secret key** (`sk_test_...`) → `STRIPE_SECRET_KEY`
- Publishable key (`pk_test_...`) → only needed if you later add Stripe.js;
  the current redirect Checkout flow does not use it.

## Step 4 — Local `.env.local`

Fill these in `fieldday-planner/.env.local` with the **test** values:

```
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PRICE_STARTER_ANNUAL=price_...   # $99/yr test
STRIPE_PRICE_STARTER_SEASON=price_...   # $39 one-time test
STRIPE_PRICE_PRO_ANNUAL=price_...       # $199/yr test
STRIPE_PRICE_PRO_SEASON=price_...       # $69 one-time test
STRIPE_PRICE_ORG_ANNUAL=price_...       # $399/yr test
STRIPE_PRICE_ORG_SEASON=price_...       # $129 one-time test
STRIPE_WEBHOOK_SECRET=                  # filled in by the CLI in Step 5
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

Go to `http://localhost:3000/pricing`, with test card **4242 4242 4242 4242**, any
future expiry, any CVC/ZIP. Test **both** purchase paths (use plus-addressed emails
like `you+test1@…` for fresh accounts — never check out as an `unlimited` tester):

- **Annual** (e.g. Pro): `stripe listen` shows `checkout.session.completed` +
  `customer.subscription.created` → 200. The `user_subscriptions` row → `plan_tier=pro`,
  `billing_period=annual`, `stripe_subscription_id` set, `subscription_end` ~1yr out,
  limits `3/10/100`.
- **Season pass** (e.g. Starter $39): row → `billing_period=season_3mo`,
  `stripe_subscription_id=NULL`, `subscription_end = now+90d`, limits `1/3/24`.
- After either, Checkout returns to `/checkout/success`, which polls the row then
  forwards into the app (no `/pricing` bounce).
- `/account` → "Manage billing" opens the Customer Portal (annual only; season pass
  has no `stripe_customer_id`, so no portal — correct).
- Verify rows via the DB (`user_subscriptions`), not the Stripe MCP (it's live-mode only).

Then test cancellation of the annual sub in the portal and confirm
`customer.subscription.deleted` resets the row to `trial` and redirects to `/pricing`.

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
STRIPE_WEBHOOK_SECRET=whsec_...        # the LIVE endpoint's secret from Step 6
STRIPE_PRICE_STARTER_ANNUAL=price_...  # live $99/yr
STRIPE_PRICE_STARTER_SEASON=price_...  # live $39 one-time
STRIPE_PRICE_PRO_ANNUAL=price_...      # live $199/yr
STRIPE_PRICE_PRO_SEASON=price_...      # live $69 one-time
STRIPE_PRICE_ORG_ANNUAL=price_...      # live $399/yr
STRIPE_PRICE_ORG_SEASON=price_...      # live $129 one-time
NEXT_PUBLIC_SITE_URL=https://fielddayplanner.app
```

3. Redeploy production (merge `dev` → `main` per repo convention; do not push
   directly to `main`).
4. Do one real-card live purchase yourself, confirm the row updates, then refund
   it from the Stripe Dashboard.

---

## Pre-launch checklist

- [ ] Migrations 009 + 012 applied — `pg_policies` shows no permissive ALL policy;
      `sports_limit`/`trial_started_at`/`billing_period` columns exist.
- [ ] Test-mode purchase verified for **both** annual (recurring) and season (one-time).
- [ ] Production webhook registered; test-event delivery shows 200.
- [ ] All 8 Stripe env vars (secret + webhook + 6 prices) set in Vercel **Production**
      with **live** values; old `STRIPE_PRICE_SMALL/MEDIUM/LARGE` removed.
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

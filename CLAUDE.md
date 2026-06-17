# FieldDay Planner — CLAUDE.md

**Division:** Alfred Digital Sports
**Supabase:** Alfred Digital Sports (`actgfxrinoxlyrprzkoh`) — MCP: `supabase-sports`
**Live URL:** fielddayplanner.app (aliases: getfieldday.app all redirect to canonical)
**Vercel project:** fieldday-planner

## Stack
Next.js 15 · React 19 · TypeScript · Tailwind · Supabase (Postgres + auth) · Stripe · Resend

## Commands
```bash
cd fieldday-planner
npm run dev    # localhost:3000
npm run build
npm run start
```

## Env Vars (copy .env.local.example → .env.local)
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_SITE_URL=http://localhost:3000
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
# 6 price IDs: each tier has an annual (recurring) + a season (one-time 3-month) price
STRIPE_PRICE_STARTER_ANNUAL=
STRIPE_PRICE_STARTER_SEASON=
STRIPE_PRICE_PRO_ANNUAL=
STRIPE_PRICE_PRO_SEASON=
STRIPE_PRICE_ORG_ANNUAL=
STRIPE_PRICE_ORG_SEASON=
RESEND_API_KEY=
RESEND_FROM_EMAIL=     # must be @alfred-digital.com (only verified Resend domain)
```

## Branching & Deployment
- Active work happens on `dev` branch
- Merge `dev` → `main` to trigger Vercel production deploy
- Do NOT push directly to `main` for feature work

## Auth
Magic link via Supabase. **Must use `flowType: 'implicit'`** (not PKCE) — implicit flow is required so email links work when opened in a different browser than where the OTP was requested. This is intentional and must not be changed to PKCE.

## Email (two separate Resend paths)
- **Magic links:** sent by Supabase Auth via custom SMTP → Resend, from an `@alfred-digital.com` sender. Configured in the Supabase dashboard, NOT via app env vars.
- **Coach notifications (`notify-coaches`):** app uses the Resend SDK with `RESEND_API_KEY` + `RESEND_FROM_EMAIL` from env. From-domain must be Resend-verified (`alfred-digital.com` only — free tier = 1 domain).

## Billing & Subscriptions (Stripe)
Status: **Sports-based pricing BUILT and verified end-to-end in test mode (June 17, 2026). NOT yet live.**
- **Model (`src/lib/plans.ts`):** tiers `trial / starter / pro / org`, gated on **sports** (headline) with **divisions + teams** as silent guards. Trial = full Pro limits for 14 days. Each paid tier has two prices — **annual (recurring)** and a **3-month season pass (one-time payment, no auto-renew)**:
  - Starter $99/yr · $39 season · 1 sport / 3 div / 24 teams
  - Pro $199/yr · $69 season · 3 sports / 10 div / 100 teams
  - Org $399/yr · $129 season · unlimited
- **Enforcement is DB-column-driven:** `save`/`create` routes read `sports_limit / divisions_limit / teams_limit` off `user_subscriptions` (NOT `plan_tier`) and call `checkLimits(limits, sportCount, divisions)`. Sport count = `getSports(season).length` (tolerant of legacy single-sport blobs). `leagues_limit` is deprecated/unused; `admins_limit` reserved, not yet enforced.
- **Flow:** `/pricing` → `POST /api/payments/create-session` → branches `mode: 'subscription'` (annual) vs `mode: 'payment'` (season pass) → Stripe → signature-verified `/api/payments/webhook` upserts `user_subscriptions`. Season pass writes `stripe_subscription_id=NULL`, `billing_period='season_3mo'`, `subscription_end = now+90d`. Checkout `success_url` → `/checkout/success` (subscription-exempt page that polls the row then forwards to `/`, avoiding the post-pay → `/pricing` race).
- **Expiry:** middleware enforces `subscription_end` (null = no expiry for testers; past = lapsed). This is what makes the one-time season pass actually lapse at 90 days.
- **Migration 012** (`sports_limit`, `trial_started_at`, `billing_period`) applied to prod June 17, 2026; backfilled `sports_limit=999` for all `leagues_limit>=999` rows (protects testers).
- **Stripe prices are immutable** — create new, repoint env var, archive old. Test price IDs are per-account; live needs separate live-mode prices.
- **To go live:** recreate the 6 prices in **live mode**, set the 6 `STRIPE_PRICE_*` env vars in Vercel Production, register the prod webhook (`checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted` — same events serve one-time + recurring). Runbook: `docs/STRIPE_GO_LIVE.md`.
- **Stripe MCP connector is LIVE-mode and read-only for prices** — cannot see test-mode objects. Verify test activity via the DB (`user_subscriptions`), not the connector.
- **Trial expiry IS enforced** (since migration 013): each trial row carries `subscription_end = now()+14d`, so the existing middleware `subscription_end` check lapses the trial automatically — no `trial_started_at`-reading code needed (`trial_started_at` is still recorded for analytics).

## Known Issues / Do-Not-Touch
- ✅ **Trial trigger RESTORED (migration 013, June 17 2026).** The `handle_new_user` / `on_auth_user_created` trigger was missing in the Sports DB (so new signups got no `user_subscriptions` row and were gated straight to `/pricing`). 013 recreates it with sports-model trial values (3/10/100, `subscription_end=now()+14d`) and backfilled the 6 rowless users. Verified: trigger enabled on `auth.users`; testers + legacy `small` row untouched.
- 🛑 **Tester accounts — do not modify.** 4 accounts have `plan_tier='unlimited'` (an invalid value vs code's `trial/starter/pro/org`), `active`, no Stripe link, `subscription_end=NULL` (never expires). Migration 012 set their `sports_limit=999`. These are real-world testers depending on the app: **never change their access, and never complete a Stripe checkout while signed in as one** (the webhook would overwrite the protected row).
- ℹ️ **`user_subscriptions → auth.users` FK is NOT `ON DELETE CASCADE` in prod** (migration 002 source says it is — prod drift). To delete a user, delete their `user_subscriptions` row first.

## Key Architecture
- Lazy Supabase singleton: `src/lib/supabase.ts`
- Auth + subscription middleware: `src/middleware.ts`
- Payment handling: `src/lib/stripe.ts`, `src/app/api/payments/`
- Email notifications: `src/app/api/notify-coaches/` via Resend
- Geocoding: `src/app/api/geocode/`
- League routes: `src/app/api/league/`, `src/app/api/leagues/`
- DB migrations: `src/db/migrations/` — run in Supabase SQL editor in order; never use Supabase CLI

## Routes
- `/` — landing / home
- `/login` — magic link auth
- `/account` — user account management
- `/pricing` — subscription tiers (annual + season pass)
- `/checkout/success` — post-payment landing; polls for the row then forwards to `/` (subscription-exempt in middleware)
- `/auth/callback` — Supabase auth redirect handler

## Common Gotchas
- `flowType: 'implicit'` is required — do not change to PKCE
- **Authorization uses `getUser()`, not `getSession()`** in middleware + payment routes — `getSession()` only reads the cookie without revalidating the JWT. Do not revert.
- **Payment routes (`/api/payments/*`) are exempt from the subscription gate** in `middleware.ts` (`PUBLIC_PREFIXES`). An unsubscribed user must be able to reach `create-session`/`portal`; webhook has no cookie. Don't re-gate them, or checkout breaks with a redirect-to-`/pricing` (which surfaces as a misleading "Network error" in the UI).
- **Service worker registers in PRODUCTION only** (`src/components/ServiceWorker.tsx`); in dev it self-unregisters and clears caches. If a dev page loads unstyled/non-interactive, a stale SW is the cause — hard-reload after clearing.
- **CSP `upgrade-insecure-requests` + HSTS are production-only** (`next.config.ts`). They were forcing `https://localhost` and breaking dev with `ERR_SSL_PROTOCOL_ERROR`. Keep them gated to `NODE_ENV==='production'`.
- Sentry CSP host must use a leftmost-label wildcard (`*.ingest.de.sentry.io`), never `o*.ingest…` (invalid, silently dropped).
- Stripe price IDs are per-environment (test vs. live) — confirm before committing
- Resend `from` address must be verified in Resend dashboard (only `alfred-digital.com` is verified)
- League collaborator saves: see recent commit about shared league permissions

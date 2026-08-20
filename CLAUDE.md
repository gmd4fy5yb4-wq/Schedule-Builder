# FieldDay Planner — CLAUDE.md

**Division:** Alfred Digital Sports
**Supabase:** Alfred Digital Sports (`actgfxrinoxlyrprzkoh`) — MCP: `supabase-sports`
**Live URL:** fielddayplanner.app (aliases: getfieldday.app all redirect to canonical)
**Vercel project:** fieldday-planner

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

**"Confirm email" is OFF in Supabase (Authentication → Providers → Email) — deliberately. Do not turn it back on.** With it on, a brand-new address gets Supabase's *Confirm signup* template instead of *Magic Link*. That template carries a link but **no 8-digit code**, so the user lands on the "Check your email" screen — which promises a code and autofocuses the code field — with an email that doesn't contain one. Clicking the link confirmed the address without creating a session, dropping them back at `/login` to enter their email a second time. Only then, as an existing user, did they get the real magic-link email with the code. Two emails, and it read as broken on the first attempt.

With confirmation off, a new signup gets one magic-link email containing both link and code, and is signed in ~13 seconds after submitting (verified `greg+test8`, 2026-07-29: `confirmation_sent_at` NULL, `email_confirmed_at` == `created_at`, no second email). No security is lost — this app is passwordless, so the user must still open the mailbox to get in; confirmation was a second proof of the same thing.

This regressed once already (auth config changed mid-day 2026-07-28; `test1`/`test4` signed up in one step before it, `test5`–`test7` needed two after). To check whether it has regressed again: `select email, confirmation_sent_at, recovery_sent_at, last_sign_in_at from auth.users order by created_at desc limit 3` — a non-null `confirmation_sent_at` on a recent signup means it is back on.

## Email (two separate Resend paths)
- **Magic links:** sent by Supabase Auth via custom SMTP → Resend, from an `@alfred-digital.com` sender. Configured in the Supabase dashboard, NOT via app env vars.
- **Coach notifications (`notify-coaches`):** app uses the Resend SDK with `RESEND_API_KEY` + `RESEND_FROM_EMAIL` from env. From-domain must be Resend-verified (`alfred-digital.com` only — free tier = 1 domain).

## Billing & Subscriptions (Stripe)
Status: **LIVE. First real sale 2026-08-19** — a $39 Starter season pass, which provisioned correctly (`starter` / `season_3mo` / 1-3-24 limits / `subscription_end` = +90d). The six live-mode prices and the six `STRIPE_PRICE_*` vars are set on Vercel **Production** (verified 2026-08-19).
- **Model (`src/lib/plans.ts`):** tiers `trial / starter / pro / org`, gated on **sports** (headline) with **divisions + teams** as silent guards. Trial = full Pro limits for 14 days. Each paid tier has two prices — **annual (recurring)** and a **3-month season pass (one-time payment, no auto-renew)**:
  - Starter $99/yr · $39 season · 1 sport / 3 div / 24 teams
  - Pro $199/yr · $69 season · 3 sports / 10 div / 100 teams
  - Org $399/yr · $129 season · unlimited
- **Enforcement is DB-column-driven:** `save`/`create` routes read `sports_limit / divisions_limit / teams_limit` off `user_subscriptions` (NOT `plan_tier`) and call `checkLimits(limits, sportCount, divisions)`. Sport count = `getSports(season).length` (tolerant of legacy single-sport blobs). `leagues_limit` is deprecated/unused; `admins_limit` reserved, not yet enforced.
- **Flow:** `/pricing` → `POST /api/payments/create-session` → branches `mode: 'subscription'` (annual) vs `mode: 'payment'` (season pass) → Stripe → signature-verified `/api/payments/webhook` upserts `user_subscriptions`. Season pass writes `stripe_subscription_id=NULL`, `billing_period='season_3mo'`, `subscription_end = now+90d`. Checkout `success_url` → `/checkout/success` (subscription-exempt page that polls the row then forwards to `/`, avoiding the post-pay → `/pricing` race).
- **Expiry:** middleware enforces `subscription_end` (null = no expiry for testers; past = lapsed). This is what makes the one-time season pass actually lapse at 90 days.
- **Migration 012** (`sports_limit`, `trial_started_at`, `billing_period`) applied to prod June 17, 2026; backfilled `sports_limit=999` for all `leagues_limit>=999` rows (protects testers).
- **Stripe prices are immutable** — create new, repoint env var, archive old. Test price IDs are per-account; live needs separate live-mode prices.
- **Go-live is DONE** (live prices created, the 6 `STRIPE_PRICE_*` vars set on Production, prod webhook registered for `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted` — the same events serve one-time + recurring). Historical runbook: `docs/STRIPE_GO_LIVE.md`.
- **An unrecognised price ID or metadata tier is now REFUSED, not defaulted.** Both checkout paths used to fall back to `starter` with 1/3/24 limits, so an Org customer paying $399 against a missing or wrong-mode `STRIPE_PRICE_ORG_ANNUAL` was charged in full and provisioned as Starter, silently. `src/lib/subscriptionRow.ts` now returns a typed refusal, the route logs user + price + subscription id, and **no row is written** — the customer keeps whatever access they had. If you ever see `[webhook] paid checkout with unrecognised price` in the logs, an env var is wrong. Covered by `src/lib/subscriptionRow.test.ts`.
- **Season passes generate a real Stripe invoice** (`invoice_creation` on the Checkout Session, payment mode only — Stripe rejects it on a subscription, and subscriptions invoice every cycle on their own). Without it a one-time pass produced only a receipt email, which depends on a dashboard toggle nobody can see from the repo; the first sale had to be receipted by hand. Both this and the customer fields are computed in `src/lib/checkout.ts` and tested in `checkout.test.ts`, because setting either on the wrong mode kills the checkout button outright.
- **`stripe_customer_id` NULL on a season pass — FIXED 2026-08-19 for new checkouts.** Stripe does not attach a Customer to a one-time payment unless the session sets `customer_creation: 'always'`, so the first sale landed with NULL: `/api/payments/portal` answers 404 "No billing account found" for that user and the row cannot be traced back to Stripe. `src/lib/checkout.ts` now computes the customer fields (and reuses an existing customer rather than duplicating one); covered by `checkout.test.ts`. **The one pre-existing NULL row is NOT backfilled** — if Stripe created no Customer for that payment there is nothing to link, so check the payment in the Stripe dashboard and set `stripe_customer_id` by hand if a customer exists.
- **Stripe MCP connector is LIVE-mode and read-only for prices** — cannot see test-mode objects. Verify test activity via the DB (`user_subscriptions`), not the connector.
- **Trial expiry IS enforced**, and `fd_014` moved the clock off signup. **Say "the first save of a schedule with anything on it", never "when you generate a schedule"** — `/api/leagues/save` stamps the 14 days when `state.schedule.generatedAt` is non-null, and `EventModal.tsx:327` sets `generatedAt` unconditionally for a game, a **practice**, or a special event. So a coach who never opens Auto-Schedule and hand-adds one practice starts their paid clock. The loose phrasing already shipped a false claim to the help docs once (2026-08-19).
- **Paying customers get an expiry countdown** (`trialBanner` in `src/lib/trial.ts`), but only when nothing will auto-renew them — a NULL `stripe_subscription_id` means a season pass that genuinely stops. An annual subscriber has a live Stripe subscription and must **never** be told their plan is ending; there is a test asserting that.

## Entitlements: whose plan governs a write

`saveGate()` in `src/lib/plans.ts` is the single answer to "may this save proceed".

**A league belongs to its owner, and the owner's plan is what pays for it** — so a
collaborator saving someone else's league is gated by the **OWNER's** plan, both for
expiry and for division/team limits. Your OWN league is always gated by your own
plan, so a shared league code only ever buys edit rights on a league someone else
is paying for; there is no collaborating around a limit. An owner whose plan lapses
takes their league read-only for everyone.

The route claimed this for months and did not do it: only the *sports* gate was
carved out, while limits and `isWritable` still ran against whoever was saving. The
practical failure (2026-08-19) was a tester who bought a season pass for his own
league and was instantly capped on a shared test league he neither owns nor pays
for. Fixed 2026-08-19; nine assertions in `plans.test.ts` cover it.

`saveGate` reports `blockedBy: 'self' | 'owner'` — a collaborator blocked by the
owner's expiry must not be told "your plan has expired", which would send them to
`/pricing` to buy something that cannot fix it.

## League ownership vs. access (they are NOT the same thing)

**The 6-character league code IS the access credential.** Any authenticated user
who knows it can edit the league — `save/route.ts` checks the code and the
governing plan, nothing else. There is **no membership or collaborator table**;
"collaborator" is not a stored relationship, and `leagues.updated_by` is a
free-text display name, not a user reference. The app therefore *cannot* tell you
which leagues you collaborate on — only which you own.

`leagues.owner_id` decides **who pays**, not who may edit. Claiming a league sets
that column and nothing else. Never write UI copy implying a claim restricts
access — that exact sentence shipped on the account page and was corrected
2026-08-19.

- `/api/leagues/claim` only succeeds on a league that is **unclaimed or already
  yours** (`.or(owner_id.is.null,owner_id.eq.<uid>)` in one conditional UPDATE);
  anything else is a 409. A collaborator cannot take an owned league.
- **An unclaimed league is silently auto-claimed by whoever saves it first**
  (`save/route.ts`: `...(!league?.owner_id ? { owner_id: session.user.id } : {})`).
  No confirmation, no notice. As of 2026-08-19 **zero leagues have a NULL owner**
  — the three legacy pre-migration-001 rows (`MZB7NY`, `U9TU6U`, `TFRD8G`, all
  empty default scaffolding) were deleted. Keep it that way; a NULL owner is a
  first-toucher ownership window.
- RLS on `leagues` is `SELECT: true` (public read — the app relies on it) and
  `UPDATE: owner_id IS NULL OR owner_id = auth.uid()`. Writes still go through the
  service-role save route, which is where `saveGate` runs.
- Real roles (recorded membership, owner-revocable access) do **not** exist and
  need their own design pass — it is a membership table plus a decision about
  whether to keep the frictionless link-sharing model at all.

## Plan display rules (three bugs came from getting these wrong)

- **Never route `plan_tier` through `getPlan()` to display a name.** `getPlan`
  falls back to `PLANS[0]` (trial) for anything it doesn't sell, and the DB carries
  tiers it doesn't sell: `unlimited` on the 3 tester rows and legacy `small` on
  `greg.amundson@gmail.com`. All four display sites did this, so a 999-limit
  account and a lapsed paid row both read **"Free Trial"**. Use
  `planDisplayName(tier)` in `src/lib/plans.ts`. A guard of the shape
  `getPlan(tier).name ?? tier` does **not** work — the fallback plan's name is a
  truthy string, so `??` never fires.
- **Limits come from the row's columns**, never from the plan table — the same
  `sports_limit / divisions_limit / teams_limit` the save route enforces. The
  account page printed the fallback plan's limits and told an unlimited account it
  had 3 sports / 10 divisions / 100 teams.
- **Only sell to an account nothing currently covers.** `planCta()` in
  `planUsage.ts` returns `buy` (trial, or any lapsed plan) / `manage` (covered,
  with a `stripe_customer_id` for the portal) / `none` (covered, nothing to
  manage — a tester, or a season pass whose one-time payment left no customer
  record). The panel used to render "Your setup fits Starter — $99/yr" and a
  purchase button for **every** owner, so the first paying customer was shown a
  buy button for the pass he had bought three days earlier — and it links to
  `/pricing`, where buying it twice works.
- **`PlanPanel` is owner-aware.** On a league you don't own it shows neither meters
  nor CTA, because writes there are gated by the OWNER's plan: your own limits are
  not the rule and buying a plan would change nothing. Ownership is derived from
  `leagueCode` in `page.tsx`, **not** threaded through `loadLeague` — a league
  arrives three ways (URL code, saved code, join gate) and only the code is common
  to all three.

**The pattern behind all of these:** the plan panel and account page were written
for one user — a trial admin setting up a first league — and every assumption
baked in holds only for that person. Collaboration broke one; a completed purchase
broke another. When touching either screen, walk all five viewers: trial, paying,
lapsed, collaborator, tester.

## Onboarding tour + help docs

- 7-step guided tour, keyed on **tab index** (this app is one page with 11 tabs, not
  11 routes). `src/lib/tour.ts` is pure and tab-keyed; there is deliberately **no**
  React context — Prospect Card needs one to survive `router.push()`, FieldDay has
  no navigation to lose. Do not port it.
- `TourOverlay` falls back to a centred, dimmed tooltip when a target is missing OR
  taller than the viewport OR still off-screen after `scrollIntoView`. All three
  paths exist because each one produced a blank, dead-looking tour in testing — the
  last only reproduces on a league with a **generated season**, so verify onboarding
  changes on a populated league, never an empty one.
- Welcome modal fires only for league **creators** (`LeagueGate`'s `onJoin` carries a
  `created` flag). A coach joining by code gets the `?` button but no modal.
- State is one row in `fd_user_tour` (migration `fd_015`), NOT a column on
  `user_subscriptions` — the Stripe webhook full-row-upserts that table, so any
  column outside its fixed list is wiped at every checkout and renewal.
- `/help` is in `PUBLIC_PREFIXES`. It must stay there: the docs exist to be linked
  from sales emails to prospects who have no account.

## Lint

`npm run lint` (`eslint .`) and `next build` both run ESLint. The config had been in
the repo since scaffolding importing three packages that were never installed, so
every build shipped unlinted until 2026-08-19. 0 errors is the gate; ~16 warnings
are known and tracked.

Ten `eslint-disable` comments exist. Two of them suppress
`@next/next/no-html-link-for-pages` on `<a href="/">` links that are **deliberate
hard reloads, not missed `<Link>`s** — `checkout/success` (the Stripe webhook may
still be committing the subscription row, so a full boot guarantees a fresh read)
and the invalid-view-token screen in `page.tsx` (the reload is what clears
`?view=readonly&token=`). Both carry their reason inline. Do not "fix" them.

## Known Issues / Do-Not-Touch
- ✅ **Trial trigger RESTORED (migration 013, June 17 2026).** The `handle_new_user` / `on_auth_user_created` trigger was missing in the Sports DB (so new signups got no `user_subscriptions` row and were gated straight to `/pricing`). 013 recreates it with sports-model trial values (3/10/100, `subscription_end=now()+14d`) and backfilled the 6 rowless users. Verified: trigger enabled on `auth.users`; testers + legacy `small` row untouched.
- ℹ️ **`greg.amundson@gmail.com` is one of the owner's own accounts, not a customer.** `plan_tier='small'` (1/4/16) is a legacy tier absent from `PLANS`, with a real `stripe_customer_id`, lapsed 2026-07-11. Confirmed 2026-08-19 to be left exactly as it is — do not migrate it to `starter`, and do not treat it as a customer needing outreach. It displays as "Small" since `planDisplayName` landed, which is correct and intended.
- 🛑 **Tester accounts — do not modify.** **3** accounts have `plan_tier='unlimited'` (an invalid value vs code's `trial/starter/pro/org`), `active`, no Stripe link, `subscription_end=NULL` (never expires). Migration 012 set their `sports_limit=999`. These are real-world testers depending on the app: **never change their access, and never complete a Stripe checkout while signed in as one** (the webhook would overwrite the protected row).
  **This has already happened once:** `jonathan@lev-itsb.com` was a 4th `unlimited` tester until he bought a season pass on 2026-08-19, which overwrote his row to `starter`. He is a paying customer now, deliberately left that way — the row is an honest customer record. He keeps write access to the shared test league `YWWM8G` because collaborator writes are gated on the league OWNER's plan (see below), not his own.
- ℹ️ **`user_subscriptions → auth.users` FK is NOT `ON DELETE CASCADE` in prod** (migration 002 source says it is — prod drift). To delete a user, delete their `user_subscriptions` row first.

## Common Gotchas
- `flowType: 'implicit'` is required — do not change to PKCE
- **Authorization uses `getUser()`, not `getSession()`** in middleware + payment routes — `getSession()` only reads the cookie without revalidating the JWT. Do not revert.
- **Payment routes (`/api/payments/*`) are exempt from the subscription gate** in `middleware.ts` (`PUBLIC_PREFIXES`). An unsubscribed user must be able to reach `create-session`/`portal`; webhook has no cookie. Don't re-gate them, or checkout breaks with a redirect-to-`/pricing` (which surfaces as a misleading "Network error" in the UI).
- **Service worker registers in PRODUCTION only** (`src/components/ServiceWorker.tsx`); in dev it self-unregisters and clears caches. If a dev page loads unstyled/non-interactive, a stale SW is the cause — hard-reload after clearing.
- **CSP `upgrade-insecure-requests` + HSTS are production-only** (`next.config.ts`). They were forcing `https://localhost` and breaking dev with `ERR_SSL_PROTOCOL_ERROR`. Keep them gated to `NODE_ENV==='production'`.
- Sentry CSP host must use a leftmost-label wildcard (`*.ingest.de.sentry.io`), never `o*.ingest…` (invalid, silently dropped).
- Stripe price IDs are per-environment (test vs. live) — confirm before committing
- Resend `from` address must be verified in Resend dashboard (only `alfred-digital.com` is verified)
- League collaborator saves: see **Entitlements** and **League ownership vs. access** above — the code is the access credential, the owner's plan is the rule

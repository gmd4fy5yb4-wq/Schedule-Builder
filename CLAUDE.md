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
STRIPE_PRICE_SMALL=
STRIPE_PRICE_MEDIUM=
STRIPE_PRICE_LARGE=
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
- `/pricing` — subscription tiers
- `/auth/callback` — Supabase auth redirect handler

## Common Gotchas
- `flowType: 'implicit'` is required — do not change to PKCE
- Stripe price IDs are per-environment (test vs. live) — confirm before committing
- Resend `from` address must be verified in Resend dashboard
- League collaborator saves: see recent commit about shared league permissions

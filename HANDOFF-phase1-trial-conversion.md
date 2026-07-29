# HANDOFF — FieldDay Planner, Phase 1 (Trial Conversion Sprint)

**Written:** 2026-07-29, end of the Phase 0 session.
**For:** a fresh session starting Phase 1. Everything needed to begin is here; you should not need to re-read the Phase 0 work.

---

## Where things stand

**Phase 0 is shipped and live in production.** `main` is at `8584bfc`, deployed to fielddayplanner.app. Migration `fd_014` is applied to the Sports DB.

The source is the July 2026 design review: `~/Downloads/design_handoff_fieldday_review/` — `ROADMAP.md` sequences all five phases, `README.md` holds the findings, and each phase item names a working HTML prototype in that folder.

### What Phase 0 changed (five items, all live)

| Finding | Change |
|---|---|
| 2 | **Trial clock starts at first schedule generation**, not signup. `fd_014` makes the signup trigger write `NULL` for `trial_started_at` and `subscription_end`; `/api/leagues/save` stamps both the first time it saves a league whose schedule has been generated. |
| 3 | **Expiry is read-only, not a `/pricing` lockout.** Middleware no longer redirects lapsed users — reads pass, writes don't. The gate is `isWritable()` in `src/lib/plans.ts`, shared by middleware + the save and create routes. `page.tsx` renders read-only with an amber renew banner. |
| D | **Tier-aware `UpgradePrompt` copy** — separates the plan you're ON from the plan you'd need. |
| 5, 13, 17 | Nav group labels rendered; 11 emoji → `src/components/Icon.tsx` (9 hand-written SVGs); 4 theme accents fixed to AA, locked by `src/lib/themes.test.ts`. |
| 14, 15 | 135 bare `rounded` → `rounded-lg`; `rounded-2xl` only on the 5 real modals; `font-[Oswald]` deleted. |

Also shipped in the same deploy: `b77f111` (Red Pen / WCAG design-system fixes) and `32e86eb`, which had been waiting on `dev`.

---

## Phase 1 — what to build

From `ROADMAP.md`. Four M-sized items, ~1–2 weeks. **All four read existing data — no new columns, no migrations.**

| Item | Findings | Prototype |
|---|---|---|
| **Trial bar + first-run checklist** ← start here | 1, 4 | `Trial Onboarding Prototype.dc.html` |
| Trial-first pricing page | 7, 18, 19 | `Trial-First Pricing Prototype.dc.html` |
| Multi-sport gate + live tier badge | 6, 20 | `Multi-Sport Gate Prototype.dc.html` |
| Plan telemetry panel + account/login polish | 12 | `Plan Telemetry`, `Account Billing`, `Login Polish` |

The bar reads the `user_subscriptions` row `page.tsx` already fetches (see the auth effect, ~line 230 — it now selects `subscription_status` and `subscription_end` too). Checklist state derives from `state.divisions` / `state.fields` / `state.schedule.generatedAt`. Deep links go through the existing `onNavigate()` = `setTab`.

### ⚠️ The prototype is missing a state — decide this before writing code

`Trial Onboarding Prototype.dc.html` was designed **before** Phase 0 deferred the trial clock. It assumes a trial always has a countdown.

As of `fd_014`, a new signup has `subscription_end = NULL` and **no clock running at all** until they generate their first schedule. So the bar needs a third state the prototype doesn't cover:

1. **Not started** — `plan_tier='trial'` and `subscription_end IS NULL`. Something like *"Your 14-day trial starts when you generate your first schedule."* This is the state every brand-new user is in.
2. **Running** — `subscription_end` in the future. "6 days left."
3. **Lapsed** — `subscription_end` in the past. Already handled by the Phase 0 amber renew banner; don't duplicate it.

Phase 0 made the trial fairer and, in doing so, made it completely invisible — a new user today is told nothing. That's finding 1, and it's why this item is first.

---

## Facts about production you'll want

Verified against the live Sports DB on 2026-07-29.

**8 leagues, 21 subscription rows:**
- 4 leagues owned by the `plan_tier='unlimited'` testers (`active`, `subscription_end = NULL`, never expire) — active 2026-07-28. **Never modify these rows.**
- 1 league owned by a trial extended to **2027-08-11** (user `51a5ad3f-1444-40c7-ba39-4b94487dbc22`, league `QLFEZC`) — extended deliberately this session so a live tester wouldn't lapse.
- 3 unclaimed leagues (no owner), untouched since 2026-04-04.
- 9 lapsed accounts (8 trials, 1 legacy `small`) own **zero** leagues — signups that never built anything.

**`subscription_end = NULL` now means two different things:** "tester, never expires" AND "trial whose clock hasn't started." It is no longer a reliable tester marker. Check `plan_tier` too.

`isWritable(sub)` in `src/lib/plans.ts` is the single definition of "may this user change things" — middleware, `/api/leagues/save` and `/api/leagues/create` all call it. If Phase 1 adds any write path, it goes through that function.

---

## Signup / auth — fixed 2026-07-29, don't undo it

**"Confirm email" is OFF in Supabase (Authentication → Providers → Email). Leave it off.**

With it on, a brand-new address got Supabase's *Confirm signup* template rather than *Magic Link*. That template has a link but **no 8-digit code** — while the app's "Check your email" screen promises a code and autofocuses the code field. Clicking the link confirmed the address without creating a session, so the user landed back at `/login`, entered their email again, and only then (now an existing user) got the real magic-link email with the code. Two emails; it read as broken on the first try.

Off, a new signup gets one email with link + code and is in ~13 seconds. Verified on `greg+test8`: `confirmation_sent_at` NULL, `email_confirmed_at` == `created_at`, no second email. **No app code was changed** — `signInWithOtp`, `/auth/callback` and the copy were all correct; they described an email new users weren't receiving.

This has regressed once (config changed mid-day 2026-07-28). To check: a non-null `confirmation_sent_at` on a recent `auth.users` row means confirmation is back on.

## Open items carried forward

- ~~Nav group labels unverified~~ **Verified 2026-07-29 by screenshot** — OVERVIEW / OPERATE / SETUP render with the divider, emoji→SVG is clean, radius and type sweeps look right.
- ~~Signup path unverified~~ ~~Clock start unverified~~ **`fd_014` is verified end to end in production** (`greg+test8`, 2026-07-29): signed up 14:35:16 with `trial_started_at`/`subscription_end` NULL, generated a schedule, clock stamped 14:41:00 → 2026-08-12 14:41:00. Exactly 14 days, **5m43s after signup rather than at signup** — which is the entire point of the change. The 4 `unlimited` tester rows were untouched, as the `plan_tier='trial' AND trial_started_at IS NULL` guard requires.
- **The expired banner and tier-aware upgrade copy are still unverified** — and this needs deliberate setup, because **none of the 9 lapsed accounts owns a league**. To see those states: take one of the unstarted trials below, generate a schedule, then backdate its `subscription_end`. The trial bar lands in the same header region, so verify all of it in one pass.

### Two live accounts are sitting in the new "unstarted trial" state

`greg+test6@` and `greg+test7@` signed up and never generated a schedule, so they have `subscription_end = NULL` and **the UI tells them nothing at all**. They are working examples of finding 1 — log in as one while building the trial bar's "not started yet" state.

Current production distribution (2026-07-29):

| Rows | State |
|---|---|
| 4 | `unlimited` testers — NULL, never expire, **never modify** |
| 2 | trial, NULL — signed up, no schedule generated yet |
| 9 | trial with a running clock |
| 8 + 1 | lapsed — read-only, not locked out |
- **Locked-edit toast was deliberately skipped.** The persistent amber banner plus disabled inputs seemed sufficient; add it if a lapsed user finds the read-only state confusing.

## Two UI observations from the post-Phase-0 screenshots

Neither is a Phase 0 defect; both are worth a decision during Phase 1 since they sit in the header region the trial bar lands in.

- **The active nav tab renders as a full rounded box, not the underline the code specifies.** `border-b-2` is a bottom border only, so that box is the browser focus ring — it competes with, and visually beats, the real active indicator.
- **Auto-Schedule sits under the SETUP group.** Generating a schedule is an operating action. The grouping predates Phase 0, but now that the labels are rendered the mismatch is legible in a way it wasn't before.

## Testing

No test framework. Standalone assert files run with `npx tsx`:

```bash
npx tsx src/lib/plans.test.ts     # includes 11 isWritable cases — the money gate
npx tsx src/lib/themes.test.ts    # WCAG AA contrast, fails if a theme regresses
npx tsx src/lib/bundle.test.ts
npx tsc --noEmit
npm run build
```

Production smoke probe (unauthenticated, no side effects) — proves the Phase 0 middleware is live:

```bash
curl -s -X POST -H 'Content-Type: application/json' -d '{}' \
  -w "\n%{http_code}\n" https://fielddayplanner.app/api/leagues/save
# 401 JSON = new build. 307 redirect = old build.
```

## Working conventions learned the hard way this session

- **The `fieldday-planner` checkout is shared with another live session** doing linked-calendar work (`src/lib/linkedCalendars.ts`, `LinkedCalendarsTab.tsx`, modified `types.ts`, `HANDOFF-shared-calendar.md`). **Leave those files alone**, and never switch branches in that tree — git will refuse anyway. Do isolated work in a worktree under `.worktrees/`.
- **Worktrees need `node_modules` symlinked** from the main checkout, plus `node_modules` added to `.git/info/exclude` so `git add -A` can't commit the symlink.
- **New migrations must be app-prefixed** — `fd_015_…`, not `015_…`. The Sports DB is shared by three apps that each run their own `001…` counter, so `001`–`014` already exist three times over. The prefix must also be the `name` passed to MCP `apply_migration`, since `supabase_migrations` is the one shared list. Full rule in `memory/migrations.md`.
- **Commit author must be the Apple relay** (`gmd4fy5yb4@privaterelay.appleid.com`) or Vercel silently blocks the deploy.
- **Merge order matters for DB changes:** deploy the code first, apply the migration second. `fd_014` applied before its code would have given every new signup unlimited free access.

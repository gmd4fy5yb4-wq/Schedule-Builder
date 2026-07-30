# HANDOFF — FieldDay Planner, Phase 2 (Coach Mobile Sprint)

**Written:** 2026-07-29, end of the Phase 1 session.
**For:** a fresh session starting Phase 2. Everything needed to begin is here; you should not need to re-read the Phase 0 or Phase 1 work.

---

## Where things stand

**Phase 0 and Phase 1 are both shipped and live in production.** `main` is at `8a79462`, deployed to fielddayplanner.app (Vercel status: success). `dev` is at `05b6c10` and is merged into `main` — the two trees are identical.

The source is still the July 2026 design review: `~/Downloads/design_handoff_fieldday_review/` — `ROADMAP.md` sequences all five phases, `README.md` holds the findings and per-prototype detail, and each phase item names a working HTML prototype in that folder.

### What Phase 1 shipped (four items, all live)

| Item | Findings | What landed |
|---|---|---|
| **Trial bar + first-run checklist** | 1, 4 | `src/lib/trial.ts` (`trialBanner()`, `checklistSteps()`), `TrialBar.tsx`, `FirstRunChecklist.tsx`. Bar renders under the header **and above `LeagueGate`** — a brand-new signup has no league yet, so the gate is where they'd otherwise hear nothing. |
| **Trial-first pricing** | 7, 18, 19 | `/pricing` rewritten: trial hero, wedge kicker, sport-count fit-finder, annual/season toggle, shared "Every plan includes" strip, three objection cards. Payment payload unchanged. |
| **Multi-sport gate + tier badge** | 6, 20 | `LeagueGate` gained a **league name field**, multi-select sport chips (capped at the trial's 3), and a live "this setup fits Pro · $199/yr" line. "Claim it" jargon gone. |
| **Plan telemetry + account/login** | 12 | `src/lib/planUsage.ts` (`planUsage()`, `billingLine()`), `PlanPanel.tsx` at the top of Setup, plain-English billing line on `/account`, 60s resend countdown + inline email edit on `/login`. |

Also shipped in the same phase:

- **Nav focus fix** — the active tab's `border-b-2` underline was being beaten by the browser focus ring drawing a full rounded box. Now `outline-none` + `focus-visible:` ring, plus `aria-current="page"`.
- **Auto-Schedule moved from the Setup nav group to Operate.** Groups are display-only; every `TABS` index and `onNavigate()` call is unchanged.
- **Unnamed-league prompt** — `isUnnamedLeague()` in `trial.ts`. While a league is still called `"My League"`, the header title renders as a `Name your league →` button deep-linking to Setup, and checklist step 1 requires a name as well as dates.

---

## Phase 2 — what to build

From `ROADMAP.md`. ~2 weeks. **Half your users are coaches on phones**, and this is the strategic counter to competitors' native apps.

| Effort | Item | Findings | Prototype |
|---|---|---|---|
| **L** | **Mobile shell: bottom nav + kebab + agenda-first calendars** ← start here | 9, 10, 11 | `Mobile Shell Prototype.dc.html` |
| M | Purpose-built coach view-only page | — | `Coach View-Only Prototype.dc.html` |
| M | Standings tap-row detail + a11y pass | 16 | `Standings Detail Prototype.dc.html`, `A11y Fixes Prototype.dc.html` |

### Item 1 — mobile shell (the big one)

Below 640px, per the prototype (390px, in an iOS frame):

- **Bottom tab bar** — Today / Schedule / Standings / More, 44–50px targets, Lucide icons, active state crimson `#cd163f`.
- **One-row header** — share + `⋯` only, 40px buttons. The current header stacks 6+ controls and wraps badly on a phone.
- **Compact trial pill row** — the Phase 1 `TrialBar` is a full-width strip; it needs a phone-sized variant. It already renders in the right place, so this is styling, not rewiring.
- **Agenda-list schedule by default**, with a dots-only month toggle. Game card gets an inline weather strip (not the fixed 128px square) plus 44px Call coach / Directions buttons.
- **Admin editing via sheets** — Edit → bottom sheet (time/field chips + confirm toggle); crimson FAB → quick-add sheet (Game/Practice segment) that adds a `NEW`-tagged agenda row. More sheet routes to Coaches / Team Schedules / Field Calendar with back headers.
- **Motion**: sheets `sheet-up .3s cubic-bezier(.32,.72,.35,1)` with slight overshoot, backdrop fade .15s, views `view-in .2s` (14px slide), FAB pop `.25s cubic-bezier(.34,1.56,.64,1)`.

**The structural question to settle before writing code:** the app is one `page.tsx` with an 11-entry `TABS` array and a `tab` index. The bottom bar has four entries. Decide whether Today/Schedule/Standings/More map onto existing `TABS` indices (0/5/9 + a sheet) or whether mobile gets its own route table. Mapping onto the existing indices keeps `onNavigate()` and the first-run checklist's deep links working for free — the checklist links to tabs 1, 2, 3 and 8, which on mobile all live behind **More**.

### Item 2 — coach view-only page

Same `?token=…&view=readonly` route, different render. LIVE badge (green dot pill) instead of "View Only"; a "My team" picker persisted in `localStorage`; navy next-game hero (Oswald 24px matchup, inline weather, Directions + add-to-calendar); YOURS-tagged filtered schedule; standings row highlight; footer *"Powered by FieldDay Planner — run your own league free."*

That footer is the acquisition loop, and it is the reason this item is worth more than its size suggests.

Note `isViewer` in `page.tsx` (`readOnly && !expired`) already separates a share-link viewer from a lapsed owner — the coach page keys off that, and the Phase 1 `TrialBar` is already suppressed for viewers.

### Item 3 — standings detail + a11y

- Mobile standings reduce to Team / W-L / PCT with a tap-row → detail view: record tiles (GAMES BACK, colour-coded STREAK), last-5 W/L dots, runs for/against split bar, recent results with W/L badges, next game + Directions, coaches with call/email.
- **A11y**: real WAI-ARIA tabs (`role=tablist`, `aria-selected`, roving `tabindex`, Arrow/Home/End) — Phase 1 added `aria-current` and a focus-visible ring to the nav buttons but they are still plain buttons, not a tablist. Confirm becomes an `aria-pressed` toggle; a `?` disclosure replaces the mouse-only tooltip; division chips gain solid initial badges (e.g. "MA") so the coding survives grayscale.

---

## Facts about production you'll want

Verified against the live Sports DB on 2026-07-29, after Phase 1.

**12 leagues, 24 subscription rows:**

| Rows | State |
|---|---|
| 4 | `plan_tier='unlimited'` testers — `subscription_end` NULL, never expire, **never modify** |
| 2 | trial, NULL — signed up, no schedule generated yet (`greg+test6@`, `greg+test7@`) |
| 9 | trial with a running clock |
| 9 | lapsed — read-only, not locked out |

- **3 leagues are unclaimed** (no owner), untouched since 2026-04-04.
- **8 leagues are still named "My League."** The Phase 1 header prompt will nudge each owner the next time they open the app. Nothing was renamed server-side — there is no way to guess what a league should be called.
- `greg+test6@` owns league **`JMZQ3R`**, created during Phase 1 verification and deliberately kept as a live mid-checklist example. It is now named "Cedar Valley Little League" and its trial clock is still unstarted.

**`subscription_end = NULL` means two different things** — "tester, never expires" AND "trial whose clock hasn't started." Check `plan_tier` too. `trialBanner()` and `planUsage()` both branch on `plan_tier` *before* the null date for exactly this reason.

**`plan_tier='unlimited'` is not a value in `PLANS`.** `getPlan()` silently falls back to the trial plan for it. Any new code that names a plan from the tier must handle it explicitly, or four real testers get told they are on a free trial.

`isWritable(sub)` in `src/lib/plans.ts` is still the single definition of "may this user change things" — middleware, `/api/leagues/save` and `/api/leagues/create` all call it. Any new write path goes through it.

---

## Signup / auth — do not undo

**"Confirm email" is OFF in Supabase (Authentication → Providers → Email). Leave it off.** With it on, a brand-new address gets Supabase's *Confirm signup* template rather than *Magic Link* — a link with no 8-digit code, while the app's "Check your email" screen promises one. Two emails, reads as broken.

This has regressed once (2026-07-28). To check: `select email, confirmation_sent_at from auth.users order by created_at desc limit 3` — a non-null `confirmation_sent_at` on a recent row means it is back on. Full reasoning is in `CLAUDE.md`.

---

## Open items carried forward

- **The expired banner and tier-aware upgrade copy are still unverified.** This needs deliberate setup: none of the 9 lapsed accounts owns a league. To see those states, take one of the unstarted trials, generate a schedule, then backdate its `subscription_end`. The trial bar, the expired banner and the mobile trial pill all share the same header region — verify them in one pass.
- **Locked-edit toast was deliberately skipped** in Phase 0. The persistent amber banner plus disabled inputs seemed sufficient. The mobile shell may change that calculus: on a phone the banner scrolls away while the disabled controls stay on screen.
- **`HANDOFF-phase1-trial-conversion.md` now describes finished work.** Delete it, or keep it as the record of why the trial clock is deferred.
- **Another live session owns the linked-calendar work** in this checkout — `src/lib/linkedCalendars.ts`, `LinkedCalendarsTab.tsx`, modified `types.ts`, `HANDOFF-shared-calendar.md`. That tab will want a place in the mobile More sheet. **Leave those files alone** and coordinate before touching `TABS`.

---

## Testing

No test framework. Standalone assert files run with `npx tsx`:

```bash
npx tsx src/lib/plans.test.ts      # 11 isWritable cases — the money gate
npx tsx src/lib/trial.test.ts      # trial bar states, checklist steps, unnamed-league rule
npx tsx src/lib/planUsage.test.ts  # usage meters + billingLine
npx tsx src/lib/themes.test.ts     # WCAG AA contrast, fails if a theme regresses
npx tsx src/lib/bundle.test.ts
npx tsc --noEmit
npm run build
```

Production smoke probe (unauthenticated, no side effects) — proves the middleware is live:

```bash
curl -s -X POST -H 'Content-Type: application/json' -d '{}' \
  -w "\n%{http_code}\n" https://fielddayplanner.app/api/leagues/save
# 401 JSON = good. 307 redirect = an old build, or /api got re-gated.
```

### Verifying authenticated UI in a browser

Phase 1's states only exist behind auth, and the `/auth/callback` page does not complete in a headless browser. What works: mint a session with the service-role key and write it as the `@supabase/ssr` cookie.

```bash
# 1. admin generate_link → hashed_token
# 2. GET /auth/v1/verify?token=…&type=magiclink → read access_token from the Location fragment
# 3. GET /auth/v1/user with that token → the user object
# 4. cookie value = "base64-" + base64(JSON of {access_token, refresh_token, expires_at,
#    expires_in, token_type, user}), set as sb-actgfxrinoxlyrprzkoh-auth-token, path=/
```

Then drive the page. Use `greg+test6@` (unstarted trial) or `greg+test8@` (running clock) — never a `plan_tier='unlimited'` tester.

**Stub `window.fetch` before clicking any pricing CTA.** The Stripe connector is live-mode; a real click creates a real checkout session. Stubbing also lets you assert the payload — `{tier, billingPeriod}` — which is the part that actually matters.

---

## Working conventions learned the hard way

- **This checkout is shared with another live session.** Never switch branches in it. Do isolated work in a worktree under `.worktrees/`, merge into `dev` from the main checkout, then `dev` → `main`.
- **Worktrees need `node_modules` symlinked** from the main checkout, plus `node_modules` in `.git/info/exclude` so `git add -A` can't commit the symlink. Copy `.env.local` in too.
- **One dev server per port, and know which branch it is serving.** A `next dev` left running from a previous branch keeps the port and silently serves stale code — the 500 it produced cost more time than it should have. `pkill -f "next dev"` before restarting.
- **`dev` → `main` is not a fast-forward.** `main` carries its own merge commits; use `git merge --no-ff dev` and confirm `git diff --stat dev main` is empty before pushing.
- **Commit author must be the Apple relay** (`gmd4fy5yb4@privaterelay.appleid.com`) or Vercel silently blocks the deploy.
- **`themes.test.ts` only locks the theme palette.** A hardcoded Tailwind colour slips past it — `bg-emerald-600` with white text is 3.77:1, under AA for small text. `emerald-700` is 5.55:1. Check any new hardcoded colour by hand.
- **The LSP reports hundreds of phantom "Cannot find module" errors inside a worktree** because of the `node_modules` symlink. They are not real. `npx tsc --noEmit` is the source of truth.
- **New migrations must be app-prefixed** — `fd_015_…`, not `015_…`. Phase 1 added none; `fd_014` is still the latest. Full rule in `memory/migrations.md`.
- **Deploy code first, apply the migration second** — the reverse order once would have given every new signup unlimited free access.

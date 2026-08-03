# HANDOFF — FieldDay Planner, Phase 3 (Admin Power Tools)

**Written:** 2026-08-02, at the end of the Phase 2 session.
**For:** a fresh session starting Phase 3. Everything needed to begin is here; you should not need to read the Phase 0, 1 or 2 handoffs.

**Supersedes** `HANDOFF-phase1-trial-conversion.md` and `HANDOFF-phase2-coach-mobile.md`. Both now describe finished work — delete them, or keep them as the record of why things were built the way they were.

---

## Where things stand

**Phase 2 is complete and live.** `main` is at `1eb9053`, deployed to fielddayplanner.app. `dev` is at `07b2a0d` (one docs commit ahead of `main`; no code difference).

Phases 0, 1 and 2 of the July 2026 design review have all shipped. The source is still `~/Downloads/design_handoff_fieldday_review/` — `ROADMAP.md` sequences the five phases, `README.md` holds the findings, and each item names a working HTML prototype in that folder.

### What Phase 2 shipped — four merges

| Merge | What landed |
|---|---|
| **Mobile shell** (item 1) | `src/lib/mobileNav.ts` + test (the tab partition), `MobileNav.tsx` (bottom bar, More sheet, kebab sheet), one-row header, agenda-first Schedule, month-grid count dots, inline weather + Call coach / Directions on game cards, `EventModal` as a bottom sheet, motion keyframes with a `prefers-reduced-motion` guard. |
| **Mobile gaps** (unplanned, from two production screenshots) | Add-event FAB on Schedule — **there had been no way to add an event from the phone's default view**; Team Schedules and Field Calendar made responsive; exports and `Clear All` moved to desktop only. |
| **Coach view-only page** (item 2) | `src/lib/coachView.ts` + test, `CoachView.tsx`. A share-link viewer now gets a purpose-built read surface instead of the admin shell: team picker (persisted per-league), next-game hero with Directions and weather, YOURS-tagged schedule, highlighted standings, and the "run your own league free" footer. |
| **Standings detail + a11y** (item 3) | `src/lib/standings.ts` + test (streak / last-5 / recent results), mobile standings list with tap-row detail, desktop nav as a real WAI-ARIA tablist with arrow keys, Confirm disclosure replacing a mouse-only tooltip, division-initials badges on month-grid chips, focus trap + restore in all three dialogs. |

58 commits on `main` since Phase 1.

---

## Phase 3 — what to build

From `ROADMAP.md`. ~2–3 weeks. The theme is **"setup never stalls"** — this is the phase that earns renewals.

| Effort | Item | Prototype |
|---|---|---|
| **L** | **Auto-schedule draft → conflict review → apply** ← start here. Severity-tiered flags with one-click fixes and auto-fix; apply gated on resolution. `autoScheduleConflicts` already exists in the state blob, so this is presentation + resolution actions, not a new engine. | `Conflict Review Prototype.dc.html` |
| M | Live-conflict event modal + umpire board. Prevention over flagging: availability dots per field/time, busy umpires unclickable, crew-load bars, save gated on conflicts with a "book anyway" escape. | `Event Modal Prototype.dc.html`, `Umpire Assignment Prototype.dc.html` |
| M | CSV import wizard + Divisions & Teams redesign. Soft-warning preview (merge duplicates, flag missing emails), snapshot-before-replace; expandable team rows with coach roles. | `CSV Import Wizard Prototype.dc.html`, `Divisions Teams Prototype.dc.html` |
| M | History panel (Undo + Snapshots merged). **Caveat from the roadmap:** human-readable change labels need a small action label recorded at each `setState` site — the undo stack stores raw blobs today. Ship the merged panel first, labels second. | `History Panel Prototype.dc.html` |

**Before writing code for the first item,** read `AutoScheduleTab.tsx` (920 lines) and the shape of `state.autoScheduleConflicts` in `src/lib/types.ts`. The roadmap's claim that the data "already exists" is worth verifying rather than trusting — the equivalent claim in the Phase 2 standings prototype ("the detail is a render, not a new query") turned out to be false, because streak and last-5 had no source anywhere.

---

## Do not break these

### The other live session's files

Another session owns work in this checkout and has **uncommitted changes**:

```
 M HANDOFF-shared-calendar.md
 M src/lib/types.ts
?? src/components/LinkedCalendarsTab.tsx
?? src/lib/linkedCalendars.ts
?? src/lib/linkedCalendars.test.ts
```

Do not edit, commit, revert or `git clean` them. `types.ts` is the trap: you will want to read it constantly and must never write to it. Their linked-calendars tab will eventually want a place in the mobile More sheet — because `moreTabs()` derives from everything not in `BOTTOM_TABS`, a new tab appears there automatically, but coordinate before touching `TABS` or `NAV_GROUPS`.

### Never switch branches in this checkout

It is shared. Work in a worktree under `.worktrees/`, merge into `dev` from the main checkout (which stays on `dev`), and merge `dev` → `main` through a **temporary** worktree — `git checkout main` here would carry the other session's dirty files across.

### Signup / auth — leave it alone

**"Confirm email" is OFF in Supabase (Authentication → Providers → Email). Keep it off.** With it on, a brand-new address gets the *Confirm signup* template rather than *Magic Link* — a link with no 8-digit code, while the app's "Check your email" screen promises one. Two emails, reads as broken.

This has regressed twice. To check:
```sql
select email, confirmation_sent_at from auth.users order by created_at desc limit 3;
```
A non-null `confirmation_sent_at` on a recent row means it is back on. Run this before every deploy; it is cheap and it has caught a real regression.

---

## Facts about production

Verified 2026-08-02.

**24 subscription rows:** 4 `plan_tier='unlimited'` testers (`subscription_end` NULL, never expire, **never modify**), 2 trials with the clock unstarted, 9 trials running, 9 lapsed.

- **`subscription_end = NULL` means two different things** — "tester, never expires" AND "trial whose clock hasn't started". Always check `plan_tier` too. `trialBanner()` and `planUsage()` both branch on `plan_tier` *before* the null date for exactly this reason.
- **`plan_tier='unlimited'` is not a value in `PLANS`.** `getPlan()` silently falls back to the trial plan. New code naming a plan from the tier must handle it, or four real testers get told they're on a free trial.
- `isWritable(sub)` in `src/lib/plans.ts` is still the single definition of "may this user change things" — middleware, `/api/leagues/save` and `/api/leagues/create` all call it. Any new write path goes through it.

**Leagues worth knowing:**
- `YWWM8G` — the real production league (2026 Intramural Softball): 132 games, **36 with results**, 24 special events, 5 divisions. It is the **only** league with recorded results, so it is the only one where standings render anything. Its share link is read-only and safe to view; **never modify its blob**.
- `JF9ZDS` — `greg+test8@`'s league (running trial clock, 3 divisions, 27 games, no results). The safe one to drive as an admin.
- 8 leagues are still named "My League". Nothing was renamed server-side.

---

## Testing

No test framework. Standalone assert files run with `npx tsx`:

```bash
npx tsx src/lib/standings.test.ts   # streak / last-5 / recent results (9)
npx tsx src/lib/coachView.test.ts   # coach event selection (16)
npx tsx src/lib/mobileNav.test.ts   # tab partition reachability (7)
npx tsx src/lib/plans.test.ts       # 11 isWritable cases — the money gate
npx tsx src/lib/trial.test.ts
npx tsx src/lib/planUsage.test.ts
npx tsx src/lib/themes.test.ts      # WCAG AA contrast, fails if a theme regresses
npx tsx src/lib/bundle.test.ts
npx tsc --noEmit
npm run build
```

(`linkedCalendars.test.ts` belongs to the other session — don't count it as yours.)

Production smoke probe, unauthenticated and side-effect free:
```bash
curl -s -X POST -H 'Content-Type: application/json' -d '{}' \
  -w "\n%{http_code}\n" https://fielddayplanner.app/api/leagues/save
# 401 JSON = good. 307 = an old build, or /api got re-gated.
```

### Verifying UI in a browser — the part that actually finds bugs

Every real defect this session found was found in a browser, not by the type checker or the tests. Type-check-clean, build-clean, tests-green code shipped a stranger's game as the hero of the acquisition page, dropped every league's theme, and spilled `+` buttons across cell borders.

**Authenticated admin views** need a session minted by hand — `/auth/callback` never completes headlessly:

1. `POST /auth/v1/admin/generate_link` with the service-role key → `hashed_token`
2. `GET /auth/v1/verify?token=…&type=magiclink` with `redirect: 'manual'` → read `access_token` from the **Location fragment**
3. `GET /auth/v1/user` with that token → the user object
4. Cookie value = `"base64-" + base64(JSON.stringify({access_token, refresh_token, expires_at, expires_in, token_type, user}))`, named `sb-actgfxrinoxlyrprzkoh-auth-token`, path `/`
5. Also set `localStorage` `sb-league-code` and `sb-user-name` — **on the app's own origin**, since localStorage is per-origin *including port*. With a valid session but no league code you land on the join gate, which looks like a broken build.

**Coach/share views need none of this** — `/?token=<view_token>&view=readonly` works unauthenticated, which makes it the fastest way to check anything that renders for a viewer, including `StandingsTab`.

**Measure with `element.checkVisibility()`, never `getComputedStyle().display`.** Tailwind puts `hidden` on a *wrapper*; a child of a `display:none` parent still reports its own display. That mistake produced a completely false "the desktop nav is leaking at 390px" reading.

**Put a frame between a synthetic keypress and reading the DOM.** React batches state updates, so a synchronous read after `dispatchEvent` shows the *old* value — it looked like the tablist's arrow keys were dead when they were fine.

`overflow: hidden` blocks *user* scrolling but still permits programmatic `scrollBy`, so a scripted scroll test cannot prove a scroll-lock is absent.

---

## Open items, ranked

Full list with reasoning in `docs/superpowers/plans/2026-07-30-phase2-mobile-shell-followups.md`. The ones that matter:

1. **Field Calendar is add-only on phones.** It shows how many events a day holds but not what they are, because unlike Schedule it has no agenda view to tap through to. A `sm:hidden` caption tells the user so rather than leaving a silent dead end. The roadmap's wording for the mobile shell was "agenda-first calendar**s**", plural — this is the one that never got it. **Top remaining mobile item.**
2. **The expired banner and tier-aware upgrade copy have still never been seen.** None of the 9 lapsed accounts owns a league. To see them: take an unstarted trial, generate a schedule, then backdate `subscription_end`. The trial bar, the expired banner and the mobile trial pill all share the header region — verify them in one pass. This has been carried forward since Phase 0.
3. **The locked-edit toast**, skipped in Phase 0 on the grounds that a persistent banner plus disabled inputs was enough. On a phone the banner scrolls away while the disabled controls stay on screen.
4. `aria-describedby` on the Confirm checkbox is set only while the disclosure is open, so a screen-reader user hears no hint that an explanation exists until they've already found the `?`.
5. The tablist's `role="presentation"` wrappers are a *tolerated* shape, not a conforming one — `role="presentation"` on a plain `<div>` strips nothing. `aria-owns` on the `<nav>` listing the eleven tab ids would make it correct.
6. Two divisions with the same initials get identical chip badges. Degrades to today's colour-only behaviour rather than being worse.
7. The Schedule filter block still eats ~200px before the first event on a phone.

---

## Working conventions learned the hard way

- **Worktrees need `node_modules` symlinked** from the main checkout, `.env.local` copied in, and both added to the exclude file. Inside a worktree `.git` is a *file*, so `>> .git/info/exclude` fails — use `EX=$(git rev-parse --git-path info/exclude)`.
- **`.gitignore`'s `node_modules/` (trailing slash) matches directories only.** A worktree's *symlink* is not a directory, so `git add -A` would commit it and a later `reset --hard` would follow it and gut the real one.
- **`git worktree remove` fails with "Directory not empty"** when build scratch remains. Before removing by hand, confirm `node_modules` inside is absent or a symlink — never a real directory.
- **`dev` → `main` is not a fast-forward.** Use `git merge --no-ff dev` and confirm `git diff --stat dev main` prints nothing before pushing.
- **Commit author must be** `gmd4fy5yb4@privaterelay.appleid.com` or Vercel silently blocks the deploy.
- **Vercel has silently failed to deploy a pushed commit in this project.** Verify the new build is actually serving; don't assume. A push landing on GitHub is not a deploy.
- **A stale `.next` throws `__webpack_modules__[moduleId] is not a function`** and looks like a real 500. `rm -rf .next` before restarting `next dev`.
- **One dev server per port, and know which branch it serves.** `pkill -f "next dev"` first.
- **The LSP reports hundreds of phantom "Cannot find module" errors inside a worktree** because of the symlink, and mid-edit it reports errors that don't exist. `npx tsc --noEmit` is the only source of truth — it disagreed with the LSP several times this session, and the LSP was always the one that was wrong.
- **Verify a reported commit SHA against `git log`.** An agent reported a SHA for work it had only staged; the report read as complete.
- **New migrations must be app-prefixed** — `fd_015_…`, not `015_…`. `fd_014` is still the latest; Phase 2 added none.
- **Deploy code first, apply the migration second** — the reverse order once would have given every new signup unlimited free access.
- **`themes.test.ts` only locks the theme palette.** A hardcoded Tailwind colour slips past it. `text-gray-400` is 2.5:1 and fails AA; it was caught **five times** in this phase. `text-gray-500` (4.8:1) passes. `emerald-600` on white is 3.77:1; `emerald-700` is 5.55:1.

### On the plan-and-review loop

Phase 2 ran spec → plan → subagent-per-task → review → final review. It works, with one consistent lesson: **the plans' code samples were reliably right about structure and wrong at the boundaries** — the first keystroke, the empty state, the other division's card, the visitor who hasn't chosen yet. Nearly every defect the reviews caught came from a plan snippet, not from an implementer deviating.

So: write plans with real code read from the real files, and treat the review loop as the thing that finds the edges. Give reviewers the binding constraints verbatim as their attention lens — the reviews that named a constraint ("nothing colour-only", "≥44px") found violations of it, including violations the plan itself had waved through.

# HANDOFF — FieldDay Planner, Phase 3 (Admin Power Tools)

**Written:** 2026-08-02, at the end of the Phase 2 session.
**Revised:** 2026-08-03, after Phase 3 item 1 (conflict review) shipped to production.
**For:** a fresh session continuing Phase 3. Everything needed to begin is here; you should not need to read the Phase 0, 1 or 2 handoffs.

**Supersedes** `docs/archive/HANDOFF-phase1-trial-conversion.md` and `docs/archive/HANDOFF-phase2-coach-mobile.md`. Both describe finished work and were archived there on 2026-08-06 — kept as the record of why things were built the way they were, not as pending work.

---

## Where things stand

**Phase 3 item 1 is complete and live.** `main` is at `734c230`, deployed to fielddayplanner.app (Vercel `dpl_CWziDN…`, verified READY and serving, 2026-08-03). `dev` is at `d76be2e`; the two differ only by the merge commit, as always.

Phases 0, 1 and 2 have all shipped, plus the first of Phase 3's four items. The source is still `~/Downloads/design_handoff_fieldday_review/` — `ROADMAP.md` sequences the five phases, `README.md` holds the findings, and each item names a working HTML prototype in that folder.

**Read `docs/superpowers/specs/2026-08-02-conflict-review-design.md` before starting any remaining Phase 3 item.** It records the prototype-vs-reality problem described below, which applies to more than the item it was written for.

### What Phase 2 shipped — four merges

| Merge | What landed |
|---|---|
| **Mobile shell** (item 1) | `src/lib/mobileNav.ts` + test (the tab partition), `MobileNav.tsx` (bottom bar, More sheet, kebab sheet), one-row header, agenda-first Schedule, month-grid count dots, inline weather + Call coach / Directions on game cards, `EventModal` as a bottom sheet, motion keyframes with a `prefers-reduced-motion` guard. |
| **Mobile gaps** (unplanned, from two production screenshots) | Add-event FAB on Schedule — **there had been no way to add an event from the phone's default view**; Team Schedules and Field Calendar made responsive; exports and `Clear All` moved to desktop only. |
| **Coach view-only page** (item 2) | `src/lib/coachView.ts` + test, `CoachView.tsx`. A share-link viewer now gets a purpose-built read surface instead of the admin shell: team picker (persisted per-league), next-game hero with Directions and weather, YOURS-tagged schedule, highlighted standings, and the "run your own league free" footer. |
| **Standings detail + a11y** (item 3) | `src/lib/standings.ts` + test (streak / last-5 / recent results), mobile standings list with tap-row detail, desktop nav as a real WAI-ARIA tablist with arrow keys, Confirm disclosure replacing a mouse-only tooltip, division-initials badges on month-grid chips, focus trap + restore in all three dialogs. |

58 commits on `main` since Phase 1.

### What Phase 3 item 1 shipped (2026-08-03)

`AutoScheduleTab.tsx`'s conflict carousel and its separate collapsed table are **gone**, replaced by one severity-sorted flag list. PR #4, 12 commits, merge `734c230`.

| File | What |
|---|---|
| `src/lib/conflictPlan.ts` + test | New. Pure derivation: severity, a concrete fix candidate, and blackout overrides per conflict. 15 assertions. |
| `src/lib/autoScheduler.ts` | Tightened the `details[]`/`suggestions[]` wording where counts are still structured; exported `slots(n)`; hoisted team-name lookups that ran six times per conflict. |
| `src/components/AutoScheduleTab.tsx` | Flag list with named one-click fixes, auto-fix-all, skip-all, per-card Undo; apply gate; auto-snapshot before Replace. |
| `src/app/page.tsx` | One line — passes `leagueCode` and `userName` through. |

No migration, no new persisted state, `types.ts` untouched.

Behaviour worth knowing before you touch this tab:
- **Severity means fixability.** `warning` = a concrete alternative slot exists and the button names it. `conflict` = no slot exists under any relaxation. Two tiers only.
- **`conflictPlan` reserves each candidate as it walks the list**, so no two cards can ever offer the same slot. That is what makes "apply all warnings in one `setState`" correct. If you change that function, keep the reservation or auto-fix-all will double-book a field.
- **Apply is hard-gated** on zero open flags, at three layers (button `disabled`, a `useEffect` collapsing the confirm row, and an early return in `commitPreview`). The layers exist because a review found a route where confirming Replace, then reopening a flag, committed onto a one-game preview and wiped the league.
- **Replace fails closed.** It `await`s `saveSnapshot` and refuses to commit if the snapshot fails, rather than proceeding while claiming a backup exists.

---

## Phase 3 — what's left

From `ROADMAP.md`. The theme is **"setup never stalls"** — this is the phase that earns renewals.

| Effort | Item | Prototype |
|---|---|---|
| ~~L~~ | ~~Auto-schedule draft → conflict review → apply~~ — **SHIPPED 2026-08-03**, see above | `Conflict Review Prototype.dc.html` |
| M | Live-conflict event modal + umpire board. Prevention over flagging: availability dots per field/time, busy umpires unclickable, crew-load bars, save gated on conflicts with a "book anyway" escape. **See the umpire caveat below — this one is larger than M suggests.** | `Event Modal Prototype.dc.html`, `Umpire Assignment Prototype.dc.html` |
| M | CSV import wizard + Divisions & Teams redesign. Soft-warning preview (merge duplicates, flag missing emails), snapshot-before-replace; expandable team rows with coach roles. | `CSV Import Wizard Prototype.dc.html`, `Divisions Teams Prototype.dc.html` |
| M | History panel (Undo + Snapshots merged). **Caveat from the roadmap:** human-readable change labels need a small action label recorded at each `setState` site — the undo stack stores raw blobs today. Ship the merged panel first, labels second. | `History Panel Prototype.dc.html` |

### The prototypes describe a scheduler this app does not have

**This is the most important thing on this page.** The roadmap said item 1 was "presentation + resolution actions, not a new engine" because `autoScheduleConflicts` already existed. That was half true, and the false half changed the work.

The Conflict Review prototype's four flags — field double-booked, umpire on overlapping games, team plays back-to-back days, only 90 minutes between games — are all **quality problems in games that were placed**. This scheduler cannot produce any of them:

| Prototype flag | Why not |
|---|---|
| Field double-booked | Prevented at `autoScheduler.ts:203` |
| Umpire overlap | The scheduler assigns **no umpires at all** (`umpireId: ''`) |
| Back-to-back days | Never evaluated — the check blocks *same-day* only |
| Short turnaround | Never evaluated |

FieldDay's scheduler is **constructive**: it only ever emits a game satisfying every constraint, so its single failure mode is **omission**. Every conflict it produces is one unplaced matchup. The prototypes were drawn against a **repair**-style scheduler that places everything then audits. Both are legitimate designs; they produce opposite conflict taxonomies, and the prototypes' vocabulary ("fix this", "auto-fix all") only reads naturally in the repair model.

Item 1 resolved this by building the prototype's **chrome** over the app's **real** conflicts, and explicitly not building an audit engine. **The remaining items need the same reading.** In particular:

- **The umpire board assumes umpire assignment that does not exist.** `ScheduledGame.umpireId` is a field, and `Umpire` is a type, but nothing ever populates it — the scheduler writes `umpireId: ''` on every game. "Busy umpires unclickable" and "crew-load bars" are not presentation over existing data; they require building assignment first. Scope this before committing to M.
- **The event modal's "live conflict" dots** are genuinely derivable — the constraint checks exist in `autoScheduler.ts` and could be lifted into a shared predicate. That half is closer to the roadmap's claim than the umpire half.

**Before writing code for any remaining item, verify the data it assumes actually exists.** This claim has now been wrong twice: once in Phase 2's standings prototype ("the detail is a render, not a new query" — streak and last-5 had no source anywhere), and once here. Read the real files; the roadmap is a design document, not a survey of the codebase.

### If you build a post-schedule audit later

Back-to-back-days and field-turnaround detection were ruled **out of scope** for item 1, not judged worthless. If they are wanted, they are a new analysis pass over placed games — `autoScheduleConflicts` has no room for them as-is, and `ScheduleConflict` would need a `kind` discriminator. `conflictPlan.ts` is the natural place for the derivation and its severity mapping; the flag list would render the result with no changes.

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

**Status check, 2026-08-03:** all five are still uncommitted and none has been modified since **2026-07-28 17:06** — six days stale. Phase 3 item 1 was built and shipped around them without difficulty, so the constraint is livable. But if this is still true when you read it, **ask whether that work is abandoned** rather than continuing to route around it indefinitely. Several small cleanups are blocked purely on `types.ts` being untouchable (see deferred items 9–13 below). Do not resolve this unilaterally — the files are someone else's uncommitted work, and `git clean` would destroy it.

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
npx tsx src/lib/conflictPlan.test.ts # severity, overrides, slot reservation (15)
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

### Deferred from Phase 3 item 1 — all pre-existing, none introduced by it

Reviewed and consciously left alone; fix whenever you are next in that file.

8. **Seven `text-gray-400` instances remain in `AutoScheduleTab.tsx`** (~:425, 436, 468, 523, 547, 825, 972). 2.5:1 — fails WCAG AA. Two of them are the only text in their container. `themes.test.ts` will not catch these: it locks the theme palette, not hardcoded Tailwind colours.
9. **`teamMap` in `AutoScheduleTab.tsx` is dead *and* wrong** — it builds `new Map(teams.map(t => [t, t]))`, keying by the team object rather than the id, so it could never have worked. Nothing reads it. Safe to delete outright.
10. `fmtDate` and `DAY_NAMES_FULL` in the same file are unused.
11. Nothing asserts the reworded conflict detail strings, so an accidental revert of the wording would pass the suite. Judged not worth a snapshot test on prose — the one branching piece, `slots()`, *is* asserted.
12. `'deferred'` is still in the `ScheduleConflict['resolution']` union but is no longer emitted anywhere. Removing it means editing `types.ts` — see the ownership warning above — so it stays until that file is free.
13. `resolveConflict`'s `'resolved'` branch is dead; every call site passes `'skipped'` and `applyFix` writes `'resolved'` inline.

---

## Working conventions learned the hard way

- **Worktrees need `node_modules` symlinked** from the main checkout, `.env.local` copied in, and both added to the exclude file. Inside a worktree `.git` is a *file*, so `>> .git/info/exclude` fails — use `EX=$(git rev-parse --git-path info/exclude)`.
- **`.gitignore`'s `node_modules/` (trailing slash) matches directories only.** A worktree's *symlink* is not a directory, so `git add -A` would commit it and a later `reset --hard` would follow it and gut the real one.
- **`git worktree remove` fails with "Directory not empty"** when build scratch remains. Before removing by hand, confirm `node_modules` inside is absent or a symlink — never a real directory.
- **`dev` → `main` is not a fast-forward.** Use `git merge --no-ff dev` and confirm `git diff --stat dev main` prints nothing before pushing.
- **Commit author must be** `gmd4fy5yb4@privaterelay.appleid.com` or Vercel silently blocks the deploy.
- **Vercel has silently failed to deploy a pushed commit in this project.** Verify the new build is actually serving; don't assume. A push landing on GitHub is not a deploy.
- **The push itself can fail silently too.** On 2026-08-03 `git push origin main` timed out after 3 minutes and `origin/main` was unchanged — the merge commit existed only locally. Always `git fetch` and compare `origin/main` to your merge SHA before declaring a deploy. Same failure class as the line above, one step earlier in the chain.
- **Verify the deploy against the Vercel API, not the page HTML.** A `buildId` probe against `fielddayplanner.app` returns nothing on Next 15's App Router, so a before/after comparison reads empty-vs-empty — indistinguishable from "no new build". Use the MCP `get_deployment` and check `readyState: READY` plus `meta.githubCommitSha`. A check whose negative result matches its inconclusive result is not a check.
- **A stale `.next` throws `__webpack_modules__[moduleId] is not a function`** and looks like a real 500. `rm -rf .next` before restarting `next dev`.
- **One dev server per port, and know which branch it serves.** `pkill -f "next dev"` first.
- **The LSP reports hundreds of phantom "Cannot find module" errors inside a worktree** because of the symlink, and mid-edit it reports errors that don't exist. `npx tsc --noEmit` is the only source of truth — it disagreed with the LSP several times this session, and the LSP was always the one that was wrong.
- **Verify a reported commit SHA against `git log`.** An agent reported a SHA for work it had only staged; the report read as complete.
- **New migrations must be app-prefixed** — `fd_015_…`, not `015_…`. `fd_014` is still the latest; Phase 2 added none.
- **Deploy code first, apply the migration second** — the reverse order once would have given every new signup unlimited free access.
- **`themes.test.ts` only locks the theme palette.** A hardcoded Tailwind colour slips past it. `text-gray-400` is 2.5:1 and fails AA; it was caught **five times** in this phase. `text-gray-500` (4.8:1) passes. `emerald-600` on white is 3.77:1; `emerald-700` is 5.55:1.

- **`npm run build` exits non-zero at the lint step** — `ESLint must be installed in order to run during builds`. `eslint.config.mjs` is tracked but `eslint` is in no `package.json`. Pre-existing on every branch. **Compilation succeeds**; read the log rather than the exit code, or install eslint and be done with it.

### On the plan-and-review loop

Phase 2 ran spec → plan → subagent-per-task → review → final review. It works, with one consistent lesson: **the plans' code samples were reliably right about structure and wrong at the boundaries** — the first keystroke, the empty state, the other division's card, the visitor who hasn't chosen yet. Nearly every defect the reviews caught came from a plan snippet, not from an implementer deviating.

So: write plans with real code read from the real files, and treat the review loop as the thing that finds the edges. Give reviewers the binding constraints verbatim as their attention lens — the reviews that named a constraint ("nothing colour-only", "≥44px") found violations of it, including violations the plan itself had waved through.

**Phase 3 item 1 sharpened this into something more specific.** Four task-scoped reviews passed clean; the whole-branch review then found five Important defects, two of which combined into a route that could wipe a league's schedule. The pattern in all five: **the plan reasoned carefully about the block being edited and not at all about that block's lifetime or its neighbours.**

- `placedBy` was specified as component state without asking whether the tab unmounts. It does — `page.tsx` renders `AutoScheduleTab` conditionally — so a placed game silently became an orphan on any tab switch.
- Task 4 gated the pre-confirmation buttons and never revisited the confirmation row two steps earlier in the same file.
- Task 4 rewrote the Replace confirmation copy while the same file's intro paragraph still told users to snapshot by hand.

Two changes worth making to the next plan:

1. **Add a per-task step: "what else in this file or component now contradicts this change?"** That one question would have caught three of the five.
2. **Specify interfaces and invariants rather than finished source.** Embedding complete code blocks made the logic correct and left every seam unexamined — which is exactly where the defects were. The reviews found integration bugs, not logic bugs, because the logic had been pre-written and the seams never had an author.

Also: a task that produces **no commits** (a verification pass) has no diff, so there is nothing for a task-scoped review to read. Don't dispatch one; let the whole-branch review cover it. And re-verify in a browser **after** the final fix wave — item 1's browser pass ran before the fixes, which left the rewritten async commit path unobserved until a second pass was run deliberately.

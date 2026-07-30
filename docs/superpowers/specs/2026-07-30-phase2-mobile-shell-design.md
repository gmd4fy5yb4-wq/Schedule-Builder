# Design — FieldDay Planner Phase 2, Item 1: Mobile Shell

**Date:** 2026-07-30
**Source:** `HANDOFF-phase2-coach-mobile.md`; `~/Downloads/design_handoff_fieldday_review/Mobile Shell Prototype.dc.html` (390px, iOS frame); ROADMAP findings 9, 10, 11.
**Scope:** Phase 2 item 1 only. Items 2 (coach view-only page) and 3 (standings detail + a11y) are deliberately out of scope for this spec.

---

## Problem

Half of FieldDay's users are coaches on phones. Today they get the desktop layout: a header that stacks six-plus controls and wraps badly, an 11-tab horizontally-scrolling nav, month calendar grids with event chips too small to tap, and a 128px square weather card eating a third of every game card. This is the strategic counter to competitors' native apps, and it is currently the worst surface in the product.

## Principle

Below 640px the app is **a projection of what already exists**, not a second application. There is no second navigation model, no second write path, no mobile-only route table. Almost every item below is a media query, a default value, or a restyle of a component that already ships.

---

## The structural decision

The handoff flags one question to settle before code: does the bottom bar map onto existing `TABS` indices, or does mobile get its own route table?

**Decision: map onto existing `TABS` indices.**

`page.tsx` holds a single `tab: number` indexing an 11-entry `TABS` array. There is no URL router; `onNavigate` is literally `setTab` handed to `DashboardTab`. A mobile route table would therefore introduce a *second* source of navigation truth with nothing to integrate against, and the first-run checklist's deep links (tabs 1, 2, 3, 8) would silently no-op on phones.

Mapping keeps `setTab` the only navigation truth. The bottom bar's four slots and the More sheet together form a partition of `TABS`.

`NAV_GROUPS` already encodes the clustering this needs — Overview `[0]`, Operate `[8,5,6,7,9,10]`, Setup `[1,2,3,4]`. The mobile IA is a re-grouping of an existing structure, not a new one.

---

## Components

### 1. `src/lib/mobileNav.ts` (new)

The partition, as data, so it can be tested without a DOM.

- `BOTTOM_TABS` — the three content slots: `0` (Today), `5` (Schedule), `9` (Standings). The fourth bottom slot is More, which is a sheet, not a tab index.
- `moreTabs(isViewer: boolean): number[]` — every `TABS` index not in `BOTTOM_TABS`, with the same viewer filter the desktop nav applies today (`isViewer` hides indices 1–4 and 8).

### 2. `src/components/MobileNav.tsx` (new)

One file holding the bar and both sheets, because they share a sheet primitive and nothing else consumes it.

- **Bottom bar** — `fixed bottom-0 sm:hidden`, four buttons, ≥44px targets, Lucide icons via the existing `Icon` component, active state `var(--fd-primary)`. Renders `aria-current="page"` on the active slot, matching the desktop nav's existing pattern.
- **More sheet** — lists `moreTabs(isViewer)`, each row calling `setTab(i)` then closing. Below the list: the league-code copy row and the sync-status line, both moved down out of the header.
- **Kebab sheet** — Undo (disabled when `!canUndo`), Snapshots, Account, Sign Out / Leave, Prospect Card. Same primitive, different contents.
- **Sheet primitive** — a local component in this file: fixed backdrop, bottom-anchored panel, `role="dialog"` + `aria-modal`, Escape closes, backdrop click closes.

Both sheets are pure navigation/action launchers. Neither one writes state.

### 3. `page.tsx` (edit)

- Desktop tab nav wrapper gains `hidden sm:block`.
- `<main>` gains `pb-24 sm:pb-6` so the fixed bar never covers the last row of content.
- Header right-hand cluster: every control gains `hidden sm:flex` / `hidden sm:inline-flex`; a mobile-only row renders league title + Share + `⋯`.
- `<MobileNav>` rendered once, after `<main>`, receiving `tab`, `setTab`, `isViewer`, and the handful of action callbacks the kebab sheet fires (`handleUndo`, `canUndo`, `setShowSnapshots`, `handleSignOut`, `handleLeave`, `copyCode`, `leagueCode`, `syncStatus`).
- No change to `TABS`, `NAV_GROUPS`, the content switch, or any `onNavigate` call.

### 4. `TrialBar.tsx` (edit)

Compact single-row layout below 640px: TRIAL badge · "9 days left" · "Keep it" link. Styling only — the bar already renders in the correct two places (under the header, and above `LeagueGate` for brand-new signups) and is already suppressed for viewers.

### 5. `ScheduleTab.tsx` (edit)

- `view` state initializes to `'list'` when `window.matchMedia('(max-width: 639px)').matches`, else `'calendar'`. Initializer function, read once on mount — not a live listener; a user who rotates their phone keeps whatever view they last chose.
- Segmented control renders **Agenda / Month** on mobile (Calendar / Day / List stays at `sm:` and up). Day view is desktop-only.
- List view: existing `<table>` gains `hidden sm:table`; day-grouped agenda cards render below 640px.
- Month grid: below 640px, day cells render a count dot instead of event chips; tapping a day switches to agenda.

### 6. `DashboardTab.tsx` (edit)

`DashboardTab` is already "Week at a Glance," grouped by day with today first — it *is* the Today screen; it does not need replacing.

- `WeatherCard`'s 128px square becomes an inline strip inside the card header below 640px (same `DayWeather` data, different layout).
- Game cards gain 44px **Call coach** (`tel:` from the coach's `phone`) and **Directions** (maps URL from the field's `geocoords`, falling back to `address`) buttons.
- Both buttons render only when their data exists. No new fields, no migration.

### 7. `EventModal.tsx` + `globals.css` (edit)

Below 640px the modal becomes a bottom sheet: `items-end sm:items-center`, `rounded-t-2xl sm:rounded-xl`, full-width, grabber affordance, full-width confirm button. One component, one save path — desktop and mobile stay in sync by construction.

Motion, as CSS keyframes in `globals.css`, per the prototype:

- `sheet-up` — `.3s cubic-bezier(.32,.72,.35,1)`, slight overshoot
- backdrop fade — `.15s`
- `view-in` — `.2s`, 14px slide

All wrapped in a `@media (prefers-reduced-motion: reduce)` guard that drops them to no-ops.

---

## Deliberately not built

- **Crimson FAB → quick-add sheet.** `EventModal` already creates events; a parallel quick-add is a second write path to keep in sync. Add when adding a game on a phone is demonstrably buried.

  Amendment (2026-07-30, found while planning): the month grid's per-day `+` button is `opacity-0 group-hover:opacity-100`, and there is no hover on a touch screen — so today it is *unreachable* on a phone. Making it `opacity-100 sm:opacity-0` restores the add affordance in one class. That is what makes the FAB skippable rather than merely deferred; without it, skipping the FAB would have shipped a phone with no way to add an event.
- **The prototype's standalone Edit sheet** (time/field chips + confirm toggle). Same reason — `EventModal` is that editor, restyled.
- **Locked-edit toast** (carried forward from Phase 0). The handoff notes the mobile shell may change the calculus, since on a phone the amber banner scrolls away while disabled controls stay on screen. Revisit after this ships and the expired state is actually verified on a device.

---

## Testing

No test framework; standalone assert files run with `npx tsx`.

`src/lib/mobileNav.test.ts` covers the one non-trivial invariant this design can break:

1. Every `TABS` index is reachable for an admin — `BOTTOM_TABS ∪ moreTabs(false)` equals all 11 indices, with no duplicates.
2. Every viewer-visible index is reachable — `BOTTOM_TABS ∪ moreTabs(true)` equals the desktop nav's viewer-visible set.
3. A viewer never sees a setup tab — `moreTabs(true)` intersects `[1,2,3,4,8]` emptily.

Assertion 1 is the one that matters: it fails the day someone adds a twelfth tab and forgets the phone.

Full suite before merge:

```bash
npx tsx src/lib/mobileNav.test.ts
npx tsx src/lib/plans.test.ts
npx tsx src/lib/trial.test.ts
npx tsx src/lib/planUsage.test.ts
npx tsx src/lib/themes.test.ts
npx tsx src/lib/bundle.test.ts
npx tsc --noEmit
npm run build
```

Visual verification at 390px against the prototype, for both an admin and a share-link viewer. `themes.test.ts` only locks the theme palette — any hardcoded Tailwind colour introduced here gets contrast-checked by hand.

---

## Constraints carried in

- **Shared checkout.** Another live session owns `src/lib/linkedCalendars.ts`, `LinkedCalendarsTab.tsx`, `src/lib/types.ts` and `HANDOFF-shared-calendar.md` in this working tree. Do not touch them; do not switch branches here. Work happens in `.worktrees/phase2-mobile-shell`, with `node_modules` symlinked, `node_modules` in `.git/info/exclude`, and `.env.local` copied in.
- **`TABS` is contended.** The linked-calendar work will want a place in the More sheet. Because More is derived (`moreTabs()` = everything not in `BOTTOM_TABS`), a new tab appears there automatically — but coordinate before changing `TABS` itself.
- **No migration.** Every field this needs (`phone`, `address`, `geocoords`) already exists. `fd_014` remains the latest.
- **Commit author must be the Apple relay** (`gmd4fy5yb4@privaterelay.appleid.com`) or Vercel silently blocks the deploy.
- **One dev server per port**, and know which branch it serves. `pkill -f "next dev"` before restarting.
- Merge path: worktree → `dev` from the main checkout → `git merge --no-ff dev` into `main`, confirming `git diff --stat dev main` is empty before pushing.

## Success criteria

At 390px: the header is one row; four thumb-reachable tabs sit at the bottom; every one of the 11 tabs is still reachable; the schedule opens as an agenda; a coach can call and get directions in one tap each; an admin can edit a game in a sheet that shares its save path with desktop. Nothing above 640px changes.

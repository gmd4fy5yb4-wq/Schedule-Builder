# Design — FieldDay Planner Phase 2, Item 3: Standings Detail + A11y Pass

**Date:** 2026-08-02
**Source:** `HANDOFF-phase2-coach-mobile.md`; `~/Downloads/design_handoff_fieldday_review/Standings Detail Prototype.dc.html` and `A11y Fixes Prototype.dc.html` (finding 16).
**Depends on:** Phase 2 items 1 and 2, both shipped (`main` @ `dab5896`).
**Scope:** the last item in Phase 2. Both halves — the standings change and the accessibility pass — in one pass.

---

## Problem

Two unrelated defects, bundled by the roadmap because they touch the same screens.

**Standings hide their own data on a phone.** `src/components/StandingsTab.tsx` contains **no `sm:` classes at all** and renders a ten-column table — `Team GP W L PCT RF RA DIFF GB` — inside `overflow-x-auto`. At 390px everything past W-L is off the right edge. The *page* does not scroll, which is why this survived item 1's overflow check: the table scrolls inside its own container, with no affordance telling anyone there is more. A parent checking whether their team is in the hunt sees a win-loss record and nothing else.

**The interface is hostile to screen readers and to colour-blind users.** Finding 16 lists three gaps: the desktop nav is eleven bare `<button>`s that announce as eleven unrelated controls; the Confirm control's explanation fires on `mouseenter` only, so touch and keyboard users never see it; and month-grid event chips encode division by background hue alone, which fails for roughly 8% of men with colour-vision deficiency and is multiplied by the six-theme system.

A fourth gap is ours, not the roadmap's: **the sheets have no focus management**, deferred from both prior items.

---

## Decisions taken before design

1. **Both halves in one pass.** This closes Phase 2.
2. **Keep the visual tab grouping; mark the wrappers presentational.** Phase 0 deliberately clustered the eleven tabs into Overview / Operate / Setup. WAI-ARIA wants a `tablist`'s children to be tabs, and ours sit inside three labelled group divs. Rather than flatten the nav — undoing a deliberate design decision — the group wrappers take `role="presentation"` and their labels `aria-hidden`, which makes the eleven tabs the tablist's effective children while the visual grouping survives untouched.

---

## What the prototype gets wrong

The standings prototype says "the detail is a render, not a new query." That is only partly true and the difference matters.

`TeamRecord` carries `teamId`, `teamName`, `W`, `L`, `T`, `RF`, `RA`, `GP`, and `calcGB` derives games-back. But **streak and last-5 do not exist**: the accumulation loop at `StandingsTab.tsx:72-103` iterates `state.schedule.games` in array order and never sorts by date or tracks sequence. Both require walking a team's completed games chronologically.

That is fortunate rather than annoying — it is pure logic over a list, the same shape as `mobileNav.ts` and `coachView.ts`, so it can carry this item's automated coverage.

---

## Components

### `src/lib/standings.ts` (new)

Pure, React-free, runnable under `npx tsx`.

```ts
export type Outcome = 'W' | 'L' | 'T'
export interface TeamForm {
  last5: Outcome[]                      // most recent last, oldest first
  streak: { kind: Outcome; count: number } | null
  recentResults: {
    gameId: string
    date: string
    outcome: Outcome
    opponentTeamId: string
    scoreFor: number
    scoreAgainst: number
  }[]
}
export function teamForm(games: ScheduledGame[], teamId: string, limit: number): TeamForm
```

It filters to that team's games that have a `result`, sorts chronologically by `` `${date}T${time}` ``, and walks them. `streak` counts the current run from the most recent game backwards and is `null` when the team has played nothing. A tie breaks a streak rather than extending it.

**Not moved:** the existing `TeamRecord` accumulation stays in `StandingsTab`. It works, the detail header reads it directly, and relocating working code to satisfy tidiness is how regressions arrive. **Not duplicated:** the detail's "next game" reuses `nextGameFor(state, teamId, now)` from `src/lib/coachView.ts`.

### `src/components/StandingsTab.tsx` (modified)

Below 640px only, the table is replaced by a compact list: rank, team name, W-L, PCT, chevron. Tapping a row opens the detail in place, with a back control returning to the list. Desktop keeps the existing ten-column table exactly as it is — it has the width, and nothing above 640px may change.

The detail shows, in the prototype's order: record tiles (RECORD, PCT, **GAMES BACK**, **STREAK**), last-5 dots, a runs for/against split bar, recent results with W/L badges, next game with a Directions link, and coaches with call/email links.

**STREAK is never colour-only** — it carries its letter and count as text (`W3`, `L2`), with colour as reinforcement. Same rule for the last-5 dots and the W/L badges: each carries its letter.

`highlightTeamId` (added in item 2 for the coach page) continues to work, and the mobile list highlights that row the same way the table does.

Because `CoachView` renders `StandingsTab`, the coach page inherits the mobile list and detail with no further change.

### `src/app/page.tsx` (modified) — the tabs

- `role="tablist"` with an `aria-label` on the desktop `<nav>`.
- `role="presentation"` on each of the three group wrapper divs; `aria-hidden="true"` on each group label span. The labels are decorative repetition of information the tabs already convey.
- Each tab button: `role="tab"`, `aria-selected`, `aria-controls` pointing at the panel, a stable `id`, and roving `tabindex` — `0` on the selected tab, `-1` on the rest.
- Arrow Left/Right move selection between tabs, Home/End jump to first/last, wrapping at the ends, and focus follows selection. The existing `focus-visible` crimson ring stays.
- `<main>` becomes `role="tabpanel"` with `aria-labelledby` naming the active tab.

`aria-current="page"` is dropped from these buttons: `aria-selected` is the correct state for a tab, and carrying both would announce twice.

**Deliberately not converted:** `MobileNav`'s bottom bar and `CoachView`'s section strip. A bottom bar is conventionally a `<nav>` landmark with `aria-current`, which both already have. `CoachView` additionally renders two navs for one panel set (a mobile bar and a desktop strip, one hidden per viewport), so making both tablists would leave two tablists competing to own the same panel.

### `src/components/DashboardTab.tsx` (modified) — the Confirm disclosure

The `confirmTip` state and its `onMouseEnter` / `onMouseLeave` handlers are replaced by a real disclosure: a `?` button next to the Confirm checkbox, toggled by click or Enter, with `aria-expanded` and `aria-controls`. The explanation panel it reveals is referenced by `aria-describedby` from the checkbox, so a screen reader reaching the checkbox hears the explanation without hunting for it. The panel carries a "Got it" dismiss control, as the prototype shows.

**The checkbox stays a checkbox.** The prototype frames Confirm as an `aria-pressed` toggle button; a native checkbox already announces its checked state correctly and is the better control for a boolean. Swapping it would be a downgrade dressed as an a11y fix.

### Division chips — `src/components/ScheduleTab.tsx` and `src/components/FieldCalendarTab.tsx`

Month-grid event chips render time and team names, and encode division **only** in `c.bg` / `c.text` / `c.border`. Each chip gains the division's initials in a solid badge — two letters derived from the division name (`Majors` → `MA`, `10U Minors` → `10`) — so the coding survives greyscale.

A shared `divisionInitials(name: string): string` helper lives in `src/lib/divisionColors.ts` alongside the palette it complements.

**Desktop only.** Both month grids now hide their chips below 640px in favour of count badges (shipped in the mobile-gaps batch), so there is no mobile chip to fix. The agenda and list views are unaffected — they already render the division's full name as text, so they were never hue-only.

### Sheet focus management — `src/components/MobileNav.tsx` and `src/components/CoachView.tsx`

Deferred from items 1 and 2; paid here. For `MobileNav`'s two sheets and `CoachView`'s team picker:

- On open, move focus to the dialog.
- While open, keep Tab and Shift+Tab inside it.
- On close, restore focus to the control that opened it.
- `CoachView`'s picker additionally gains Escape-to-close, which `MobileNav`'s sheets already have and it lacks — an inconsistency noted during item 2's review.

---

## Testing

`src/lib/standings.test.ts`, run with `npx tsx`, covering the logic that can actually be wrong:

1. `streak` returns the current run's kind and length from the most recent game backwards.
2. A tie **breaks** a streak rather than extending it.
3. `last5` is chronological, oldest first, and returns fewer than five when the team has played fewer.
4. `recentResults` is ordered most-recent-first and reports the score from that team's perspective (a 3-7 loss reads `scoreFor: 3, scoreAgainst: 7` whether the team was home or away).
5. Games without a `result` are excluded everywhere.
6. A team with no completed games yields `streak: null` and empty lists rather than throwing.

The interface work is verified in a browser at 390px and 1280px:

- **Keyboard:** Tab reaches exactly one tab stop in the nav; Arrow keys move selection; Home/End jump; the focus ring is visible throughout; the Confirm disclosure opens on Enter; each sheet traps focus and returns it to its opener on close.
- **Standings:** the mobile list shows rank/team/W-L/PCT with no horizontal scroll; a row opens the detail; the detail's numbers match the desktop table for the same team; the back control returns to the list.
- **Colour independence:** at 1280px, greyscale the page and confirm every division chip is still identifiable by its initials badge, and STREAK, last-5 dots and W/L badges all read without colour.
- **No regression:** the desktop standings table, the admin nav's appearance, and the coach page all render as before.

## Constraints carried in

- **Shared checkout.** Another live session owns `src/lib/linkedCalendars.*`, `LinkedCalendarsTab.tsx`, `src/lib/types.ts` and `HANDOFF-shared-calendar.md`. Do not touch them; do not switch branches in the main checkout. Work in a worktree and merge to `main` through a temporary worktree.
- **No new dependencies, no migration.** Every field needed already exists.
- **Nothing above 640px may change**, except the two intentional desktop changes here: the nav's ARIA semantics (no visual change) and the division-initials badge on month-grid chips.
- **Do not modify `TABS` or `NAV_GROUPS`.**
- **WCAG AA** 4.5:1 for text under 18px. `text-gray-400` (~2.5:1) fails and has been caught five times in this project; `text-gray-500` (~4.8:1) passes.
- **Touch targets ≥44px.**
- **Commit author must be** `gmd4fy5yb4@privaterelay.appleid.com` or Vercel silently blocks the deploy.

## Success criteria

On a phone, a parent opens Standings, sees their division ranked by W-L and PCT with nothing hidden, taps their team, and gets games-back, streak, last five, run differential, recent scores, the next game and a way to call the coach. On a keyboard, the nav behaves like tabs and every sheet returns focus where it came from. In greyscale, no division, streak or result is identifiable by colour alone. Nothing else about the app changes.

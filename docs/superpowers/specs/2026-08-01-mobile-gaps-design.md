# Design — Mobile Gaps: add-event blocker, More-tab layouts, toolbar hygiene

**Date:** 2026-08-01
**Trigger:** two production screenshots from a real league (`2026 Intramural Softball`, 132 games) on an iPhone, after Phase 2 item 1 shipped.
**Depends on:** Phase 2 item 1 (mobile shell), `main` @ `2341127`.
**Blocks:** Phase 2 item 2 (coach view-only page), spec'd at `docs/superpowers/specs/2026-07-31-phase2-coach-view-design.md`.

---

## Problem

Item 1 fixed the mobile *shell* — header, bottom bar, agenda-first schedule, sheet editor — and verified it at 390px. But it verified only the three tabs in the bottom bar. The five behind **More** were confirmed *reachable* and never checked for *usability*, and they still render desktop layouts. Worse, one defect is functional rather than cosmetic.

Three distinct problems, in severity order:

1. **An admin cannot add an event from the default mobile view.** `openAdd()` has exactly two callers: the month-grid day cell (`ScheduleTab.tsx:409`) and the Day view (`:695`). Item 1 made the phone default to Agenda and hid Day view on phones. Agenda has no add affordance at all. Item 1's plan cut the prototype's floating action button on the reasoning that "the add affordance already exists, it was just hover-gated" — true of the month grid, false of the view phones actually open. That reasoning was wrong and this is the correction.

2. **Team Schedules and Field Calendar are unusable at 390px.** Both open with `flex gap-6 min-h-[600px]` and a `w-56 flex-shrink-0` sidebar, with no responsive classes anywhere in either file. At 390px that is 224px of sidebar plus a 24px gap, leaving ~140px for the detail pane, which overflows: clipped dates, a `+ Add Event` button running off the right edge, and horizontal page scroll.

3. **Destructive and rare actions dominate the phone toolbar.** Export Excel, Export CSV and `Clear All` occupy two rows above the content on the Schedule tab. `Clear All` is destructive and one tap away, in the top third of the screen.

## Correction to an earlier claim

An earlier survey in this session flagged `FieldsTab` as having an unguarded `grid-cols-3`. That was a misread — it is already `grid-cols-1 sm:grid-cols-3` and needs no change. `DivisionsTab`, `UmpiresTab` and `CoachesTab` are likewise already partly responsive (`md:` prefixes, `overflow-x-auto`) and are out of scope.

---

## Changes

### 1. Add-event FAB — `ScheduleTab.tsx`

A crimson circular button, `sm:hidden`, rendered when `!readOnly`, fixed above the bottom bar (which is 56px plus the home-indicator inset). It calls the existing `openAdd(selectedDay)`.

- **One write path.** `openAdd` opens `EventModal` — the same editor, validation and save used by desktop and by the month grid. The prototype's separate Game/Practice quick-add sheet is deliberately not built: `EventModal` already carries a type selector, and a parallel write path is exactly what item 1 avoided.
- **The date is already correct.** `selectedDay` exists, defaults to today, and updates when a month-grid day is tapped. No new state.
- Rendered for every mobile view, not only Agenda. In the month grid it is a second path to the same action, which is harmless and keeps the control in one predictable place.
- The existing 36px per-day `+` in the month grid stays. It is no longer load-bearing once the FAB exists, but it is the faster path when you already know the date.

### 2. Toolbar — `ScheduleTab.tsx`

Export Excel, Export CSV and `Clear All` become `hidden sm:*`.

Rationale, in order of weight: `Clear All` is destructive and currently a prominent one-tap target on a phone; spreadsheet export on iOS is a poor experience regardless; and all three are rare administrative actions consuming the top third of a 390px screen before any schedule appears. Hiding them removes a real hazard rather than merely tidying.

Accepted cost: an admin with only a phone cannot export or clear the schedule. If that proves wrong, the alternative — already considered and rejected as heavier — is a per-tab `⋯` menu.

The coach-notification control is **not** hidden: notifying coaches from a phone is a plausible thing to do at a field.

### 3. Team Schedules — `TeamScheduleTab.tsx`

- Line 94: `flex gap-6 min-h-[600px]` → stacks below 640px and keeps the desktop two-column layout above it (`flex-col sm:flex-row`, `sm:min-h-[600px]`).
- Line 97: sidebar `w-56 flex-shrink-0` → `hidden sm:block` at its current width.
- Below 640px, a native `<select>` grouped by division with `<optgroup>` replaces the sidebar and sets `selectedTeamId`. This is the platform's own picker: no scrolling past twenty teams to reach the detail pane, correct keyboard and assistive-technology behaviour for free, and roughly fifteen lines. It is the right rung of the ladder — a native control beats a custom list.
- Line 202: the events `<table>` gains an `overflow-x-auto` wrapper. This is what clips the dates in the screenshot.
- The stats row (`Games / Home / Away / Practices`, plus W/L/T when results exist) wraps instead of overflowing, and `+ Add Event` sits below it on mobile rather than being pushed off-screen by `ml-auto`.

### 4. Field Calendar — `FieldCalendarTab.tsx`

Same two-column stacking fix as Team Schedules (line 83, and its sidebar).

The month grid (`grid-cols-7`, `min-h-[120px]` cells at lines 176, 203, 268) gets the treatment already proven in `ScheduleTab`'s month grid: `min-h-[56px] sm:min-h-[120px]`, per-event chips hidden below 640px, and a count dot in their place. Copying an existing in-repo pattern rather than inventing a second one.

### 5. Setup — `SetupTab.tsx`

Lines 163 and 184: `grid-cols-2` → `grid-cols-1 sm:grid-cols-2`.

---

## Testing

There is no meaningful new pure logic here — every change is presentation or a call to an existing handler — so **no new test file**. Claiming otherwise would be inventing a test to satisfy a habit.

Verification is:

- The six existing standalone suites stay green (`mobileNav`, `plans`, `trial`, `planUsage`, `themes`, `bundle`), plus `npx tsc --noEmit` and `npm run build`.
- A browser pass at **390px and 1280px** covering **all five affected tabs** — Schedule, Team Schedules, Field Calendar, Setup, and the Dashboard as a regression check. This is precisely the coverage item 1 missed: reachability was verified, usability was not. For each tab at 390px: no horizontal page overflow, no clipped content, every control ≥44px, and the desktop layout unchanged at 1280px.
- Functionally: from a phone, open Schedule in Agenda view, tap the FAB, and confirm `EventModal` opens and saves — the capability that is currently missing.

## Constraints carried in

- **Shared checkout.** Another live session owns `src/lib/linkedCalendars.*`, `LinkedCalendarsTab.tsx`, `src/lib/types.ts` and `HANDOFF-shared-calendar.md`. Do not touch them; do not switch branches in the main checkout. Work in a worktree, and merge to `main` through a temporary worktree rather than checking `main` out in the shared tree.
- **No new dependencies, no migration, no change to `TABS` or `NAV_GROUPS`.**
- **Nothing above 640px may change.** Every rule is `sm:`-guarded.
- **WCAG AA** 4.5:1 for text under 18px. `text-gray-400` (~2.5:1) fails and recurred four times during item 1.
- **Touch targets ≥44px** on new controls. The FAB should be 56px, the standard for a floating action button.
- **Commit author must be** `gmd4fy5yb4@privaterelay.appleid.com` or Vercel silently blocks the deploy.

## Success criteria

On a 390px phone: an admin can add an event from the view the app opens on; Team Schedules and Field Calendar fit the screen with no clipped content and no horizontal scroll; picking a team takes one tap of a native picker; and no destructive action sits one tap from the top of the schedule. Nothing changes at 1280px.

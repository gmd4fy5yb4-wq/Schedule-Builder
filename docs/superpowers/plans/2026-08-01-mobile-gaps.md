# Mobile Gaps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the ability to add an event from a phone, make the five tabs behind **More** usable at 390px, and take a destructive one-tap action off the mobile schedule toolbar.

**Architecture:** Every change is presentation or a call to an existing handler. No new components, no new state machines, no new write paths. The add-event fix routes through `openAdd()` → `EventModal`, the same editor desktop uses. Responsive fixes are `sm:`-guarded Tailwind prefixes plus one native `<select>`.

**Tech Stack:** Next.js App Router (client components), React 19, Tailwind CSS, TypeScript. No test framework — standalone assert files run with `npx tsx`. No new dependencies.

## Global Constraints

- **No new npm dependencies.**
- **Nothing above 640px may change.** Every rule is `sm:`-guarded (Tailwind `sm` = 640px). A desktop regression is a task failure.
- **Do not touch these files** — another live session owns them: `src/lib/linkedCalendars.ts`, `src/lib/linkedCalendars.test.ts`, `src/components/LinkedCalendarsTab.tsx`, `src/lib/types.ts`, `HANDOFF-shared-calendar.md`.
- **Do not modify `TABS` or `NAV_GROUPS`** in `src/app/page.tsx` — both are contended with that session.
- **No database migration.** `fd_014` remains the latest.
- **Touch targets ≥44px** on new controls. The FAB is 56px, the standard floating-action-button size.
- **WCAG AA:** 4.5:1 for text under 18px. `text-gray-400` (#9CA3AF, ~2.5:1) **fails** — this recurred four times during the previous piece of work. `text-gray-500` (~4.8:1) passes.
- **Accent is `var(--fd-accent)` (#cd163f, crimson); primary is `var(--fd-primary)` (#00013a, navy).** Use the variables, not hex literals.
- **Commit author MUST be** `gmd4fy5yb4@privaterelay.appleid.com`, or Vercel silently blocks the deploy. Use:
  `git -c user.email=gmd4fy5yb4@privaterelay.appleid.com -c user.name="Gregory Amundson" commit -m "..."`
- **The LSP reports hundreds of phantom "Cannot find module" errors inside a worktree** because `node_modules` is a symlink. They are not real. `npx tsc --noEmit` is the only source of truth.

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `src/components/ScheduleTab.tsx` | Modify | Add the mobile FAB; hide Export Excel / Export CSV / Clear All below `sm`. |
| `src/components/TeamScheduleTab.tsx` | Modify | Stack the two-column layout; native `<select>` team picker on mobile; scrollable events table. |
| `src/components/FieldCalendarTab.tsx` | Modify | Stack the two-column layout; mobile month-grid treatment; make the per-day `+` touch-reachable. |
| `src/components/SetupTab.tsx` | Modify | Two unguarded `grid-cols-2` become responsive. |

No new files. No test file — see the Testing note in Task 6.

---

## Task 0: Isolated workspace

**Files:** none committed.

**Interfaces:**
- Consumes: nothing.
- Produces: a worktree at `.worktrees/mobile-gaps` on branch `mobile-gaps`, branched from `dev`. Every later task runs inside it.

The main checkout is shared with another live session and holds their uncommitted work. Never switch branches there.

- [ ] **Step 1: Create the worktree from `dev`**

```bash
cd /Users/gregoryamundson/Desktop/CLAUDE/fieldday-planner
git worktree add .worktrees/mobile-gaps -b mobile-gaps dev
```

- [ ] **Step 2: Symlink `node_modules` and copy env**

```bash
cd /Users/gregoryamundson/Desktop/CLAUDE/fieldday-planner/.worktrees/mobile-gaps
ln -s ../../node_modules node_modules
cp ../../.env.local .env.local
```

- [ ] **Step 3: Exclude both from git**

`.gitignore` contains `node_modules/` with a trailing slash, which matches directories only — a *symlink* named `node_modules` is not a directory, so `git add -A` would commit it, and a later `git reset --hard` would follow it and gut the real `node_modules`. Inside a worktree `.git` is a *file*, so `>> .git/info/exclude` fails with "not a directory". Ask git for the real path:

```bash
EX=$(git rev-parse --git-path info/exclude)
mkdir -p "$(dirname "$EX")"
printf 'node_modules\n.env.local\n' >> "$EX"
```

- [ ] **Step 4: Verify clean and compiling**

```bash
git status --short
npx tsc --noEmit
```
Expected: `git status --short` prints **nothing**; `tsc` exits 0. If `node_modules` or `.env.local` appears, Step 3 did not take — fix before writing code.

No commit — this task produces no tracked files.

---

## Task 1: Add-event FAB (the functional blocker)

**Files:**
- Modify: `src/components/ScheduleTab.tsx` — insert before the component's final closing `</div>` (end of file, just above `  )\n}`)

**Interfaces:**
- Consumes: `openAdd(date: string)` (declared at `ScheduleTab.tsx:122`), `selectedDay` state (`:31`), `readOnly` prop.
- Produces: nothing other tasks depend on.

**Why this task exists:** `openAdd` has exactly two callers — the month-grid day cell (`:409`) and the Day view (`:695`). The previous piece of work made phones default to the Agenda view and hid the Day view below `sm`. Agenda has no add affordance, so **there is currently no way to add an event from the view a phone opens on.** This is the correction.

- [ ] **Step 1: Add the FAB**

At the very end of `src/components/ScheduleTab.tsx`, immediately before the final `</div>` that closes the component's root element, insert:

```tsx
      {/* Mobile add-event FAB. Agenda is the default view on a phone and has
          no per-day `+`, so without this there is no way to add an event from
          the view the app opens on. Calls the same openAdd() the month grid
          uses, so EventModal stays the single write path — no quick-add sheet,
          no second place for a save bug to live. */}
      {!readOnly && (
        <button
          onClick={() => openAdd(selectedDay)}
          aria-label="Add event"
          className="sm:hidden fixed right-4 bottom-24 z-30 w-14 h-14 rounded-full bg-[var(--fd-accent)] text-white shadow-lg flex items-center justify-center text-3xl leading-none active:opacity-90"
        >
          +
        </button>
      )}
```

Notes on the values, so they are not "cleaned up" later:
- `bottom-24` is 96px, which clears the 56px bottom nav plus the home-indicator inset.
- `z-30` sits above page content but below the nav (`z-40`) and sheets (`z-50`), so an open sheet covers it.
- `w-14 h-14` is 56px — the standard FAB size and comfortably past the 44px minimum.
- `selectedDay` already defaults to today and updates when a month-grid day is tapped, so the new event lands on a sensible date with no new state.

- [ ] **Step 2: Typecheck and build**

```bash
npx tsc --noEmit && npm run build
```
Expected: no type errors; build succeeds. Report the actual output.

- [ ] **Step 3: Commit**

```bash
git add src/components/ScheduleTab.tsx
git -c user.email=gmd4fy5yb4@privaterelay.appleid.com -c user.name="Gregory Amundson" \
  commit -m "Add mobile FAB so events can be added from the agenda view"
```

---

## Task 2: Mobile schedule toolbar

**Files:**
- Modify: `src/components/ScheduleTab.tsx:250-280` (the button cluster inside `<div className="flex items-center gap-2 flex-wrap">`)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: nothing later tasks depend on.

Three of the four buttons in this cluster become desktop-only. **Notify Coaches stays visible on mobile** — messaging coaches from a phone at a field is a plausible thing to do; exporting a spreadsheet is not.

- [ ] **Step 1: Hide Export Excel below `sm`**

At line ~251, change:

```tsx
            <button onClick={doExport} disabled={exporting} className="bg-blue-600 text-white px-4 py-1.5 rounded-lg text-sm hover:bg-blue-700 transition disabled:opacity-50">
```

to:

```tsx
            <button onClick={doExport} disabled={exporting} className="hidden sm:block bg-blue-600 text-white px-4 py-1.5 rounded-lg text-sm hover:bg-blue-700 transition disabled:opacity-50">
```

- [ ] **Step 2: Hide Export CSV below `sm`**

At line ~256, change:

```tsx
            <button onClick={doExportCSV} disabled={exportingCsv} className="bg-emerald-600 text-white px-4 py-1.5 rounded-lg text-sm hover:bg-emerald-700 transition disabled:opacity-50">
```

to:

```tsx
            <button onClick={doExportCSV} disabled={exportingCsv} className="hidden sm:block bg-emerald-600 text-white px-4 py-1.5 rounded-lg text-sm hover:bg-emerald-700 transition disabled:opacity-50">
```

- [ ] **Step 3: Hide the whole Clear All control below `sm`**

Clear All renders as a ternary — either an inline confirm strip or the trigger button — so wrap the whole thing rather than tagging each branch. Change the block at lines ~269-280 from:

```tsx
          {(totalGames + totalPractices + totalSpecial) > 0 && !readOnly && (
            clearConfirm ? (
```

to:

```tsx
          {/* Desktop-only: destructive, and it was a prominent one-tap target in
              the top third of a 390px screen. Exports are hidden alongside it
              because a spreadsheet download on a phone is a poor experience. */}
          {(totalGames + totalPractices + totalSpecial) > 0 && !readOnly && (
            <div className="hidden sm:block">
            {clearConfirm ? (
```

and close the new wrapper: the block currently ends

```tsx
            )
          )}
```

which becomes

```tsx
            )}
            </div>
          )}
```

Read the surrounding JSX carefully before editing — the ternary's two branches must both end up inside the new `<div>`, and the outer `{cond && ( … )}` must still be balanced. If `npx tsc --noEmit` reports a JSX parse error, the braces are wrong; re-read rather than guessing.

- [ ] **Step 4: Typecheck and build**

```bash
npx tsc --noEmit && npm run build
```
Expected: no errors, build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/components/ScheduleTab.tsx
git -c user.email=gmd4fy5yb4@privaterelay.appleid.com -c user.name="Gregory Amundson" \
  commit -m "Hide exports and Clear All on phones; keep Notify Coaches"
```

---

## Task 3: Team Schedules responsive

**Files:**
- Modify: `src/components/TeamScheduleTab.tsx:94` (root layout), `:97` (sidebar), `:165-190` (stats row + Add Event), `:202` (events table)

**Interfaces:**
- Consumes: `selectedTeamId` / `setSelectedTeamId` state (`:21`), `state.divisions` (each `Division` has `id`, `name`, `teams: Team[]`; each `Team` has `id`, `name`, `divisionId`).
- Produces: nothing later tasks depend on.

This is the tab in the reported screenshot. The file contains **no `sm:` or `md:` classes at all** — it is a pure desktop two-column layout: a `w-56 flex-shrink-0` sidebar plus a `gap-6`, which at 390px leaves ~140px for the detail pane, which then overflows.

- [ ] **Step 1: Stack the layout below 640px**

Line 94, change:

```tsx
    <div className="flex gap-6 min-h-[600px]">
```

to:

```tsx
    <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 sm:min-h-[600px]">
```

`min-h-[600px]` becomes `sm:`-only: a fixed 600px minimum on a stacked mobile layout just adds dead space.

- [ ] **Step 2: Make the sidebar desktop-only**

Line 97, change:

```tsx
      <div className="w-56 flex-shrink-0 space-y-3">
```

to:

```tsx
      <div className="hidden sm:block w-56 flex-shrink-0 space-y-3">
```

- [ ] **Step 3: Add a native team picker for mobile**

Immediately **before** the sidebar `<div>` you just edited, insert:

```tsx
      {/* Mobile team picker. A native <select> rather than the sidebar list:
          the platform's own picker needs no scrolling past twenty teams to
          reach the detail pane, and it gets keyboard and assistive-technology
          behaviour for free. optgroup mirrors the sidebar's division grouping. */}
      <div className="sm:hidden">
        <label htmlFor="team-picker" className="block text-base font-semibold text-gray-700 mb-1.5">Teams</label>
        <select
          id="team-picker"
          value={selectedTeamId ?? ''}
          onChange={e => setSelectedTeamId(e.target.value || null)}
          className="w-full min-h-[44px] border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[var(--fd-accent)]"
        >
          <option value="">Choose a team…</option>
          {state.divisions.map(div => (
            div.teams.length > 0 && (
              <optgroup key={div.id} label={div.name}>
                {div.teams.map(team => (
                  <option key={team.id} value={team.id}>{team.name}</option>
                ))}
              </optgroup>
            )
          ))}
        </select>
      </div>
```

- [ ] **Step 4: Let the stats row wrap and free the Add Event button**

Around line 165, the stats row is:

```tsx
                <div className="flex gap-4 text-center">
```

change to:

```tsx
                <div className="flex flex-wrap gap-4 text-center">
```

and the `+ Add Event` button at ~line 181 currently carries `ml-auto`, which on a narrow screen pushes it off the right edge. Change its className from:

```tsx
                    className="ml-auto bg-[var(--fd-primary)] hover:bg-[var(--fd-primary-dark)] text-white text-sm font-semibold px-4 py-2 rounded-lg transition"
```

to:

```tsx
                    className="w-full sm:w-auto sm:ml-auto min-h-[44px] bg-[var(--fd-primary)] hover:bg-[var(--fd-primary-dark)] text-white text-sm font-semibold px-4 py-2 rounded-lg transition"
```

- [ ] **Step 5: Make the events table scrollable instead of clipped**

The table's parent is the card at line 201, `<div className="bg-white rounded-lg border overflow-hidden shadow-sm">` — and that `overflow-hidden` is precisely what clips the dates in the reported screenshot.

Do **not** change `overflow-hidden` to `overflow-x-auto` on that element: it is there to clip the card's rounded corners, and replacing it would square them off. Add an inner scroller instead. Change:

```tsx
              <div className="bg-white rounded-lg border overflow-hidden shadow-sm">
                <table className="w-full text-sm">
```

to:

```tsx
              <div className="bg-white rounded-lg border overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                <table className="w-full text-sm">
```

and add the matching `</div>` immediately after that table's `</table>`. The outer element keeps clipping the corners, the inner one scrolls. The table keeps its full width and scrolls inside its own container; the **page** must not scroll horizontally.

- [ ] **Step 6: Typecheck and build**

```bash
npx tsc --noEmit && npm run build
```
Expected: no errors, build succeeds.

- [ ] **Step 7: Commit**

```bash
git add src/components/TeamScheduleTab.tsx
git -c user.email=gmd4fy5yb4@privaterelay.appleid.com -c user.name="Gregory Amundson" \
  commit -m "Make Team Schedules usable on phones: stack, native picker, scrollable table"
```

---

## Task 4: Field Calendar responsive

**Files:**
- Modify: `src/components/FieldCalendarTab.tsx:83` (root layout), `:86` (sidebar), `:176`/`:203`/`:268` (`min-h-[120px]` cells), `:219-224` (the per-day `+`), `:228-258` (event chip list)

**Interfaces:**
- Consumes: `selectedFieldId` / `setSelectedFieldId` state, `state.fields`, `openAdd(dateStr)`, and inside the chip IIFE the local `n` (`events.length`) and `events`.
- Produces: nothing later tasks depend on.

This file has the **same** two-column bug as Task 3 and the **same** hover-gated `+` bug the Schedule month grid already had fixed.

- [ ] **Step 1: Stack the layout below 640px**

Line 83, change:

```tsx
    <div className="flex gap-6 min-h-[600px]">
```

to:

```tsx
    <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 sm:min-h-[600px]">
```

- [ ] **Step 2: Make the field sidebar horizontally scrollable on mobile**

Line 86, change:

```tsx
      <div className="w-48 flex-shrink-0 space-y-2">
```

to:

```tsx
      <div className="w-full sm:w-48 flex-shrink-0 flex sm:block gap-2 sm:gap-0 overflow-x-auto sm:overflow-visible sm:space-y-2 pb-1 sm:pb-0">
```

Fields are usually few (unlike teams), so a horizontal chip strip is friendlier than a `<select>` and keeps the location and count lines visible.

The field `<button>` at line ~98 opens with a template literal whose first token is `w-full`:

```tsx
              className={`w-full text-left px-3 py-2.5 rounded-lg border text-sm transition ${
```

Change that first token so the chips size to their content on mobile and still fill the sidebar on desktop:

```tsx
              className={`w-auto shrink-0 whitespace-nowrap sm:w-full sm:whitespace-normal text-left px-3 py-2.5 rounded-lg border text-sm transition ${
```

Leave the rest of the template literal, including the `isSelected` ternary, exactly as it is.

- [ ] **Step 3: Shrink the month cells on phones**

`min-h-[120px]` appears three times — leading blanks (`:176`), the day cell (`:203`), and trailing blanks (`:268`). Replace **all three** with:

```
min-h-[56px] sm:min-h-[120px]
```

```bash
grep -c "min-h-\[120px\]" src/components/FieldCalendarTab.tsx
```
Expected: 3 before the edit. Afterwards the same grep still returns 3, because the string now appears inside `sm:min-h-[120px]` — that is correct, not a failed edit.

- [ ] **Step 4: Make the per-day `+` reachable on touch**

At line ~221 the add button is `opacity-0 group-hover:opacity-100`. Touch screens have no hover, so it is unreachable on a phone — the same defect already fixed in the Schedule month grid. Change:

```tsx
                            : !readOnly && <button
                                onClick={() => openAdd(dateStr)}
                                className="opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center rounded-full text-[var(--fd-primary)] hover:bg-[#eeeef6] transition text-base leading-none"
                                title="Add event at this field"
                              >+</button>
```

to:

```tsx
                            : !readOnly && <button
                                onClick={() => openAdd(dateStr)}
                                className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 w-9 h-9 sm:w-5 sm:h-5 shrink-0 flex items-center justify-center rounded-full text-[var(--fd-primary)] hover:bg-[#eeeef6] transition text-base leading-none"
                                title="Add event at this field"
                              >+</button>
```

- [ ] **Step 5: Replace chips with a count badge on phones**

At line ~235 the chip list opens with:

```tsx
                          <div className={`flex-1 ${gap}`}>
```

change to:

```tsx
                          <div className={`hidden sm:block flex-1 ${gap}`}>
```

Then, immediately after that `</div>` closes (and before the IIFE's closing `)`), add the mobile badge — and wrap the IIFE's return in a fragment (`<>…</>`) so it can hold both children:

```tsx
                          {/* Phones: a count, not chips. Seven columns across
                              390px leaves ~50px per cell, where a chip is
                              unreadable and untappable. */}
                          {n > 0 && (
                            <span
                              className="sm:hidden mx-auto mb-1 flex items-center justify-center w-6 h-6 rounded-full bg-[var(--fd-primary)] text-white text-[11px] font-bold"
                              aria-label={`${n} event${n === 1 ? '' : 's'} on ${dateStr}`}
                            >
                              {n}
                            </span>
                          )}
```

`n` is already in scope — it is `events.length`, computed at the top of the same IIFE.

**Known limitation, deliberately shipped:** unlike the Schedule tab, the Field Calendar has no list/agenda view to jump to, so on a phone the badge shows *how many* events a day holds without a way to see *what* they are. The screen becomes readable and addable rather than fully usable. Making it agenda-first on mobile is the better answer and is recorded as a follow-up; it was not in the approved spec for this pass. Do **not** invent an agenda view here.

- [ ] **Step 6: Typecheck and build**

```bash
npx tsc --noEmit && npm run build
```
Expected: no errors, build succeeds.

- [ ] **Step 7: Commit**

```bash
git add src/components/FieldCalendarTab.tsx
git -c user.email=gmd4fy5yb4@privaterelay.appleid.com -c user.name="Gregory Amundson" \
  commit -m "Make Field Calendar usable on phones: stack, count badges, touch-reachable add"
```

---

## Task 5: Setup grids

**Files:**
- Modify: `src/components/SetupTab.tsx:163`, `:184`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing.

- [ ] **Step 1: Make both grids responsive**

Both lines read:

```tsx
        <div className="grid grid-cols-2 gap-4">
```

Change **both** to:

```tsx
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
```

```bash
grep -n "grid-cols-1 sm:grid-cols-2 gap-4" src/components/SetupTab.tsx
```
Expected: 2 hits after the edit.

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/components/SetupTab.tsx
git -c user.email=gmd4fy5yb4@privaterelay.appleid.com -c user.name="Gregory Amundson" \
  commit -m "Stack Setup form grids on phones"
```

---

## Task 6: Verification and merge

**Files:** none modified — this task gates the merge.

**Interfaces:**
- Consumes: every prior task.
- Produces: the work on `dev`, then `main`, deployed.

**On testing:** there is deliberately **no new test file**. Every change in this plan is presentation or a call to an existing handler; there is no new pure logic a unit test could hold. Inventing one to satisfy habit would be noise. The real gate is the browser pass in Step 2 — which is exactly the coverage the previous piece of work missed, having verified that the More tabs were *reachable* without checking that they were *usable*.

- [ ] **Step 1: Run the whole suite**

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
Expected: all six suites pass, no type errors, build succeeds. Paste the actual output — do not claim a pass you have not read.

- [ ] **Step 2: Browser pass at 390px, then 1280px**

```bash
pkill -f "next dev" || true
rm -rf .next
npm run dev
```
Run in the background, then drive a real browser. Preview tools fail under `~/Desktop` (`getcwd EPERM`). If a page 500s with `__webpack_modules__[moduleId] is not a function`, that is a stale `.next` cache — the `rm -rf .next` above prevents it.

At **390px**, signed in as an admin, check **every one of these five tabs** — for each: no horizontal page scroll, no clipped content, every control ≥44px:

1. **Schedule** — Agenda view shows the crimson FAB; tapping it opens `EventModal`; Export Excel / Export CSV / Clear All are all absent; Notify Coaches is present.
2. **Team Schedules** — the native team picker appears instead of the sidebar; choosing a team shows its detail below; the events table scrolls inside itself, not the page; `+ Add Event` is full-width and not clipped.
3. **Field Calendar** — the month grid fits seven columns without page overflow; days with events show a count badge; the `+` is visible without hovering.
4. **Setup** — the two form grids are single-column.
5. **Dashboard** — regression check; unchanged from before this work.

At **1280px**, confirm nothing changed: Team Schedules and Field Calendar are back to two columns with their sidebars, the Schedule toolbar shows Export Excel / Export CSV / Clear All, the month grids show chips with hover-only `+`, Setup is two-column, and there is no FAB anywhere.

- [ ] **Step 3: Confirm no stray or forbidden files**

```bash
git status --short
git diff --name-only dev..HEAD
```
Expected: `git status --short` empty. The changed-files list must contain **only** `ScheduleTab.tsx`, `TeamScheduleTab.tsx`, `FieldCalendarTab.tsx`, `SetupTab.tsx`. If `types.ts`, `linkedCalendars*`, `LinkedCalendarsTab.tsx` or `HANDOFF-shared-calendar.md` appear, stop.

- [ ] **Step 4: Standing auth check**

```sql
select email, confirmation_sent_at from auth.users order by created_at desc limit 3;
```
A non-null `confirmation_sent_at` on a recent row means Supabase's "Confirm email" got switched back on. It must stay **off**. Unrelated to this work, but it is the standing pre-deploy check and it has regressed twice.

- [ ] **Step 5: Merge into `dev` from the main checkout**

The main checkout is already on `dev` and stays there — do not switch branches in it.

```bash
cd /Users/gregoryamundson/Desktop/CLAUDE/fieldday-planner
git merge --no-ff mobile-gaps -m "Merge mobile-gaps: add-event FAB, More-tab layouts, toolbar"
```

- [ ] **Step 6: Merge `dev` → `main` via a temporary worktree**

Do **not** run `git checkout main` in the main checkout — it holds another session's uncommitted work, and switching branches there is what the project's conventions forbid.

```bash
git worktree add .worktrees/main-merge main
cd .worktrees/main-merge
git -c user.email=gmd4fy5yb4@privaterelay.appleid.com -c user.name="Gregory Amundson" \
  merge --no-ff dev -m "Merge dev: mobile gaps"
git diff --stat dev main
```
Expected: `git diff --stat dev main` prints **nothing**. If it prints anything, stop and reconcile before pushing.

```bash
git push origin main
cd /Users/gregoryamundson/Desktop/CLAUDE/fieldday-planner
git worktree remove .worktrees/main-merge
git push origin dev
```

- [ ] **Step 7: Confirm the deploy and smoke-test production**

```bash
curl -s -X POST -H 'Content-Type: application/json' -d '{}' \
  -w "\n%{http_code}\n" https://fielddayplanner.app/api/leagues/save
```
Expected: `401` with a JSON body. A `307` means an old build is still serving or `/api` got re-gated.

Then load fielddayplanner.app on a real phone, open Schedule, and confirm the FAB adds an event end-to-end.

- [ ] **Step 8: Clean up**

```bash
git worktree remove .worktrees/mobile-gaps
git branch -d mobile-gaps
```

---

## Deliberately not built

- **An agenda view for the Field Calendar.** The roadmap's original wording for this work was "agenda-first calendars", plural, and the Field Calendar is the one that did not get it. On a phone it now shows *how many* events a day holds but not *what* they are. This is the largest remaining weakness in the mobile admin experience and the first thing to pick up next.
- **The Schedule tab's filter block**, which still consumes ~200px before the first event on a phone. Cosmetic, not broken.
- **A `⋯` menu to keep exports reachable on mobile.** Considered and rejected as heavier than hiding them; revisit if a phone-only admin actually needs to export.
- **`CoachesTab`, `DivisionsTab`, `UmpiresTab`, `FieldsTab`** — already responsive (`md:` prefixes, `overflow-x-auto`, `grid-cols-1 sm:grid-cols-3`). An earlier survey in this session wrongly flagged `FieldsTab`; it needs no change.

# Trial bar + first-run checklist — design

**Date:** 2026-07-29 · **Phase 1, item 1** (findings 1 and 4)
**Source:** `HANDOFF-phase1-trial-conversion.md`, `~/Downloads/design_handoff_fieldday_review/Trial Onboarding Prototype.dc.html`

## Problem

Phase 0 (`fd_014`) deferred the trial clock to first schedule generation. That made the trial fairer and made it invisible: a new signup has `subscription_end = NULL`, and nothing in the UI mentions a trial at all. Two live accounts (`greg+test6@`, `greg+test7@`) are sitting in exactly that state.

## Scope

Read-only against existing data. No migration, no new columns, no new write path, no change to `isWritable()`.

## 1. `src/lib/trial.ts`

```ts
trialBanner(sub, now) → null | { kind: 'not_started' } | { kind: 'running', daysLeft: number }
```

Branch order matters:

| Condition | Result |
|---|---|
| `plan_tier !== 'trial'` | `null` — paid tiers, and the 4 `plan_tier='unlimited'` tester rows |
| `subscription_end` null | `not_started` |
| `subscription_end` in the future | `running`, `daysLeft = ceil((end − now) / 1 day)` |
| `subscription_end` in the past | `null` — the Phase 0 amber banner owns lapsed; no duplicate |

`subscription_end = NULL` means two things now (tester / unstarted trial), so the `plan_tier` check must come first or the four testers get told they are on a trial.

`now` is a parameter so the tests are deterministic.

**Test:** `src/lib/trial.test.ts`, assert-based, run with `npx tsx`. Covers all five branches plus the tester row.

## 2. `src/components/TrialBar.tsx`

A strip directly under `<header>`, above the expired banner. Copy from the prototype:

- **not started** — `FREE TRIAL · Full Pro access — your 14-day clock starts when you generate your first schedule` + `See plans` → `/pricing`
- **running** — `FREE TRIAL · Full Pro access · N days left` + `Keep my league — from $99/yr` → `/pricing`

Hidden for share-link viewers (`isViewer`). `page.tsx` already selects `subscription_end` for the `isWritable` check and discards it; it now keeps it in state next to `planTier`. Same query, no new fetch.

## 3. `src/components/FirstRunChecklist.tsx`

Rendered by `DashboardTab` above Week at a Glance. Visible only until step 4 completes, then gone — no dismiss control, no persisted flag.

| Step | Done when | Deep link (TABS index) |
|---|---|---|
| Set season dates & sport | `season.start && season.end` | Setup (1) |
| Add divisions & teams | some division with ≥ 2 teams | Divisions & Teams (2) |
| Add your fields | `fields.length ≥ 1` | Fields (3) |
| Generate your schedule | `schedule.generatedAt` | Auto-Schedule (8) |

Step 4's subtext is the conversion moment: *"Auto-schedule builds the whole season, conflict-free — and starts your 14-day trial."* Deep links go through the existing `onNavigate()` = `setTab`.

Hidden when `readOnly`.

**Test:** the step-derivation is a pure function (`checklistSteps(state)`) in the same file's lib, asserted alongside `trial.test.ts`.

## 4. Two header fixes (same region, decided in this session)

- Nav buttons: the browser focus ring renders as a full rounded box and beats the `border-b-2` active underline. `outline-none` + a `focus-visible:` ring restores the underline as the active indicator.
- `Auto-Schedule` (TABS index 8) moves from the `Setup` nav group to `Operate`. Groups are display-only — every `TABS` index and `onNavigate()` call is unchanged.

## Out of scope

Checklist dismissal, telemetry, the other three Phase 1 items, and the lapsed-state verification setup (tracked in the handoff).

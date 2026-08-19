# FieldDay Onboarding Tour + Help Docs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give a new FieldDay league admin a guided seven-step tour of the setup arc, a replayable `?` help button, and five reference pages — so the first two paying customers can onboard without a phone call.

**Architecture:** A pure `src/lib/tour.ts` holds step definitions keyed on **tab index** (FieldDay is one page with eleven tabs, not eleven routes). `page.tsx` already owns `tab` and `user`, so the tour is wired directly there — Prospect Card's `TourContext` and its route-race workaround are deliberately **not** ported. "Has this user been offered the tour" persists in a new `fd_user_tour` table; step position stays in React state.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Tailwind, Supabase JS. **No test framework** — FieldDay uses standalone assert scripts run with `npx tsx`. **No markdown renderer** — help pages are TSX.

**Spec:** `docs/superpowers/specs/2026-08-19-onboarding-tour-help-docs-design.md`

**Worktree:** `/Users/gregoryamundson/Desktop/CLAUDE/.worktrees/fd-onboarding`, branch `fd-onboarding`, based on `dev`. All paths below are relative to that worktree. Do **not** work in `~/Desktop/CLAUDE/fieldday-planner` — it has another session's uncommitted work.

## Global Constraints

- **Branch base is `dev`, not `main`.** FieldDay ships `dev` → `main`. Never commit to `main` directly.
- **Tests are assert scripts.** `import assert from 'node:assert'`, run with `npx tsx path/to/file.test.ts`. There is no Vitest, no Jest, no `describe`/`it`. Match `src/lib/trial.test.ts`.
- **No new npm dependencies.** Current deps are exactly: `@sentry/nextjs`, `@supabase/ssr`, `@supabase/supabase-js`, `next`, `react`, `react-dom`, `resend`, `server-only`, `stripe`, `xlsx`, `zod`. Adding to this list requires asking first.
- **Theme colours come from CSS vars, never hardcoded hex.** The six that exist: `--fd-primary`, `--fd-primary-dark`, `--fd-primary-light`, `--fd-primary-muted`, `--fd-accent`, `--fd-accent-hover`. A league picks its theme; hardcoding Prospect Card's `#14532d` breaks that.
- **Migration naming is a hard rule.** File `fd_015_user_tour.sql`; applied via MCP under the **same** string `fd_015_user_tour`. The Sports DB is shared with Prospect Card and AthleteCard — an unprefixed name collides. See `memory/migrations.md`.
- **Never run `supabase db push` or any Supabase CLI migration command.** Migrations are applied via the `supabase-sports` MCP `apply_migration` tool or pasted into the SQL editor.
- **Never run `vercel env pull`.** It dumps all secrets to disk.
- **Never commit `.env.local`.**
- **`git add` explicit paths only — never `git add -A`.** `node_modules` in this worktree is a **symlink**; `.gitignore` has `node_modules/` with a trailing slash, which ignores directories but not symlinks. A local `.git/info/exclude` entry currently disarms this, but explicit staging is the durable habit.
- **Verification uses Bash `run_in_background` + the Playwright MCP.** The `preview_*` tools always fail under `~/Desktop` (`getcwd EPERM`).

---

### Task 1: The pure tour engine

**Files:**
- Create: `src/lib/tour.ts`
- Test: `src/lib/tour.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `TourStepDef`, `TourState`, `TOUR_STEPS`, `TOTAL_STEPS`, `getActiveStep(state, tab)`, `advanceTour(state)`. Tasks 4 and 6 import from here.

There is deliberately no `isTourComplete()`. The complete state is already expressed by `getActiveStep` returning `null` on every tab, which is what the UI actually consumes; a second way to ask the same question is an export with no caller.

- [ ] **Step 1: Write the failing test**

Create `src/lib/tour.test.ts`:

```ts
// Standalone assert-based check (no framework). Run: npx tsx src/lib/tour.test.ts
import assert from 'node:assert'
import { getActiveStep, advanceTour, TOUR_STEPS, TOTAL_STEPS, type TourState } from './tour'

const fresh: TourState = { step: 1, dismissed: false }

// ── getActiveStep ────────────────────────────────────────────────────────────

// No state at all — the user has never started a tour.
assert.equal(getActiveStep(null, 0), null)

// Dismissed tours stay dismissed regardless of tab.
assert.equal(getActiveStep({ step: 3, dismissed: true }, 2), null)

// Step 1 lives on tab 0 (Dashboard) and resolves there.
assert.equal(getActiveStep(fresh, 0)?.selector, '[data-tour="checklist"]')

// Same step, wrong tab — the user navigated away. Step is suppressed, not lost:
// it resolves again when they come back. This is what makes the tour survive
// someone clicking around mid-tour.
assert.equal(getActiveStep(fresh, 5), null)
assert.equal(getActiveStep(fresh, 0)?.step, 1)

// The complete state (step === TOTAL_STEPS + 1) matches no def on any tab.
const done: TourState = { step: TOTAL_STEPS + 1, dismissed: false }
for (let tab = 0; tab <= 10; tab++) assert.equal(getActiveStep(done, tab), null)

// ── advanceTour ──────────────────────────────────────────────────────────────

assert.deepEqual(advanceTour(fresh), { step: 2, dismissed: false })

// Advancing off the last step lands exactly on the complete sentinel...
assert.deepEqual(
  advanceTour({ step: TOTAL_STEPS, dismissed: false }),
  { step: TOTAL_STEPS + 1, dismissed: false },
)
// ...and never runs past it, however many times it is called.
assert.deepEqual(advanceTour(done), done)
assert.deepEqual(advanceTour(advanceTour(done)), done)

// dismissed is carried through, not reset.
assert.equal(advanceTour({ step: 2, dismissed: true }).dismissed, true)

// ── TOUR_STEPS integrity ─────────────────────────────────────────────────────

assert.equal(TOTAL_STEPS, TOUR_STEPS.length)
assert.equal(TOTAL_STEPS, 7)

// Every step must point at a real tab. TABS in page.tsx has 11 entries (0–10);
// a step aimed at tab 11 would silently never render.
for (const s of TOUR_STEPS) {
  assert.ok(s.tab >= 0 && s.tab <= 10, `step ${s.step} has out-of-range tab ${s.tab}`)
  assert.ok(s.selector.startsWith('[data-tour='), `step ${s.step} selector must be a data-tour attr`)
  assert.ok(s.title.length > 0 && s.body.length > 0, `step ${s.step} missing copy`)
}

// step numbers are 1..N, in order, no gaps — getActiveStep's find() depends on it.
TOUR_STEPS.forEach((s, i) => assert.equal(s.step, i + 1, `step at index ${i} is numbered ${s.step}`))

// Step 5 is the trial-clock warning. fd_014 made schedule generation the billing
// trigger; if this sentence goes missing a customer gets surprise-billed.
assert.match(TOUR_STEPS[4].body, /14-day trial/)

console.log('tour.test.ts: all assertions passed')
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx src/lib/tour.test.ts`
Expected: FAIL — `Cannot find module './tour'`

- [ ] **Step 3: Write the implementation**

Create `src/lib/tour.ts`:

```ts
/**
 * Guided onboarding tour. Ported from Prospect Card (softball-recruiter), with the
 * one structural change that matters: FieldDay is a single page with eleven tabs,
 * not eleven routes, so steps key on a TABS index rather than a pathname.
 *
 * That difference is why there is no TourContext here. Prospect Card needs one to
 * survive router.push() losing a race with a queued React state update; FieldDay
 * never navigates, so page.tsx holds the state directly.
 */

export type AdvanceOn = 'next-button' | 'element-click'

export interface TourStepDef {
  step: number
  tab: number          // index into TABS in src/app/page.tsx
  selector: string     // [data-tour="..."]
  title: string
  body: string
  advanceOn: AdvanceOn
}

export interface TourState {
  step: number         // 1..TOTAL_STEPS active, TOTAL_STEPS + 1 = complete
  dismissed: boolean
}

/**
 * The same arc checklistSteps() teaches in trial.ts (tabs 1, 2, 3, 8), plus the two
 * things a static checklist cannot express: what the schedule grid is for, and how
 * to share it.
 *
 * Every step uses 'next-button'. 'element-click' is supported by the type and the
 * overlay, but no step uses it: clicking "Generate Schedule" or "Add Division"
 * mid-tour has real side effects on the customer's league.
 */
export const TOUR_STEPS: TourStepDef[] = [
  {
    step: 1, tab: 0, selector: '[data-tour="checklist"]',
    title: 'Your setup checklist',
    body: 'This tracks the four things standing between you and a finished schedule. It disappears on its own once they are done.',
    advanceOn: 'next-button',
  },
  {
    step: 2, tab: 1, selector: '[data-tour="league-name"]',
    title: 'Name your league',
    body: 'Give it the name coaches and parents will recognise, then set the season start and end dates just below.',
    advanceOn: 'next-button',
  },
  {
    step: 3, tab: 2, selector: '[data-tour="add-division"]',
    title: 'Add divisions and teams',
    body: 'Majors, Minors, T-Ball — whatever you call them. Each division needs at least two teams before it can be scheduled.',
    advanceOn: 'next-button',
  },
  {
    step: 4, tab: 3, selector: '[data-tour="add-field"]',
    title: 'Add your fields',
    body: 'Every place a game or practice can happen. Blackout dates live here too, so the scheduler knows when a field is unavailable.',
    advanceOn: 'next-button',
  },
  {
    step: 5, tab: 8, selector: '[data-tour="generate-schedule"]',
    title: 'Generate the season',
    body: 'This builds the whole season at once, conflict-free, and starts your 14-day trial. Nothing is charged — the clock simply begins here rather than at signup.',
    advanceOn: 'next-button',
  },
  {
    step: 6, tab: 5, selector: '[data-tour="schedule-grid"]',
    title: 'Adjust anything',
    body: 'Every game is editable after it is generated. Conflicts are flagged live, so you can move things without breaking the season.',
    advanceOn: 'next-button',
  },
  {
    step: 7, tab: 0, selector: '[data-tour="share-link"]',
    title: 'Share it',
    body: 'Copy the view-only link and send it to coaches and parents. They see the live schedule and never need an account.',
    advanceOn: 'next-button',
  },
]

export const TOTAL_STEPS = TOUR_STEPS.length

/**
 * The step to render right now, or null. Returns null when the user is on a
 * different tab — the step is suppressed rather than skipped, so it comes back
 * if they navigate back.
 */
export function getActiveStep(state: TourState | null, tab: number): TourStepDef | null {
  if (!state || state.dismissed) return null
  const def = TOUR_STEPS.find(s => s.step === state.step)
  if (!def) return null            // covers the complete sentinel
  if (def.tab !== tab) return null
  return def
}

/** Advance one step, clamping at the complete sentinel. */
export function advanceTour(state: TourState): TourState {
  if (state.step > TOTAL_STEPS) return state
  return { ...state, step: state.step + 1 }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx src/lib/tour.test.ts`
Expected: `tour.test.ts: all assertions passed`

- [ ] **Step 5: Commit**

```bash
git add src/lib/tour.ts src/lib/tour.test.ts
git commit -m "Add the pure tour engine, keyed on tab index"
```

---

### Task 2: The `fd_user_tour` migration

**Files:**
- Create: `src/db/migrations/fd_015_user_tour.sql`
- Create: `src/db/migrations/fd_015_user_tour.rollback.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: table `public.fd_user_tour (user_id uuid pk, seen_at timestamptz)`. Task 6 selects from and inserts into it.

There is no test file — this is DDL. Verification is the query in Step 4.

- [ ] **Step 1: Write the migration**

Create `src/db/migrations/fd_015_user_tour.sql`:

```sql
-- Migration fd_015: remember that a user has been offered the onboarding tour.
-- Run in the Supabase SQL editor for Alfred Digital Sports (actgfxrinoxlyrprzkoh),
-- or apply via MCP under the name "fd_015_user_tour".
--
-- Prefixed because the Sports DB is shared with Prospect Card and AthleteCard, and
-- each app runs its own migration counter. See memory/migrations.md.
--
-- Why its own table rather than a column on user_subscriptions: the Stripe webhook
-- (src/app/api/payments/webhook/route.ts lines 49 and 80) upserts that table with a
-- fixed column list. Any column outside that list is wiped on every checkout and
-- every renewal — so tour state would reset at the exact moment a trialling coach
-- becomes a paying customer, and the welcome modal would reappear. This table is
-- immune to that by construction.
--
-- Presence of a row is the whole signal: "this user has been offered the tour."
-- Step position is deliberately NOT stored — see the spec, section 2.

CREATE TABLE IF NOT EXISTS public.fd_user_tour (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  seen_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.fd_user_tour ENABLE ROW LEVEL SECURITY;

-- Owner-only. The row IS the user, so auth.uid() = user_id is a complete check —
-- unlike a shared resource, where the one auth.users pool across three Sports apps
-- means `to authenticated` proves nothing and an allowlist is required.
CREATE POLICY fd_user_tour_select_own ON public.fd_user_tour
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY fd_user_tour_insert_own ON public.fd_user_tour
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- No UPDATE and no DELETE policy on purpose: the row is written once and never
-- changes. Replaying the tour from the ? button does not touch this table.

INSERT INTO public._migrations (app_name, migration_name, applied_by, notes)
VALUES (
  'fieldday-planner',
  'fd_015_user_tour',
  'claude-code',
  'Onboarding tour: one row per user who has been offered the welcome modal.'
);
```

- [ ] **Step 2: Write the rollback**

Create `src/db/migrations/fd_015_user_tour.rollback.sql`:

```sql
-- Rollback for fd_015_user_tour. Reference only — not recorded in _migrations.
-- Dropping the table makes every user eligible for the welcome modal again.

DROP POLICY IF EXISTS fd_user_tour_insert_own ON public.fd_user_tour;
DROP POLICY IF EXISTS fd_user_tour_select_own ON public.fd_user_tour;
DROP TABLE IF EXISTS public.fd_user_tour;

DELETE FROM public._migrations
 WHERE app_name = 'fieldday-planner' AND migration_name = 'fd_015_user_tour';
```

- [ ] **Step 3: Apply it**

Use the `supabase-sports` MCP `apply_migration` tool. The `name` argument **must** be the string `fd_015_user_tour` — matching the filename. A file named `fd_015_…` applied as plain `015_…` defeats the prefix rule, because `supabase_migrations` is the one list where all three apps' migrations sit together.

Do **not** use `supabase db push` or any Supabase CLI migration command.

- [ ] **Step 4: Verify it landed**

Run via the `supabase-sports` MCP `execute_sql` tool:

```sql
select tablename, rowsecurity from pg_tables where tablename = 'fd_user_tour';
select policyname, cmd from pg_policies where tablename = 'fd_user_tour' order by policyname;
select name from supabase_migrations.schema_migrations order by version desc limit 3;
```

Expected: one table with `rowsecurity = true`; exactly two policies (`fd_user_tour_insert_own` / INSERT, `fd_user_tour_select_own` / SELECT); `fd_015_user_tour` at the top of the migrations list.

- [ ] **Step 5: Commit**

```bash
git add src/db/migrations/fd_015_user_tour.sql src/db/migrations/fd_015_user_tour.rollback.sql
git commit -m "Add fd_015_user_tour: per-user onboarding tour state"
```

---

### Task 3: `data-tour` attributes on the seven targets

**Files:**
- Modify: `src/components/FirstRunChecklist.tsx` — root `<section>`
- Modify: `src/components/SetupTab.tsx:156` — League Name input
- Modify: `src/components/DivisionsTab.tsx:193` — Add Division button
- Modify: `src/components/FieldsTab.tsx:82` — Add Field button
- Modify: `src/components/AutoScheduleTab.tsx:676` — Generate Schedule button
- Modify: `src/components/ScheduleTab.tsx:235` — grid container
- Modify: `src/app/page.tsx:641` and `:718` — share-link buttons

**Interfaces:**
- Consumes: the `selector` values in `TOUR_STEPS` from Task 1.
- Produces: seven DOM hooks. Task 4's overlay finds targets through these and renders nothing useful without them.

The repo currently has **zero** `data-tour` attributes. Line numbers are from the `dev` base commit `8d67725`; if they have drifted, find the element by the anchor text quoted in each step.

- [ ] **Step 1: Add `checklist`**

In `src/components/FirstRunChecklist.tsx`, the root element is `<section className="bg-white rounded-lg border border-gray-200 shadow-sm p-5 mb-6">`. Add the attribute:

```tsx
<section data-tour="checklist" className="bg-white rounded-lg border border-gray-200 shadow-sm p-5 mb-6">
```

Note this component `return null`s when every step is done. That is expected and handled by Task 4's fallback.

- [ ] **Step 2: Add `league-name`**

In `src/components/SetupTab.tsx`, find the input whose sibling label reads `League Name`:

```tsx
<input
  data-tour="league-name"
  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--fd-accent)]"
  value={season.leagueName}
  onChange={e => update('leagueName', e.target.value)}
/>
```

- [ ] **Step 3: Add `add-division`**

In `src/components/DivisionsTab.tsx`, the button with `onClick={addDivision}`:

```tsx
<button
  data-tour="add-division"
  onClick={addDivision}
```

- [ ] **Step 4: Add `add-field`**

In `src/components/FieldsTab.tsx`, the button with `onClick={addField}`:

```tsx
<button
  data-tour="add-field"
  onClick={addField}
  className="bg-[var(--fd-primary)] text-white px-4 py-2 rounded-lg text-sm hover:bg-[var(--fd-primary-dark)] transition"
>Add {sc.venueSingular}</button>
```

- [ ] **Step 5: Add `generate-schedule`**

In `src/components/AutoScheduleTab.tsx`, the button with `onClick={handleGenerate}`:

```tsx
<button
  data-tour="generate-schedule"
  onClick={handleGenerate}
  disabled={generating || !state.season.startDate || !state.season.endDate || state.fields.length === 0}
```

- [ ] **Step 6: Add `schedule-grid`**

In `src/components/ScheduleTab.tsx`, the top-level returned element:

```tsx
return (
  <div data-tour="schedule-grid" className="space-y-4">
```

- [ ] **Step 7: Add `share-link` to both copies**

`src/app/page.tsx` renders `copyReadOnlyLink` twice — a desktop button around line 641 and a mobile icon button around line 718. Add `data-tour="share-link"` to **both**. `findVisibleElement()` in Task 4 walks every match and picks the first with non-zero size, which resolves the right one per viewport automatically.

```tsx
<button
  data-tour="share-link"
  onClick={copyReadOnlyLink}
```

- [ ] **Step 8: Verify all seven exist**

Run:

```bash
grep -rn 'data-tour=' src --include='*.tsx' | grep -o 'data-tour="[a-z-]*"' | sort | uniq -c
```

Expected: seven lines, one per distinct name, with `share-link` showing a count of `2` and the other six showing `1`.

- [ ] **Step 9: Build, then commit**

```bash
npm run build
```
Expected: build succeeds.

```bash
git add src/components/FirstRunChecklist.tsx src/components/SetupTab.tsx src/components/DivisionsTab.tsx src/components/FieldsTab.tsx src/components/AutoScheduleTab.tsx src/components/ScheduleTab.tsx src/app/page.tsx
git commit -m "Add data-tour hooks for the seven onboarding tour targets"
```

---

### Task 4: `TourOverlay` — spotlight with an off-screen fallback

**Files:**
- Create: `src/components/TourOverlay.tsx`

**Interfaces:**
- Consumes: `TourStepDef` from `src/lib/tour.ts` (Task 1); the `data-tour` attributes from Task 3.
- Produces: `<TourOverlay step={TourStepDef} stepNumber={number} totalSteps={number} onNext={() => void} onDismiss={() => void} />`. Task 6 renders it.

- [ ] **Step 1: Write the component**

Create `src/components/TourOverlay.tsx`:

```tsx
'use client'
import { useEffect, useRef, useState } from 'react'
import type { TourStepDef } from '@/lib/tour'

interface Rect { top: number; left: number; width: number; height: number }

function findVisibleElement(selector: string): Element | null {
  const matches = document.querySelectorAll(selector)
  for (const el of Array.from(matches)) {
    const r = el.getBoundingClientRect()
    if (r.width > 0 && r.height > 0) return el
  }
  return null
}

interface TourOverlayProps {
  step: TourStepDef
  stepNumber: number
  totalSteps: number
  onNext: () => void
  onDismiss: () => void
}

const PAD = 8
const TOOLTIP_W = 280
const TOOLTIP_MARGIN = 12
const TOOLTIP_H_ESTIMATE = 150

export default function TourOverlay({
  step, stepNumber, totalSteps, onNext, onDismiss,
}: TourOverlayProps) {
  // null = still measuring, 'missing' = target genuinely not on screen.
  const [rect, setRect] = useState<Rect | null | 'missing'>(null)
  const onNextRef = useRef(onNext)
  useEffect(() => { onNextRef.current = onNext }, [onNext])

  useEffect(() => { setRect(null) }, [step.selector])

  useEffect(() => {
    let raf = 0
    function measure() {
      const el = findVisibleElement(step.selector)
      if (!el) return
      const r = el.getBoundingClientRect()
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height })
    }

    measure()

    // The target may not be painted yet on the frame a tab switch happens, so give
    // it one frame before declaring it missing. Without this the fallback would
    // fire on every step transition.
    raf = requestAnimationFrame(() => {
      if (!findVisibleElement(step.selector)) setRect('missing')
      else measure()
    })

    const el = findVisibleElement(step.selector)
    const ro = new ResizeObserver(measure)
    if (el) ro.observe(el)
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)

    let removeClick: (() => void) | null = null
    if (step.advanceOn === 'element-click' && el) {
      const handler = () => onNextRef.current()
      el.addEventListener('click', handler)
      removeClick = () => el.removeEventListener('click', handler)
    }

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
      removeClick?.()
    }
  }, [step.selector, step.advanceOn])

  if (rect === null) return null   // measuring

  // ── Fallback: target is genuinely off-screen ───────────────────────────────
  // On mobile the desktop tab bar is hidden and several tabs live behind
  // MobileNav's "More" sheet, so the target may not exist in the DOM at all.
  // Prospect Card's overlay renders nothing in that case, which makes the tour
  // silently vanish mid-run with no error and no recovery. A step that teaches
  // but does not point is strictly better than a dead tour.
  //
  // Also covers a returning user replaying the tour: step 1 targets
  // FirstRunChecklist, which return-nulls once all four steps are done.
  // Compare `rect` inline rather than through an `isMissing` boolean — narrowing a
  // union through an aliased condition is version-dependent, and this must compile.
  const hl = rect === 'missing' ? null : {
    top: rect.top - PAD,
    left: rect.left - PAD,
    width: rect.width + PAD * 2,
    height: rect.height + PAD * 2,
  }
  const isMissing = hl === null

  let tipTop: number
  let tipLeft: number
  if (hl) {
    tipLeft = Math.max(TOOLTIP_MARGIN, Math.min(hl.left, window.innerWidth - TOOLTIP_W - TOOLTIP_MARGIN))
    const below = hl.top + hl.height + TOOLTIP_MARGIN
    const above = hl.top - TOOLTIP_H_ESTIMATE - TOOLTIP_MARGIN
    tipTop = below + TOOLTIP_H_ESTIMATE > window.innerHeight ? above : below
  } else {
    tipLeft = Math.max(TOOLTIP_MARGIN, (window.innerWidth - TOOLTIP_W) / 2)
    tipTop = Math.max(TOOLTIP_MARGIN, (window.innerHeight - TOOLTIP_H_ESTIMATE) / 2)
  }

  // With no element to click, an element-click step can only advance via Next.
  const advanceOn = isMissing ? 'next-button' : step.advanceOn

  return (
    <>
      <div
        style={{
          position: 'fixed', inset: 0, zIndex: 9000,
          background: isMissing ? 'rgba(0,0,0,0.65)' : 'transparent',
          pointerEvents: advanceOn === 'element-click' ? 'none' : 'auto',
        }}
      />

      {hl && (
        <div
          style={{
            position: 'fixed',
            top: hl.top, left: hl.left, width: hl.width, height: hl.height,
            zIndex: 9001, borderRadius: 8, pointerEvents: 'none',
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.65)',
            outline: '2px solid var(--fd-accent)', outlineOffset: 1,
          }}
        />
      )}

      <div
        role="dialog"
        aria-live="polite"
        aria-label={`Tour step ${stepNumber} of ${totalSteps}: ${step.title}`}
        style={{
          position: 'fixed', top: tipTop, left: tipLeft,
          width: TOOLTIP_W, zIndex: 9002,
          background: '#fff', borderRadius: 12, padding: 16,
          boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
          border: '1px solid #e2e8f0',
        }}
      >
        <p style={{
          margin: '0 0 4px', fontSize: 10, fontWeight: 700,
          color: 'var(--fd-accent)', letterSpacing: '.1em', textTransform: 'uppercase',
        }}>
          Step {stepNumber} of {totalSteps}
        </p>
        <p style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 700, color: '#0f172a' }}>
          {step.title}
        </p>
        <p style={{ margin: '0 0 16px', fontSize: 13, color: '#64748b', lineHeight: 1.6 }}>
          {step.body}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button
            onClick={onDismiss}
            style={{
              fontSize: 12, color: '#94a3b8', background: 'none',
              border: 'none', cursor: 'pointer', padding: 0,
            }}
          >
            Skip tour
          </button>
          {advanceOn === 'next-button' ? (
            <button
              onClick={onNext}
              style={{
                padding: '8px 18px', background: 'var(--fd-primary)', color: '#fff',
                border: 'none', borderRadius: 7, fontSize: 12, fontWeight: 700,
                cursor: 'pointer', letterSpacing: '.04em',
              }}
            >
              {stepNumber === totalSteps ? 'DONE' : 'NEXT →'}
            </button>
          ) : (
            <span style={{ fontSize: 12, color: '#64748b', fontStyle: 'italic' }}>
              Tap the highlighted control ↑
            </span>
          )}
        </div>
      </div>
    </>
  )
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run build`
Expected: build succeeds. The component is not rendered by anything yet — Task 6 wires it.

- [ ] **Step 3: Commit**

```bash
git add src/components/TourOverlay.tsx
git commit -m "Add TourOverlay with a fallback for off-screen targets"
```

---

### Task 5: `TourWelcomeModal`

**Files:**
- Create: `src/components/TourWelcomeModal.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `<TourWelcomeModal onAccept={() => void} onDecline={() => void} />`. Task 6 renders it.

- [ ] **Step 1: Write the component**

Create `src/components/TourWelcomeModal.tsx`:

```tsx
'use client'
import { useEffect } from 'react'

interface TourWelcomeModalProps {
  onAccept: () => void
  onDecline: () => void
}

export default function TourWelcomeModal({ onAccept, onDecline }: TourWelcomeModalProps) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onDecline()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onDecline])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="tour-welcome-title"
      onClick={onDecline}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)',
        zIndex: 9000, display: 'flex', alignItems: 'center',
        justifyContent: 'center', padding: 24,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 16, padding: '40px 36px',
          maxWidth: 440, width: '100%',
          boxShadow: '0 24px 64px rgba(0,0,0,0.18)', textAlign: 'center',
        }}
      >
        <div style={{ fontSize: 40, marginBottom: 20 }} aria-hidden="true">🏟️</div>
        <h2
          id="tour-welcome-title"
          style={{ fontSize: 28, fontWeight: 700, color: '#0f172a', margin: '0 0 10px', letterSpacing: '-0.02em' }}
        >
          Want a quick tour?
        </h2>
        <p style={{ color: '#64748b', fontSize: 14, lineHeight: 1.7, margin: '0 0 28px' }}>
          We&rsquo;ll show you how to get your season on the field — about 2 minutes.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            type="button"
            onClick={onAccept}
            style={{
              width: '100%', padding: '13px 24px',
              background: 'var(--fd-primary)', color: '#fff', border: 'none',
              borderRadius: 9, fontSize: 14, fontWeight: 700,
              letterSpacing: '0.06em', cursor: 'pointer',
            }}
          >
            YES, SHOW ME
          </button>
          <button
            type="button"
            onClick={onDecline}
            style={{
              width: '100%', padding: '11px 24px',
              background: 'none', border: '1px solid #e2e8f0',
              borderRadius: 9, cursor: 'pointer',
              fontSize: 13, fontWeight: 600, color: '#64748b',
            }}
          >
            I&rsquo;ll explore on my own
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/components/TourWelcomeModal.tsx
git commit -m "Add the tour welcome modal"
```

---

### Task 6: Wire the tour into `page.tsx`

**Files:**
- Modify: `src/components/LeagueGate.tsx:17` (prop type), `:66` and `:80` (call sites)
- Modify: `src/app/page.tsx` — imports, state, auth effect (~line 253), `handleJoin` (line 397), render (~line 862)

**Interfaces:**
- Consumes: `getActiveStep`, `advanceTour`, `TOUR_STEPS`, `TOTAL_STEPS`, `TourState` (Task 1); `fd_user_tour` (Task 2); `TourOverlay` (Task 4); `TourWelcomeModal` (Task 5).
- Produces: a live tour. Task 7's `HelpButton` receives `onStartTour` from here.

- [ ] **Step 1: Teach `LeagueGate` to report create vs join**

Today `onJoin(code, state, userName)` is called identically from the create path (line 66) and the join path (line 80), so `page.tsx` cannot tell them apart. Add a fourth argument.

In `src/components/LeagueGate.tsx`, change the prop type at line 17:

```ts
  onJoin: (code: string, state: AppState, userName: string, created: boolean) => void
```

At line 66 (the create path, inside `handleCreate`):

```ts
      onJoin(result.code, initialState, name.trim(), true)
```

At line 80 (the join path):

```ts
      onJoin(code, result.data, name.trim(), false)
```

Rejected alternative: inferring "created" from an empty league. A co-admin invited before setup starts joins a genuinely empty league and would be misread as its creator, getting a tour of steps they cannot perform.

- [ ] **Step 2: Add imports and state to `page.tsx`**

Add to the imports:

```tsx
import TourOverlay from '@/components/TourOverlay'
import TourWelcomeModal from '@/components/TourWelcomeModal'
import { getActiveStep, advanceTour, TOUR_STEPS, TOTAL_STEPS, type TourState } from '@/lib/tour'
```

Add alongside the other `useState` calls near line 106:

```tsx
  // ponytail: the tour lives inline because page.tsx already owns `tab`, `setTab`
  // and `user`. A useTour() hook would need all three passed in and would return
  // four values — more indirection than the ~30 lines cost. Revisit if page.tsx
  // is ever split.
  const [tourState, setTourState] = useState<TourState | null>(null)
  const [showWelcome, setShowWelcome] = useState(false)
  const justCreatedRef = useRef(false)
```

- [ ] **Step 3: Record creation in `handleJoin`**

Change the signature at line 397 and set the ref:

```tsx
  function handleJoin(code: string, data: AppState, name: string, created: boolean) {
    justCreatedRef.current = created
    localStorage.setItem('sb-league-code', code)
    localStorage.setItem('sb-user-name', name)
    localUserRef.current = name
    const s = migrateState(data)
    setState(s)
    lastSyncedRef.current = stableStringify(s)
    setLeagueCode(code)
    setUserName(name)
    setHydrated(true)
  }
```

- [ ] **Step 4: Check `fd_user_tour` in the auth effect**

In the effect that already fetches `user_subscriptions` (around line 253), add a second query after `setSub(...)`:

```tsx
        // Offer the tour only to someone who just created a league. A coach who
        // joined with a code cannot perform most of the setup steps.
        const { data: tourRow } = await sb
          .from('fd_user_tour')
          .select('user_id')
          .eq('user_id', session.user.id)
          .maybeSingle()
        if (!tourRow && justCreatedRef.current) setShowWelcome(true)
```

Use `maybeSingle()`, not `single()` — `single()` errors when no row exists, which is the normal case here.

- [ ] **Step 5: Add the handlers**

Add near `handleJoin`:

```tsx
  /** Fire-and-forget: a failed write only means the modal may appear once more. */
  function markTourSeen() {
    const sb = getSupabase()
    sb.auth.getSession().then(({ data: { session } }) => {
      if (!session?.user) return
      sb.from('fd_user_tour').insert({ user_id: session.user.id }).then(() => {})
    })
  }

  function startTour() {
    setTourState({ step: 1, dismissed: false })
    setTab(TOUR_STEPS[0].tab)
  }

  function acceptTour() {
    setShowWelcome(false)
    markTourSeen()
    startTour()
  }

  function declineTour() {
    setShowWelcome(false)
    markTourSeen()          // declining still counts as "offered"
  }

  function advanceTourStep() {
    setTourState(current => {
      if (!current) return current
      const next = advanceTour(current)
      // Drive the app to the next step's tab so the user never has to find it.
      const nextDef = TOUR_STEPS.find(s => s.step === next.step)
      if (nextDef) setTab(nextDef.tab)
      return next
    })
  }

  function dismissTour() {
    setTourState(current => (current ? { ...current, dismissed: true } : current))
  }
```

- [ ] **Step 6: Render the tour**

Compute the active step next to the other derived values (near `const trial = trialBanner(sub)`):

```tsx
  const tourStep = getActiveStep(tourState, tab)
```

Render after the tab panel and before `<MobileNav ... />`:

```tsx
      {showWelcome && (
        <TourWelcomeModal onAccept={acceptTour} onDecline={declineTour} />
      )}
      {tourStep && (
        <TourOverlay
          step={tourStep}
          stepNumber={tourStep.step}
          totalSteps={TOTAL_STEPS}
          onNext={advanceTourStep}
          onDismiss={dismissTour}
        />
      )}
```

- [ ] **Step 7: Verify the engine still passes and the app builds**

```bash
npx tsx src/lib/tour.test.ts && npm run build
```
Expected: assertions pass, build succeeds.

- [ ] **Step 8: Commit**

```bash
git add src/app/page.tsx src/components/LeagueGate.tsx
git commit -m "Wire the onboarding tour into page.tsx"
```

---

### Task 7: `HelpButton`

**Files:**
- Create: `src/components/HelpButton.tsx`
- Modify: `src/app/page.tsx` — import and render

**Interfaces:**
- Consumes: `startTour` from Task 6.
- Produces: `<HelpButton onStartTour={() => void} hidden={boolean} />`.

- [ ] **Step 1: Write the component**

Create `src/components/HelpButton.tsx`:

```tsx
'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'

const HELP_LINKS = [
  { href: '/help/setting-up-your-season', label: 'Setting up your season' },
  { href: '/help/divisions-and-teams', label: 'Divisions & teams' },
  { href: '/help/fields-and-availability', label: 'Fields & availability' },
  { href: '/help/auto-scheduling', label: 'Auto-scheduling' },
  { href: '/help/sharing-with-coaches', label: 'Sharing with coaches' },
]

export default function HelpButton({
  onStartTour, hidden,
}: { onStartTour: () => void; hidden: boolean }) {
  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // Hide while a tour step is spotlighting something.
  if (hidden) return null

  return (
    // bottom-20 clears MobileNav's bottom bar; sm:bottom-6 drops back down once
    // the bar is gone.
    <div ref={panelRef} className="fixed bottom-20 right-4 sm:bottom-6 sm:right-6 z-[8000]">
      {open && (
        <div className="absolute bottom-14 right-0 w-60 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 text-[11px] font-bold text-gray-500 uppercase tracking-wider">
            Help
          </div>
          <button
            onClick={() => { setOpen(false); onStartTour() }}
            className="w-full px-4 py-3 text-left text-sm text-gray-900 hover:bg-gray-50 flex items-center gap-2.5 transition"
          >
            <span aria-hidden="true">▶</span> Take the tour
          </button>
          <div className="px-4 pt-2 pb-1 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
            Help docs
          </div>
          {HELP_LINKS.map(l => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className="block px-4 py-2 text-[13px] text-gray-700 hover:bg-gray-50 transition"
            >
              {l.label}
            </Link>
          ))}
          <div className="h-2" />
        </div>
      )}

      <button
        onClick={() => setOpen(o => !o)}
        aria-label="Help"
        aria-expanded={open}
        className="w-12 h-12 rounded-full bg-[var(--fd-primary)] text-white text-xl font-bold shadow-lg flex items-center justify-center hover:scale-105 transition"
      >
        ?
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Render it in `page.tsx`**

Add the import:

```tsx
import HelpButton from '@/components/HelpButton'
```

Render next to the tour overlay, after the `{tourStep && ...}` block. Hide it for share-link viewers, who have no setup to be guided through:

```tsx
      {!isViewer && <HelpButton onStartTour={startTour} hidden={tourStep !== null} />}
```

`startTour` already resets to step 1 and switches to that step's tab, so replaying works from any tab.

- [ ] **Step 3: Build and commit**

```bash
npm run build
```
Expected: build succeeds. The five `/help/*` links 404 until Task 8 — that is expected at this point and does not fail the build.

```bash
git add src/components/HelpButton.tsx src/app/page.tsx
git commit -m "Add the floating help button"
```

---

### Task 8: Help docs at `/help`

**Files:**
- Create: `src/app/help/HelpLayout.tsx`, `src/app/help/page.tsx`, and five article pages.

**Interfaces:**
- Consumes: the hrefs in `HELP_LINKS` from Task 7 — the five article routes must match exactly.
- Produces: six public routes.

TSX rather than markdown: FieldDay has no markdown renderer, and adding `react-markdown` + `remark-gfm` for five static pages fails the no-new-dependencies constraint. If `.md` is preferred, stop and re-scope this task.

Routes are public — a prospect following a link from a sales email should reach them, and none of it is confidential.

- [ ] **Step 1: Write the shared layout**

Create `src/app/help/HelpLayout.tsx`:

```tsx
import Link from 'next/link'

export default function HelpLayout({
  title, intro, children,
}: { title: string; intro: string; children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-5 py-10">
        <Link href="/help" className="text-sm text-gray-500 hover:text-gray-800 transition">
          ← All help topics
        </Link>
        <h1 className="mt-4 text-3xl font-bold text-gray-900">{title}</h1>
        <p className="mt-2 text-gray-600 leading-relaxed">{intro}</p>
        <div className="mt-8 space-y-6 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-gray-900 [&_p]:text-gray-700 [&_p]:leading-relaxed [&_li]:text-gray-700 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5">
          {children}
        </div>
        <div className="mt-12 pt-6 border-t border-gray-200 text-sm text-gray-500">
          Still stuck? Email <a className="text-[var(--fd-primary)] underline" href="mailto:greg@alfred-digital.com">greg@alfred-digital.com</a>.
        </div>
      </div>
    </main>
  )
}
```

- [ ] **Step 2: Write the index**

Create `src/app/help/page.tsx`:

```tsx
import Link from 'next/link'

export const metadata = { title: 'Help — FieldDay Planner' }

const TOPICS = [
  { href: '/help/setting-up-your-season', title: 'Setting up your season', blurb: 'Name your league, set the dates, pick your sport.' },
  { href: '/help/divisions-and-teams', title: 'Divisions & teams', blurb: 'How divisions work and why each needs at least two teams.' },
  { href: '/help/fields-and-availability', title: 'Fields & availability', blurb: 'Add fields, set blackout dates, control when play happens.' },
  { href: '/help/auto-scheduling', title: 'Auto-scheduling', blurb: 'How the scheduler builds a conflict-free season — and what starts your trial.' },
  { href: '/help/sharing-with-coaches', title: 'Sharing with coaches', blurb: 'View-only links, league codes, and what coaches can see.' },
]

export default function HelpIndex() {
  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-5 py-10">
        <h1 className="text-3xl font-bold text-gray-900">Help</h1>
        <p className="mt-2 text-gray-600">
          Everything you need to run a season. Most leagues are set up in under 30 minutes.
        </p>
        <ul className="mt-8 space-y-3">
          {TOPICS.map(t => (
            <li key={t.href}>
              <Link href={t.href} className="block bg-white rounded-lg border border-gray-200 p-4 hover:border-[var(--fd-accent)] transition">
                <span className="block font-semibold text-gray-900">{t.title}</span>
                <span className="block text-sm text-gray-600 mt-0.5">{t.blurb}</span>
              </Link>
            </li>
          ))}
        </ul>
        <p className="mt-8 text-sm text-gray-500">
          Prefer a walkthrough? Open the app and tap the <strong>?</strong> button in the bottom corner, then “Take the tour”.
        </p>
      </div>
    </main>
  )
}
```

- [ ] **Step 3: Write `auto-scheduling` (the load-bearing one)**

Create `src/app/help/auto-scheduling/page.tsx`:

```tsx
import HelpLayout from '../HelpLayout'

export const metadata = { title: 'Auto-scheduling — FieldDay Planner Help' }

export default function Page() {
  return (
    <HelpLayout
      title="Auto-scheduling"
      intro="Auto-Schedule builds your entire season in one pass — every division, every team, every field — without double-booking anything."
    >
      <h2>Before you generate</h2>
      <p>The generate button stays disabled until three things are true:</p>
      <ul>
        <li>Your season has a start date and an end date.</li>
        <li>At least one division has two or more teams. A division with one team has nobody to play.</li>
        <li>At least one field exists.</li>
      </ul>

      <h2>What it does</h2>
      <p>
        The scheduler builds a round-robin matchup list for each division, then finds the
        best available slot for every game based on your fields, your playing days and times,
        and any blackout dates you have set. It never places two games on the same field at
        the same time.
      </p>

      <h2>This starts your 14-day trial</h2>
      <p>
        Your trial clock begins the first time you generate a schedule — not when you sign up.
        That is deliberate: if you set your league up in the off-season, you should not burn
        the trial before you have seen the product do anything. Nothing is charged when the
        clock starts, and you keep full access for the whole fourteen days.
      </p>

      <h2>After it runs</h2>
      <p>
        Everything is editable. Open the Schedule tab and drag games to new slots — conflicts
        are flagged live as you move things, so you cannot accidentally break the season.
        Re-running Auto-Schedule replaces the generated schedule, so make manual edits after
        you are happy with the generated one.
      </p>
    </HelpLayout>
  )
}
```

- [ ] **Step 4: Write `setting-up-your-season`**

Create `src/app/help/setting-up-your-season/page.tsx`:

```tsx
import HelpLayout from '../HelpLayout'

export const metadata = { title: 'Setting up your season — FieldDay Planner Help' }

export default function Page() {
  return (
    <HelpLayout
      title="Setting up your season"
      intro="The Setup tab holds everything that describes your league: what it is called, when it runs, and what you play."
    >
      <h2>League name</h2>
      <p>
        This is what coaches and parents see at the top of every shared schedule. New leagues
        start out called “My League” — change it here, and the setup checklist ticks that step off.
      </p>

      <h2>Season dates</h2>
      <p>
        The start and end dates bound everything the scheduler is allowed to do. No game or
        practice will be placed outside them, so set them before you generate. You can widen
        the window later and re-generate.
      </p>

      <h2>Playing days and times</h2>
      <p>
        Tell FieldDay which days of the week you play and the time slots available on each.
        The scheduler only ever places games in these windows — this is the main lever for
        keeping weeknight games off a field your league cannot use on a Tuesday.
      </p>

      <h2>Sport and theme</h2>
      <p>
        Your sport changes the vocabulary throughout the app — “fields” become “courts” or
        “rinks”, “umpires” become “referees”. The theme sets the colours on your shared
        schedule. Both are cosmetic and safe to change at any time.
      </p>
    </HelpLayout>
  )
}
```

- [ ] **Step 5: Write `divisions-and-teams`**

Create `src/app/help/divisions-and-teams/page.tsx`:

```tsx
import HelpLayout from '../HelpLayout'

export const metadata = { title: 'Divisions & teams — FieldDay Planner Help' }

export default function Page() {
  return (
    <HelpLayout
      title="Divisions & teams"
      intro="A division is a group of teams that play each other. Most leagues split by age — 6U, 8U Minors, 10U Majors — but any grouping works."
    >
      <h2>Why two teams is the minimum</h2>
      <p>
        A division with one team in it has nobody to play, so the scheduler skips it entirely
        and the setup checklist does not count it as done. Add the second team and it starts
        scheduling immediately.
      </p>

      <h2>Teams</h2>
      <p>
        Add teams inside the division they belong to. Each team can carry a coach name and
        contact details, which is what the Coaches tab and the coach notification emails use.
      </p>

      <h2>Divisions never mix</h2>
      <p>
        The scheduler only ever pairs teams within the same division, so a 6U team will never
        be scheduled against a 12U team. If you want two age groups to play each other, put
        them in the same division.
      </p>

      <h2>How many you can have</h2>
      <p>
        Your plan sets the limits on divisions and teams. The Setup tab shows your current
        usage against those limits, and the app tells you before you hit one rather than after.
      </p>
    </HelpLayout>
  )
}
```

- [ ] **Step 6: Write `fields-and-availability`**

Create `src/app/help/fields-and-availability/page.tsx`:

```tsx
import HelpLayout from '../HelpLayout'

export const metadata = { title: 'Fields & availability — FieldDay Planner Help' }

export default function Page() {
  return (
    <HelpLayout
      title="Fields & availability"
      intro="Fields are the physical places a game or practice can happen. The scheduler treats each one as a resource that can only hold one event at a time."
    >
      <h2>Adding a field</h2>
      <p>
        Give it the name your league actually uses — “Diamond 2”, “North Field” — because that
        is the name coaches and parents will read on the shared schedule. An address is optional
        but powers the map link on the shared view.
      </p>

      <h2>Blackout dates</h2>
      <p>
        A blackout marks a date, or a range, when a field cannot be used: tournaments,
        maintenance, a school using the site. The scheduler routes around blackouts
        automatically, so you do not have to fix the schedule afterwards.
      </p>

      <h2>More fields means a tighter season</h2>
      <p>
        Fields are usually the binding constraint. If the scheduler cannot fit your season into
        the date range, the first thing to check is whether you have enough field time — either
        add a field, add playing days, or widen the season window.
      </p>

      <h2>The field calendar</h2>
      <p>
        Once a schedule exists, the Field Calendar tab shows one field at a time across the
        whole season. It is the fastest way to spot a field that is over- or under-used.
      </p>
    </HelpLayout>
  )
}
```

- [ ] **Step 7: Write `sharing-with-coaches`**

Create `src/app/help/sharing-with-coaches/page.tsx`:

```tsx
import HelpLayout from '../HelpLayout'

export const metadata = { title: 'Sharing with coaches — FieldDay Planner Help' }

export default function Page() {
  return (
    <HelpLayout
      title="Sharing with coaches"
      intro="Two different things can be shared, and they are not the same. Pick the wrong one and you either give away edit rights or send a link nobody can open."
    >
      <h2>The view-only link</h2>
      <p>
        This is what you send to coaches and parents. It opens the live schedule in any browser
        with no account, no password and no app. It updates automatically as you change things,
        so you never have to re-send it. Copy it with the link button in the header.
      </p>

      <h2>The league code</h2>
      <p>
        The league code is for co-administrators — someone who should be able to edit the
        schedule alongside you. Anyone with the code and an account can make changes, so treat
        it like a password and do not put it in a parent newsletter.
      </p>

      <h2>Coach notifications</h2>
      <p>
        If your teams have coach email addresses, the Coaches tab can email each coach their own
        team&rsquo;s schedule directly. Useful at the start of a season, and after any change big
        enough to be worth a message.
      </p>

      <h2>What viewers cannot see</h2>
      <p>
        View-only visitors get the schedule, standings and field information. They never see your
        setup tabs, your league code, your plan or your billing.
      </p>
    </HelpLayout>
  )
}
```

- [ ] **Step 8: Verify every route builds and every link resolves**

```bash
npm run build
```
Expected: build succeeds and the output lists all six `/help` routes.

```bash
grep -o "'/help/[a-z-]*'" src/components/HelpButton.tsx | tr -d "'" | sed 's|^|src/app|;s|$|/page.tsx|' | xargs ls
```
Expected: all five files listed, no `No such file` — this proves `HELP_LINKS` matches the routes that actually exist.

- [ ] **Step 9: Commit**

```bash
git add src/app/help
git commit -m "Add help docs at /help"
```

---

### Task 9: End-to-end verification

**Files:** none created or modified. This task proves the feature works and is the gate before merging.

**Interfaces:**
- Consumes: everything from Tasks 1–8.
- Produces: evidence.

`preview_*` tools always fail under `~/Desktop` (`getcwd EPERM`). Run the dev server with Bash `run_in_background` and drive the browser with the Playwright MCP.

- [ ] **Step 1: Static checks**

```bash
npx tsx src/lib/tour.test.ts && npm run build
```
Expected: assertions pass, build succeeds. **Do not proceed on a failure — fix it first.**

- [ ] **Step 2: Start the dev server**

Run `npm run dev` with Bash `run_in_background`. Confirm the port from its output (default 3000).

- [ ] **Step 3: Desktop happy path**

At 1280×800, sign in and create a **new** league.
- The welcome modal appears.
- "YES, SHOW ME" starts step 1 on the Dashboard, spotlighting the checklist.
- Next through all seven steps. Each switches tabs on its own: 0 → 1 → 2 → 3 → 8 → 5 → 0.
- Step 5's body contains the phrase "14-day trial".
- Step 7's button reads "DONE" rather than "NEXT →", and finishing removes the overlay.

- [ ] **Step 4: Replay**

Click `?` → "Take the tour". It restarts at step 1 on the Dashboard from whichever tab you were on.

- [ ] **Step 5: The mobile fallback — the step most likely to catch a real bug**

Resize to 390×844 and replay the tour. Confirm that any step whose target is not on screen renders a **centred tooltip on a dimmed backdrop** and still advances with Next. It must never render nothing — a blank screen with a stuck tour is the exact failure this fallback exists to prevent. Also confirm the `?` button sits above the bottom nav and covers no nav target.

- [ ] **Step 6: Persistence**

Reload mid-tour. The tour ends (expected — step position is not persisted) and the **welcome modal does not reappear**. `?` still replays.

- [ ] **Step 7: Join path gets no modal**

Sign in as a different user and **join** the league with its code. No welcome modal — the modal is for creators only. `?` is still available.

- [ ] **Step 8: Database state**

Via the `supabase-sports` MCP `execute_sql` tool:

```sql
select user_id, seen_at from public.fd_user_tour order by seen_at desc limit 5;
```
Expected: exactly one row per user who saw the modal, accepted or declined.

Then prove the wipe-on-payment bug that motivated the separate table cannot happen:

```sql
select count(*) from public.fd_user_tour;
update public.user_subscriptions set updated_at = now() where user_id = '<the test user id>';
select count(*) from public.fd_user_tour;
```
Expected: both counts identical. A write to `user_subscriptions` leaves tour state untouched.

- [ ] **Step 9: Stop the server and report**

Stop the background dev server. Report results honestly — if any step failed, say which and what the output was. Do not claim the feature works on the strength of the build passing.

- [ ] **Step 10: Final commit if anything changed**

```bash
git add <explicit paths>
git commit -m "Fix <what verification caught>"
```

---

## Not in this plan

Named so nobody has to guess whether they were forgotten:

- **Rewriting `FirstRunChecklist`.** Untouched except for one `data-tour` attribute. The tour complements it.
- **Tour analytics.** No tracking of where people drop off. Add it when there are enough customers for the answer to mean something.
- **Resume mid-tour.** Step position is not persisted. Add a `step int` column to `fd_user_tour` only if a customer asks.
- **Per-tier tours.** Prospect Card branches on `tier`; FieldDay has no equivalent concept.
- **Merging `dev` → `main`.** This branch merges to `dev`. Shipping is a separate, deliberate step.

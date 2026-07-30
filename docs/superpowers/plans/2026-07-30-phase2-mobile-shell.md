# Phase 2 Mobile Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Below 640px, FieldDay Planner gets a bottom tab bar, a one-row header, an agenda-first schedule, tappable call/directions actions, and a bottom-sheet event editor — without changing anything above 640px.

**Architecture:** The mobile shell is a projection of the existing app, not a second app. `page.tsx` keeps a single `tab: number` as the only navigation truth; the bottom bar calls `setTab` and a More sheet exposes every remaining tab. Almost every other change is a Tailwind responsive prefix, a default value, or a restyle of a component that already ships.

**Tech Stack:** Next.js App Router (client components), React 19, Tailwind CSS, TypeScript. No test framework — standalone assert files run with `npx tsx`. No new dependencies.

## Global Constraints

- **No new npm dependencies.** `lucide-react` is NOT installed. `src/components/Icon.tsx` is a hand-written 24×24 stroke-path map with an explicit `ponytail:` comment saying to add lucide only when the map passes ~25 icons. New glyphs go into that map.
- **Nothing above 640px may change.** Every mobile rule is `sm:`-guarded (Tailwind `sm` = 640px). Desktop regression is a task failure.
- **Do not touch these files** — another live session owns them in this checkout: `src/lib/linkedCalendars.ts`, `src/lib/linkedCalendars.test.ts`, `src/components/LinkedCalendarsTab.tsx`, `src/lib/types.ts`, `HANDOFF-shared-calendar.md`.
- **Do not modify the `TABS` array or add entries to `NAV_GROUPS`.** Both are contended with the linked-calendar session.
- **No database migration.** Every field needed (`coach.phone`, `field.address`, `field.geocoords`) already exists. `fd_014` remains the latest migration.
- **Commit author must be** `gmd4fy5yb4@privaterelay.appleid.com` — any other author silently blocks the Vercel deploy. Use `git -c user.email=gmd4fy5yb4@privaterelay.appleid.com -c user.name="Gregory Amundson" commit`.
- **Touch targets ≥44px** on every new mobile control.
- **All motion wrapped in `@media (prefers-reduced-motion: reduce)`** that reduces it to a no-op.
- **Colour contrast:** `themes.test.ts` only locks the theme palette. Any new hardcoded Tailwind colour must be checked by hand against WCAG AA (4.5:1 for text under 18px). Known trap: `emerald-600` on white is 3.77:1 (fails); `emerald-700` is 5.55:1 (passes).
- **Accent colour is `var(--fd-accent)` = `#cd163f`** (crimson). Primary is `var(--fd-primary)` = `#00013a` (navy).

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `src/lib/mobileNav.ts` | Create | The tab partition as pure data: which indices are bottom slots, which go in More, which a viewer may see. No React. |
| `src/lib/mobileNav.test.ts` | Create | Asserts the partition is total and the viewer filter holds. |
| `src/components/MobileNav.tsx` | Create | Bottom bar + sheet primitive + More sheet + kebab sheet. The only new component. |
| `src/components/Icon.tsx` | Modify | Add 5 glyphs: `home`, `calendar`, `chart`, `menu`, `dots`. |
| `src/app/page.tsx` | Modify | Hide desktop nav below `sm`, collapse header to one row, render `<MobileNav>`, pad `<main>`. |
| `src/components/TrialBar.tsx` | Modify | Compact single-row layout below `sm`. |
| `src/components/ScheduleTab.tsx` | Modify | Default to agenda on phones; agenda cards; month-grid count dots. |
| `src/components/DashboardTab.tsx` | Modify | Inline weather strip; 44px Call coach / Directions row. |
| `src/components/EventModal.tsx` | Modify | Bottom-sheet presentation below `sm`. |
| `src/app/globals.css` | Modify | `sheet-up`, `backdrop-in`, `view-in` keyframes + reduced-motion guard. |

---

## Task 0: Isolated workspace

**Files:** none committed — this task only creates the worktree.

**Interfaces:**
- Consumes: nothing.
- Produces: a working directory at `.worktrees/phase2-mobile-shell` on branch `phase2-mobile-shell`, branched from `dev`. Every later task runs inside it.

The main checkout is shared with another live session. Never switch branches there.

- [ ] **Step 1: Create the worktree from `dev`**

```bash
cd /Users/gregoryamundson/Desktop/CLAUDE/fieldday-planner
git worktree add .worktrees/phase2-mobile-shell -b phase2-mobile-shell dev
```

- [ ] **Step 2: Symlink `node_modules` and copy env**

A fresh `npm install` per worktree is slow and wastes disk. Symlink instead.

```bash
cd /Users/gregoryamundson/Desktop/CLAUDE/fieldday-planner/.worktrees/phase2-mobile-shell
ln -s ../../node_modules node_modules
cp ../../.env.local .env.local
```

- [ ] **Step 3: Exclude the symlink from git**

`.gitignore` contains `node_modules/` with a trailing slash, which matches directories only — a *symlink* named `node_modules` is not a directory, so `git add -A` would commit it. A later `git reset --hard` then follows it and guts the real `node_modules` in the main checkout. This has happened before.

```bash
echo 'node_modules' >> .git/info/exclude
echo '.env.local'   >> .git/info/exclude
```

Note: inside a worktree, `.git` is a *file* pointing at the real gitdir, but `.git/info/exclude` still resolves correctly through it. Verify with the next step.

- [ ] **Step 4: Verify the worktree is clean and the symlink is ignored**

```bash
git status --short
```
Expected: **no output at all.** If `node_modules` or `.env.local` appears, Step 3 did not take — fix before writing any code.

- [ ] **Step 5: Verify the toolchain runs here**

```bash
npx tsc --noEmit
```
Expected: no errors. (The LSP will report hundreds of phantom "Cannot find module" errors inside a worktree because of the symlink. They are not real. `npx tsc --noEmit` is the source of truth.)

No commit — this task produces no tracked files.

---

## Task 1: The tab partition (`mobileNav.ts`)

**Files:**
- Create: `src/lib/mobileNav.ts`
- Test: `src/lib/mobileNav.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `BOTTOM_TABS: readonly [0, 5, 9]` — the three content slots in the bottom bar (Today, Schedule, Standings). The fourth bar slot is More, which opens a sheet and is not a tab index.
  - `isTabVisible(index: number, isViewer: boolean): boolean` — the single definition of the viewer filter. A share-link viewer never sees Setup (1), Divisions & Teams (2), Fields (3), Officials (4) or Auto-Schedule (8).
  - `moreTabs(orderedIndices: number[], isViewer: boolean): number[]` — every visible index not already in `BOTTOM_TABS`, in the order given.

Why `moreTabs` takes the index list as a parameter rather than importing it: `TABS` is built inside `page.tsx` because its labels depend on `getSportConfig(state.season.sport)` (a "Field Calendar" for baseball is a "Court Calendar" for basketball). The lib stays label-free and React-free so it can be tested with `npx tsx`. Callers pass `NAV_GROUPS.flatMap(g => g.indices)`, which is already the de-facto tab registry — a tab missing from `NAV_GROUPS` is already invisible on desktop today.

- [ ] **Step 1: Write the failing test**

Create `src/lib/mobileNav.test.ts`:

```ts
/**
 * The one invariant the mobile shell can break: a tab that exists but is
 * unreachable on a phone. Four bottom slots plus a More sheet form a partition
 * of the tab list, and partitions silently lose members when someone adds a
 * twelfth tab and only thinks about desktop.
 */
import { BOTTOM_TABS, isTabVisible, moreTabs } from './mobileNav'

// Mirrors NAV_GROUPS in page.tsx: Overview, Operate, Setup.
const NAV_ORDER = [0, 8, 5, 6, 7, 9, 10, 1, 2, 3, 4]

let passed = 0
function assert(cond: boolean, msg: string) {
  if (!cond) { console.error(`FAIL: ${msg}`); process.exit(1) }
  passed++
}
function sameSet(a: number[], b: number[]) {
  return a.length === b.length && [...a].sort((x, y) => x - y).every((v, i) => v === [...b].sort((x, y) => x - y)[i])
}

// 1. Admin: every tab is reachable, exactly once.
const adminMore = moreTabs(NAV_ORDER, false)
const adminAll = [...BOTTOM_TABS, ...adminMore]
assert(sameSet(adminAll, NAV_ORDER), 'admin: bar + More must cover every tab in NAV_ORDER')
assert(new Set(adminAll).size === adminAll.length, 'admin: no tab may appear in both the bar and More')

// 2. Viewer: every viewer-visible tab is reachable, exactly once.
const viewerVisible = NAV_ORDER.filter(i => isTabVisible(i, true))
const viewerAll = [...BOTTOM_TABS, ...moreTabs(NAV_ORDER, true)]
assert(sameSet(viewerAll, viewerVisible), 'viewer: bar + More must cover every viewer-visible tab')
assert(new Set(viewerAll).size === viewerAll.length, 'viewer: no duplicates')

// 3. A viewer never reaches an admin-only tab.
const adminOnly = [1, 2, 3, 4, 8]
assert(viewerAll.every(i => !adminOnly.includes(i)), 'viewer: must never see Setup/Divisions/Fields/Officials/Auto-Schedule')

// 4. Every bottom slot is visible to a viewer — the bar has no dead buttons on a share link.
assert(BOTTOM_TABS.every(i => isTabVisible(i, true)), 'bottom bar tabs must all be viewer-visible')

// 5. More preserves the order it was given (Operate before Setup, as on desktop).
assert(adminMore[0] === 8, 'More must preserve NAV_ORDER ordering, not sort numerically')

console.log(`mobileNav: ${passed}/${passed} assertions passed`)
```

- [ ] **Step 2: Run it to confirm it fails**

```bash
npx tsx src/lib/mobileNav.test.ts
```
Expected: FAIL — `Cannot find module './mobileNav'`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/mobileNav.ts`:

```ts
/**
 * Mobile tab partition. `page.tsx` keeps a single `tab: number` as the only
 * navigation truth — there is no router — so the phone shell re-groups those
 * same indices rather than introducing a second route table. Deep links from
 * the first-run checklist (`onNavigate` → tabs 1, 2, 3, 8) therefore keep
 * working on a phone with no changes at all.
 *
 * Label-free and React-free on purpose: TABS labels depend on the season's
 * sport config, and this file has to run under `npx tsx`.
 */

/** Content slots in the bottom bar: Dashboard, Schedule, Standings. */
export const BOTTOM_TABS = [0, 5, 9] as const

/** Tabs a share-link viewer must never reach: one-time setup + schedule generation. */
const ADMIN_ONLY = [1, 2, 3, 4, 8]

/**
 * The single definition of the viewer filter, used by both the desktop nav and
 * the More sheet. Previously inlined in page.tsx's nav render.
 */
export function isTabVisible(index: number, isViewer: boolean): boolean {
  return !(isViewer && ADMIN_ONLY.includes(index))
}

/**
 * Everything the bottom bar does not already show. Caller passes the ordered
 * index list (`NAV_GROUPS.flatMap(g => g.indices)`) so More reads in the same
 * Operate-then-Setup order as the desktop nav.
 */
export function moreTabs(orderedIndices: number[], isViewer: boolean): number[] {
  return orderedIndices.filter(i => !BOTTOM_TABS.includes(i as 0 | 5 | 9) && isTabVisible(i, isViewer))
}
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
npx tsx src/lib/mobileNav.test.ts
```
Expected: `mobileNav: 9/9 assertions passed`

- [ ] **Step 5: Typecheck and commit**

```bash
npx tsc --noEmit
git add src/lib/mobileNav.ts src/lib/mobileNav.test.ts
git -c user.email=gmd4fy5yb4@privaterelay.appleid.com -c user.name="Gregory Amundson" \
  commit -m "Add mobile tab partition + reachability test"
```

---

## Task 2: Icon glyphs

**Files:**
- Modify: `src/components/Icon.tsx:14-25` (the `PATHS` map)

**Interfaces:**
- Consumes: nothing.
- Produces: `IconName` gains `'home' | 'calendar' | 'chart' | 'menu' | 'dots'`. Used by `MobileNav.tsx` in Task 3.

The prototype specifies Lucide icons. Lucide is not installed and `Icon.tsx` explicitly says not to install it until the map passes ~25 icons. Five hand-written paths keeps that promise; the map goes from 10 to 15.

- [ ] **Step 1: Add the five glyphs**

In `src/components/Icon.tsx`, inside the `PATHS` object, after the `alert:` entry (line 24), add:

```tsx
  home: <><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></>,
  // Standings read as a ranking, and a bar chart says "ranking" in one glyph
  // more clearly than a trophy does at 24px.
  chart: <><path d="M4 20V10" /><path d="M10 20V4" /><path d="M16 20v-6" /><path d="M22 20H2" /></>,
  menu: <><path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h16" /></>,
  dots: <><circle cx="12" cy="5" r="1.2" /><circle cx="12" cy="12" r="1.2" /><circle cx="12" cy="19" r="1.2" /></>,
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```
Expected: no errors. (`IconName` is `keyof typeof PATHS`, so the new names are typed automatically.)

- [ ] **Step 3: Commit**

```bash
git add src/components/Icon.tsx
git -c user.email=gmd4fy5yb4@privaterelay.appleid.com -c user.name="Gregory Amundson" \
  commit -m "Add home/calendar/chart/menu/dots glyphs to the icon map"
```

---

## Task 3: Motion keyframes

**Files:**
- Modify: `src/app/globals.css` (append after the `@layer components` block, which ends around line 28)

**Interfaces:**
- Consumes: nothing.
- Produces: CSS classes `.animate-sheet-up`, `.animate-backdrop-in`, `.animate-view-in`. Used by `MobileNav.tsx` (Task 4) and `EventModal.tsx` (Task 8).

- [ ] **Step 1: Append the keyframes**

Add to the end of `src/app/globals.css`:

```css
/* ── Mobile sheet motion (Phase 2) ─────────────────────────────────────────
   Timings from the Mobile Shell prototype. The sheet curve overshoots
   slightly, which is what makes a bottom sheet feel attached to the thumb
   rather than tweened into place. */
@keyframes sheet-up {
  from { transform: translateY(100%); }
  to   { transform: translateY(0); }
}
@keyframes backdrop-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}
@keyframes view-in {
  from { opacity: 0; transform: translateY(14px); }
  to   { opacity: 1; transform: translateY(0); }
}

.animate-sheet-up    { animation: sheet-up .3s cubic-bezier(.32, .72, .35, 1); }
.animate-backdrop-in { animation: backdrop-in .15s ease-out; }
.animate-view-in     { animation: view-in .2s ease-out; }

/* Vestibular safety: motion is decoration here, never the only signal that
   something opened. Dropping it to a single frame costs nothing. */
@media (prefers-reduced-motion: reduce) {
  .animate-sheet-up,
  .animate-backdrop-in,
  .animate-view-in {
    animation-duration: .01ms;
    animation-iteration-count: 1;
  }
}
```

- [ ] **Step 2: Verify the build still compiles the stylesheet**

```bash
npm run build
```
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/app/globals.css
git -c user.email=gmd4fy5yb4@privaterelay.appleid.com -c user.name="Gregory Amundson" \
  commit -m "Add sheet/backdrop/view keyframes with reduced-motion guard"
```

---

## Task 4: `MobileNav` component

**Files:**
- Create: `src/components/MobileNav.tsx`

**Interfaces:**
- Consumes: `BOTTOM_TABS`, `moreTabs` from `src/lib/mobileNav.ts` (Task 1); `Icon` with the new glyph names (Task 2); `.animate-sheet-up` / `.animate-backdrop-in` (Task 3).
- Produces: default export `MobileNav`, with this exact prop interface — Task 5 wires it up:

```ts
interface MobileNavProps {
  tab: number
  setTab: (i: number) => void
  tabLabels: string[]        // the TABS array from page.tsx
  navOrder: number[]         // NAV_GROUPS.flatMap(g => g.indices)
  isViewer: boolean
  leagueCode: string
  onCopyCode: () => void
  codeCopied: boolean
  syncStatus: 'idle' | 'saving' | 'synced' | 'error'
  canUndo: boolean
  onUndo: () => void
  onSnapshots: () => void
  onSignOut: () => void
  onLeave: () => void
  isSignedIn: boolean
  readOnly: boolean
  kebabOpen: boolean                      // owned by page.tsx: the header's ⋯ button sets it
  onKebabChange: (open: boolean) => void
}
```

One file holds the bar and both sheets because they share the sheet primitive and nothing else in the app consumes it. Extract it the day a third caller appears.

Sheet state is split deliberately: `MobileNav` owns the More sheet entirely, while the kebab sheet's open state lives in `page.tsx` because the button that opens it is in the header. That keeps exactly one mobile-only boolean in the 797-line page component instead of two, and the two sheets still can never stack — `kebabOpen` is forced false whenever More opens.

- [ ] **Step 1: Write the component**

Create `src/components/MobileNav.tsx`:

```tsx
'use client'
import { useEffect, useState } from 'react'
import Icon, { type IconName } from './Icon'
import { BOTTOM_TABS, moreTabs } from '@/lib/mobileNav'

interface MobileNavProps {
  tab: number
  setTab: (i: number) => void
  tabLabels: string[]
  navOrder: number[]
  isViewer: boolean
  leagueCode: string
  onCopyCode: () => void
  codeCopied: boolean
  syncStatus: 'idle' | 'saving' | 'synced' | 'error'
  canUndo: boolean
  onUndo: () => void
  onSnapshots: () => void
  onSignOut: () => void
  onLeave: () => void
  isSignedIn: boolean
  readOnly: boolean
  kebabOpen: boolean
  onKebabChange: (open: boolean) => void
}

/**
 * Bottom sheet primitive. Local to this file — the two sheets below are its
 * only consumers, and a shared component with one shape and two callers is
 * an abstraction that has not earned itself yet.
 */
function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  // Escape closes, and the body under the sheet must not scroll behind it.
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-end animate-backdrop-in sm:hidden"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full bg-white rounded-t-2xl max-h-[85vh] overflow-y-auto animate-sheet-up pb-[env(safe-area-inset-bottom)]"
        onClick={e => e.stopPropagation()}
      >
        {/* Grabber — the affordance that says "this drags", even though it doesn't yet.
            ponytail: visual only; add real drag-to-dismiss when someone asks. */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-gray-300" />
        </div>
        <div className="px-4 pb-2 flex items-center justify-between">
          <h2 className="text-base font-bold text-gray-900">{title}</h2>
          <button
            onClick={onClose}
            className="min-w-[44px] min-h-[44px] -mr-2 flex items-center justify-center text-sm font-medium text-gray-500 hover:text-gray-800"
          >
            Done
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

/** A full-width row in a sheet. 44px minimum, chevron for navigation rows. */
function SheetRow({ label, onClick, chevron = false, disabled = false }: {
  label: string; onClick: () => void; chevron?: boolean; disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full min-h-[52px] px-4 flex items-center justify-between text-left text-[15px] text-gray-800 border-t border-gray-100 active:bg-gray-50 disabled:opacity-40"
    >
      <span>{label}</span>
      {chevron && <span aria-hidden="true" className="text-gray-300 text-lg leading-none">›</span>}
    </button>
  )
}

const BAR_ICONS: Record<number, IconName> = { 0: 'home', 5: 'calendar', 9: 'chart' }
const BAR_LABELS: Record<number, string> = { 0: 'Today', 5: 'Schedule', 9: 'Standings' }

export default function MobileNav(props: MobileNavProps) {
  const {
    tab, setTab, tabLabels, navOrder, isViewer, leagueCode, onCopyCode, codeCopied,
    syncStatus, canUndo, onUndo, onSnapshots, onSignOut, onLeave, isSignedIn, readOnly,
    kebabOpen, onKebabChange,
  } = props

  // The More sheet's state lives here; the kebab's lives in page.tsx because the
  // header owns the ⋯ button. Deriving one `sheet` value from both is what keeps
  // them from ever stacking.
  const [moreOpen, setMoreOpen] = useState(false)
  const sheet: 'more' | 'kebab' | null = moreOpen ? 'more' : kebabOpen ? 'kebab' : null
  function setSheet(s: 'more' | 'kebab' | null) {
    setMoreOpen(s === 'more')
    onKebabChange(s === 'kebab')
  }

  const more = moreTabs(navOrder, isViewer)
  const moreActive = more.includes(tab)

  return (
    <>
      {/* ── Bottom bar ── */}
      <nav
        aria-label="Main"
        className="sm:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-gray-200 flex pb-[env(safe-area-inset-bottom)]"
      >
        {BOTTOM_TABS.map(i => {
          const active = tab === i
          return (
            <button
              key={i}
              onClick={() => { setTab(i); setSheet(null) }}
              aria-current={active ? 'page' : undefined}
              className={`flex-1 min-h-[56px] flex flex-col items-center justify-center gap-1 text-[11px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--fd-accent)] ${
                active ? 'text-[var(--fd-accent)]' : 'text-gray-500'
              }`}
            >
              <Icon name={BAR_ICONS[i]} className="w-6 h-6" />
              {BAR_LABELS[i]}
            </button>
          )
        })}
        <button
          onClick={() => setSheet(sheet === 'more' ? null : 'more')}
          aria-expanded={sheet === 'more'}
          aria-haspopup="dialog"
          className={`flex-1 min-h-[56px] flex flex-col items-center justify-center gap-1 text-[11px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--fd-accent)] ${
            sheet === 'more' || moreActive ? 'text-[var(--fd-accent)]' : 'text-gray-500'
          }`}
        >
          <Icon name="menu" className="w-6 h-6" />
          More
        </button>
      </nav>

      {/* ── More sheet: every tab the bar does not show ── */}
      {sheet === 'more' && (
        <Sheet title="More" onClose={() => setSheet(null)}>
          <div className="pb-4">
            {more.map(i => (
              <SheetRow
                key={i}
                label={tabLabels[i]}
                chevron
                onClick={() => { setTab(i); setSheet(null) }}
              />
            ))}

            {!isViewer && (
              <div className="border-t border-gray-100 mt-2 pt-4 px-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">League</span>
                  <button
                    onClick={onCopyCode}
                    className="min-h-[44px] flex items-center gap-2 font-mono font-bold tracking-widest text-gray-800"
                  >
                    {leagueCode}
                    <span className="font-sans text-xs font-medium text-[var(--fd-accent)] tracking-normal">
                      {codeCopied ? 'Copied' : 'Copy'}
                    </span>
                  </button>
                </div>
                {!readOnly && (
                  <p className="text-xs text-gray-400">
                    {syncStatus === 'saving' ? 'Saving…'
                      : syncStatus === 'error' ? 'Save failed — check connection'
                      : 'Synced'}
                  </p>
                )}
              </div>
            )}
          </div>
        </Sheet>
      )}

      {/* ── Kebab sheet: admin actions lifted out of the header ── */}
      {sheet === 'kebab' && (
        <Sheet title="Actions" onClose={() => setSheet(null)}>
          <div className="pb-4">
            {!readOnly && (
              <SheetRow label="Undo last change" disabled={!canUndo} onClick={() => { onUndo(); setSheet(null) }} />
            )}
            {!isViewer && (
              <SheetRow label="Snapshots" onClick={() => { onSnapshots(); setSheet(null) }} />
            )}
            {!readOnly && (
              <a
                href="/account"
                className="w-full min-h-[52px] px-4 flex items-center text-[15px] text-gray-800 border-t border-gray-100 active:bg-gray-50"
              >
                Account &amp; billing
              </a>
            )}
            {!isViewer && (
              <a
                href="https://www.getprospectcard.com"
                target="_blank"
                rel="noopener"
                className="w-full min-h-[52px] px-4 flex items-center text-[15px] text-gray-800 border-t border-gray-100 active:bg-gray-50"
              >
                Prospect Card ↗
              </a>
            )}
            {!readOnly && (
              <SheetRow
                label={isSignedIn ? 'Sign out' : 'Leave this league'}
                onClick={() => { isSignedIn ? onSignOut() : onLeave(); setSheet(null) }}
              />
            )}
          </div>
        </Sheet>
      )}
    </>
  )
}
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```
Expected: no errors. Nothing imports `MobileNav` yet, so this only proves the file compiles on its own.

- [ ] **Step 3: Commit**

```bash
git add src/components/MobileNav.tsx
git -c user.email=gmd4fy5yb4@privaterelay.appleid.com -c user.name="Gregory Amundson" \
  commit -m "Add MobileNav: bottom bar, More sheet, kebab sheet"
```

---

## Task 5: Wire the shell into `page.tsx`

**Files:**
- Modify: `src/app/page.tsx` — the nav block (`734-770`), `<main>` (`772`), the header (`538-673`), and the render tail (`786-795`)

**Interfaces:**
- Consumes: `MobileNav` (Task 4), `isTabVisible` (Task 1).
- Produces: a phone-navigable app. No exports change.

**Deliverable of this task:** at 390px the bottom bar works and every tab is reachable. The header is handled in the same task because a bottom bar under an unfixed six-control header is not shippable in either state.

- [ ] **Step 1: Add imports and the kebab state**

At the top of `src/app/page.tsx`, alongside the other component imports, add:

```tsx
import MobileNav from '@/components/MobileNav'
import { isTabVisible } from '@/lib/mobileNav'
```

Next to the other `useState` declarations near line 103 (`const [tab, setTab] = useState(0)`), add:

```tsx
  const [kebabOpen, setKebabOpen] = useState(false)
```

- [ ] **Step 2: Use the shared viewer filter in the desktop nav**

At line 738, replace:

```tsx
              const visible = group.indices.filter(i => !(isViewer && (i >= 1 && i <= 4 || i === 8)))
```

with:

```tsx
              const visible = group.indices.filter(i => isTabVisible(i, isViewer))
```

Same behaviour, one definition. The More sheet and the desktop nav can no longer disagree about what a viewer sees.

- [ ] **Step 3: Hide the desktop nav below 640px**

At line 734, change:

```tsx
      <div className="bg-white border-b shadow-sm sticky top-0 z-10">
```

to:

```tsx
      <div className="hidden sm:block bg-white border-b shadow-sm sticky top-0 z-10">
```

- [ ] **Step 4: Pad `<main>` so the fixed bar never covers content**

At line 772, change:

```tsx
      <main className="max-w-7xl mx-auto px-4 py-6">
```

to:

```tsx
      {/* pb-28: the fixed bottom bar is ~56px plus the home-indicator inset. */}
      <main className="max-w-7xl mx-auto px-4 py-6 pb-28 sm:pb-6">
```

- [ ] **Step 5: Collapse the header to one row on mobile**

In the header block, change the wrapper at line 539 from:

```tsx
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
```

to:

```tsx
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-4 sm:flex-wrap">
```

Then change the right-hand control cluster at line 554 from:

```tsx
          <div className="flex items-center gap-3 flex-wrap">
```

to:

```tsx
          <div className="hidden sm:flex items-center gap-3 flex-wrap">
```

That hides all six controls below 640px in one edit. Immediately after that `</div>` closes (line 663), add the mobile-only control row:

```tsx
          {/* Mobile: share + kebab only. Everything else moved into the
              MobileNav sheets — the desktop cluster wraps to three lines on a
              390px screen. */}
          <div className="flex sm:hidden items-center gap-1">
            {readOnly && (
              <span className="bg-yellow-400 text-yellow-900 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide">
                {expired ? 'Read Only' : 'View Only'}
              </span>
            )}
            {!isViewer && (
              <button
                onClick={copyReadOnlyLink}
                aria-label="Copy view-only link"
                className="w-11 h-11 flex items-center justify-center rounded-lg text-[var(--fd-primary-light)] hover:text-white transition"
              >
                <Icon name="link" className="w-5 h-5" />
              </button>
            )}
            <button
              onClick={() => setKebabOpen(true)}
              aria-label="More actions"
              aria-haspopup="dialog"
              className="w-11 h-11 flex items-center justify-center rounded-lg text-[var(--fd-primary-light)] hover:text-white transition"
            >
              <Icon name="dots" className="w-5 h-5" />
            </button>
          </div>
```

- [ ] **Step 6: Keep the league title from crowding those buttons**

The title at line 551 has no width constraint and a long league name will push the buttons off-screen. Change:

```tsx
            <h1 className="text-xl font-bold">{state.season.leagueName || 'FieldDay Planner'}</h1>
```

to:

```tsx
            <h1 className="text-xl font-bold truncate min-w-0">{state.season.leagueName || 'FieldDay Planner'}</h1>
```

And the unnamed-league prompt button at line 546, add `truncate min-w-0` to its className so it behaves the same:

```tsx
              className="text-xl font-bold text-white/90 border-b-2 border-dashed border-white/40 hover:text-white hover:border-white/70 transition truncate min-w-0"
```

- [ ] **Step 7: Render `MobileNav`**

Immediately before the closing `</div>` of the page (after the `showSnapshots` block, line 794), add:

```tsx
      <MobileNav
        tab={tab}
        setTab={setTab}
        tabLabels={TABS}
        navOrder={NAV_GROUPS.flatMap(g => g.indices)}
        isViewer={isViewer}
        leagueCode={leagueCode}
        onCopyCode={copyCode}
        codeCopied={codeCopied}
        syncStatus={syncStatus}
        canUndo={canUndo}
        onUndo={handleUndo}
        onSnapshots={() => setShowSnapshots(true)}
        onSignOut={handleSignOut}
        onLeave={handleLeave}
        isSignedIn={!!user}
        readOnly={readOnly}
        kebabOpen={kebabOpen}
        onKebabChange={setKebabOpen}
      />
```

- [ ] **Step 8: Typecheck**

```bash
npx tsc --noEmit
```
Expected: no errors. If `syncStatus` fails to match `'idle' | 'saving' | 'synced' | 'error'`, read its actual declaration in `page.tsx` and widen the prop type in `MobileNav.tsx` to match exactly — do not cast.

- [ ] **Step 9: Verify in a browser at 390px**

```bash
pkill -f "next dev" || true
npm run dev
```
Run that with `run_in_background: true`, then open `http://localhost:3000` and set the viewport to 390×844.

Preview tools do not work under `~/Desktop` (they fail with `getcwd EPERM`) — drive a real browser instead.

Check, signed in as `greg+test8@` (running trial clock) — never a `plan_tier='unlimited'` tester:
- Bottom bar shows Today / Schedule / Standings / More; the active one is crimson.
- Tapping each of the three switches content.
- More opens a sheet listing 8 rows (Auto-Schedule, Team Schedules, Field Calendar, Coaches, Setup, Divisions & Teams, Fields, Officials / Staff), plus the league code row.
- Tapping a More row switches the tab and closes the sheet.
- Escape and backdrop-tap both close the sheet.
- Header is one row: title, link button, kebab. Kebab opens the actions sheet.
- The last card on a long page is fully scrollable above the bar.
- Resize to 1024px: the desktop nav and the full header cluster are back, and no bottom bar.

- [ ] **Step 10: Verify the share-link viewer**

Open the view-only URL (`/?token=…&view=readonly`) at 390px. The More sheet must show exactly three rows — Team Schedules, Field Calendar, Coaches — and no league-code row.

- [ ] **Step 11: Commit**

```bash
git add src/app/page.tsx
git -c user.email=gmd4fy5yb4@privaterelay.appleid.com -c user.name="Gregory Amundson" \
  commit -m "Wire mobile shell: bottom bar, one-row header, kebab sheet"
```

---

## Task 6: Compact trial pill

**Files:**
- Modify: `src/components/TrialBar.tsx:16-33`

**Interfaces:**
- Consumes: nothing new.
- Produces: no API change — `TrialBar` keeps its single `banner: TrialBanner` prop.

The bar already renders in both correct places (under the header, and above `LeagueGate` for a brand-new signup with no league yet) and is already suppressed for viewers. This is styling only.

- [ ] **Step 1: Add the compact layout**

Replace the return block in `src/components/TrialBar.tsx` (lines 16-34) with:

```tsx
  // The full sentence is the desktop message; a 390px screen gets the pill,
  // the countdown, and the CTA on one line. Same component, same placement —
  // a phone-sized variant, not a second bar.
  const shortMessage =
    banner.kind === 'not_started'
      ? 'Starts at your first schedule'
      : `${banner.daysLeft} day${banner.daysLeft === 1 ? '' : 's'} left`

  return (
    <div className="bg-emerald-50 border-b border-emerald-200">
      <div className="max-w-7xl mx-auto px-4 py-2 flex items-center justify-between gap-3 sm:flex-wrap">
        <p className="text-sm text-emerald-900 flex items-center gap-2 min-w-0">
          {/* emerald-700, not -600: white on -600 is 3.77:1, under AA for 11px text. */}
          <span className="shrink-0 text-[11px] font-bold uppercase tracking-wide bg-emerald-700 text-white rounded-full px-2 py-0.5">
            Free Trial
          </span>
          <span className="hidden sm:inline">{message}</span>
          <span className="sm:hidden truncate">{shortMessage}</span>
        </p>
        <a
          href="/pricing"
          className="shrink-0 text-xs font-semibold text-emerald-900 border border-emerald-300 rounded-lg px-3 py-1.5 hover:bg-emerald-100 transition"
        >
          <span className="hidden sm:inline">
            {banner.kind === 'not_started' ? 'See plans' : 'Keep my league — from $99/yr'}
          </span>
          <span className="sm:hidden">{banner.kind === 'not_started' ? 'Plans' : 'Keep it'}</span>
        </a>
      </div>
    </div>
  )
```

- [ ] **Step 2: Typecheck and build**

```bash
npx tsc --noEmit && npx tsx src/lib/trial.test.ts
```
Expected: no type errors; trial tests still pass (they cover `trialBanner()`, which is untouched).

- [ ] **Step 3: Verify at 390px**

With the dev server running, confirm the trial bar is one line with no wrapping, at both `banner.kind` values. To see `not_started`, sign in as `greg+test6@` (unstarted trial, owns league `JMZQ3R`).

- [ ] **Step 4: Commit**

```bash
git add src/components/TrialBar.tsx
git -c user.email=gmd4fy5yb4@privaterelay.appleid.com -c user.name="Gregory Amundson" \
  commit -m "Compact trial bar layout on phones"
```

---

## Task 7: Agenda-first schedule

**Files:**
- Modify: `src/components/ScheduleTab.tsx:24` (view state), `:220-224` (segmented control), `:450-518` (list view)

**Interfaces:**
- Consumes: nothing new.
- Produces: no API change.

- [ ] **Step 1: Default to agenda on phones**

At line 24, replace:

```tsx
  const [view, setView] = useState<'calendar' | 'list' | 'day'>('calendar')
```

with:

```tsx
  // Agenda-first below 640px: a month grid on a 390px screen renders event
  // chips too small to read, let alone tap. Read once on mount rather than
  // through a live listener — rotating the phone should not throw away the
  // view the user just chose.
  const [view, setView] = useState<'calendar' | 'list' | 'day'>(
    () => (typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches ? 'list' : 'calendar')
  )
```

The lazy initializer matters: `useState(window.matchMedia(...))` would evaluate during server render and crash. The function form runs on the client only.

- [ ] **Step 2: Mobile segmented control**

Replace the segmented control block at lines 220-224 with:

```tsx
          <div className="flex rounded-lg border overflow-hidden text-sm">
            {/* Phones get two choices with mobile vocabulary; Day view is a
                desktop timeline and stays there. */}
            <button onClick={() => setView('list')} className={`sm:hidden min-h-[44px] px-4 transition ${view === 'list' ? 'bg-[var(--fd-primary)] text-white' : 'bg-white text-gray-600'}`}>Agenda</button>
            <button onClick={() => setView('calendar')} className={`sm:hidden min-h-[44px] px-4 border-l transition ${view === 'calendar' ? 'bg-[var(--fd-primary)] text-white' : 'bg-white text-gray-600'}`}>Month</button>
            <button onClick={() => setView('calendar')} className={`hidden sm:block px-3 py-1.5 transition ${view === 'calendar' ? 'bg-[var(--fd-primary)] text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>Calendar</button>
            <button onClick={() => setView('day')} className={`hidden sm:block px-3 py-1.5 border-l transition ${view === 'day' ? 'bg-[var(--fd-primary)] text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>Day</button>
            <button onClick={() => setView('list')} className={`hidden sm:block px-3 py-1.5 border-l transition ${view === 'list' ? 'bg-[var(--fd-primary)] text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>List</button>
          </div>
```

- [ ] **Step 3: Hide the table on phones and add agenda cards**

At line 453, change:

```tsx
            <div className="overflow-x-auto">
```

to:

```tsx
            <div className="hidden sm:block overflow-x-auto">
```

Then, immediately after the closing `</div>` of that block and before the `</div>` closing the white card (line 516), add the agenda list:

```tsx
            {/* ── Agenda (phones) ── */}
            <div className="sm:hidden">
              {allItems.length === 0 && (
                <p className="px-4 py-12 text-center text-gray-400 italic text-sm">
                  No events yet — switch to Month and tap any day to add one.
                </p>
              )}
              {(() => {
                // Group the already-sorted, already-filtered list by date. One
                // pass, no extra memo — allItems is at most a season's events.
                const groups: { date: string; items: typeof allItems }[] = []
                for (const item of allItems) {
                  const last = groups[groups.length - 1]
                  if (last && last.date === item.date) last.items.push(item)
                  else groups.push({ date: item.date, items: [item] })
                }
                return groups.map(g => (
                  <section key={g.date}>
                    <h3 className="sticky top-0 z-[1] bg-gray-50 border-y px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-gray-500">
                      {fmtDateShort(g.date)}
                    </h3>
                    {g.items.map(item => {
                      const isSpecial = item.type === 'special'
                      const c = isSpecial ? null : getDivisionColor((item as ScheduledGame | ScheduledPractice).divisionId, state.divisions)
                      const sp = item as ScheduledSpecialEvent
                      const title = isSpecial
                        ? sp.name
                        : item.type === 'game'
                          ? `${teamMap.get((item as ScheduledGame).homeTeamId)?.name ?? 'TBD'} vs ${teamMap.get((item as ScheduledGame).awayTeamId)?.name ?? 'TBD'}`
                          : `${teamMap.get((item as ScheduledPractice).teamId)?.name ?? 'TBD'} practice`
                      const where = isSpecial
                        ? (sp.location ?? '')
                        : (fieldMap.get((item as ScheduledGame | ScheduledPractice).fieldId)?.name ?? '')
                      return (
                        <button
                          key={item.id}
                          onClick={() => openEdit(item)}
                          className="w-full min-h-[64px] px-4 py-3 flex items-start gap-3 border-b last:border-0 text-left active:bg-gray-50"
                        >
                          <span className="w-16 shrink-0 text-sm font-semibold text-gray-800 pt-0.5">
                            {fmtTime(item.time)}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block font-medium text-gray-900 truncate">{title}</span>
                            <span className="block text-xs text-gray-500 truncate">
                              {where}
                              {item.type === 'game' && (item as ScheduledGame).result !== undefined && (
                                <> · {(item as ScheduledGame).result!.homeScore}–{(item as ScheduledGame).result!.awayScore}</>
                              )}
                            </span>
                          </span>
                          {c && (
                            <span className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded-lg font-medium ${c.pill}`}>
                              {divMap.get((item as ScheduledGame | ScheduledPractice).divisionId)?.name}
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </section>
                ))
              })()}
            </div>
```

Note the whole row is the tap target and it opens the same `openEdit` the desktop "Edit" link calls — one editor, one write path. For a read-only viewer `openEdit` already no-ops or opens a read-only modal exactly as it does on desktop; do not add a separate guard here.

- [ ] **Step 4: Typecheck**

```bash
npx tsc --noEmit
```
Expected: no errors. If `fmtDateShort`, `fmtTime`, `getDivisionColor`, `teamMap`, `fieldMap` or `divMap` are reported undefined, they are defined earlier in this same file — check you inserted inside the component body, not outside it.

- [ ] **Step 5: Verify at 390px**

- Schedule opens on Agenda by default.
- Events are grouped under sticky date headers, in date-then-time order.
- Tapping a row opens the event editor.
- Switching to Month and back preserves the choice.
- At 1024px the segmented control still reads Calendar / Day / List and the table renders unchanged.

- [ ] **Step 6: Commit**

```bash
git add src/components/ScheduleTab.tsx
git -c user.email=gmd4fy5yb4@privaterelay.appleid.com -c user.name="Gregory Amundson" \
  commit -m "Agenda-first schedule on phones"
```

---

## Task 8: Month-grid count dots

**Files:**
- Modify: `src/components/ScheduleTab.tsx:337` (leading blanks), `:353` (day cell), `:368-378` (date number + add button), `:388` (chip list), `:442` (trailing blanks)

**Interfaces:**
- Consumes: the `view`/`setView` state from Task 7.
- Produces: no API change.

The day cell's local variables are `day`, `dateStr`, `events` (from `visibleEventsByDate.get(dateStr) ?? []`), `isToday`, `isBlackout`. The add-event handler is `openAdd(dateStr)`; the date number currently calls `setSelectedDay(dateStr); setView('day')`.

- [ ] **Step 1: Shrink the cells on phones**

A 6-row grid of `min-h-[110px]` cells is 660px tall on a 390px screen. Replace `min-h-[110px]` with `min-h-[56px] sm:min-h-[110px]` in all three places it appears: line 337 (leading blanks), line 353 (day cell), line 442 (trailing blanks).

```bash
grep -n "min-h-\[110px\]" src/components/ScheduleTab.tsx
```
Expected: exactly 3 hits before the edit, 0 after.

- [ ] **Step 2: Send the date number to the agenda on phones**

Day view is desktop-only (Task 7 hid its button), so on a phone the date number must not switch to it. At line 369, replace:

```tsx
                      onClick={() => { setSelectedDay(dateStr); setView('day') }}
```

with:

```tsx
                      onClick={() => {
                        setSelectedDay(dateStr)
                        // Day view is a desktop timeline; on a phone the grid is
                        // a date picker and the agenda is the destination.
                        setView(window.matchMedia('(max-width: 639px)').matches ? 'list' : 'day')
                      }}
```

- [ ] **Step 3: Make the add button reachable on touch**

Line 377's `+` is `opacity-0 group-hover:opacity-100`. There is no hover on a touch screen, so today it is **unreachable on a phone** — and since this plan does not build the prototype's FAB, it would be the only way to add an event from the month grid. Make it always visible below `sm`:

```tsx
                      : !readOnly && <button onClick={() => openAdd(dateStr)} className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 w-7 h-7 sm:w-5 sm:h-5 flex items-center justify-center rounded-full text-[var(--fd-primary)] hover:bg-[#eeeef6] transition text-base leading-none" title="Add event">+</button>
```

This is why the FAB is skippable: the add affordance already exists, it was just hover-gated.

- [ ] **Step 4: Swap chips for a count dot**

At line 388, change:

```tsx
                      <div className={`flex-1 ${gap}`}>
```

to:

```tsx
                      <div className={`hidden sm:block flex-1 ${gap}`}>
```

Then, immediately after that block's `</div>` closes (line 430) and before the closing `)` of the IIFE, add the phone variant:

```tsx
                      {/* Phones: one dot with a count. A chip in a 390px/7-column
                          cell is ~50px wide — unreadable and untappable. */}
                      {n > 0 && (
                        <button
                          onClick={() => { setSelectedDay(dateStr); setView('list') }}
                          className="sm:hidden mx-auto mb-1 flex items-center justify-center w-6 h-6 rounded-full bg-[var(--fd-accent)] text-white text-[11px] font-bold"
                          aria-label={`${n} event${n === 1 ? '' : 's'} on ${dateStr}`}
                        >
                          {n}
                        </button>
                      )}
```

`n` is already in scope — it is `events.length`, computed at line 383. Because the IIFE returns a single element today, wrap its return in a fragment (`<>…</>`) so both children are legal.

- [ ] **Step 5: Add the caption from the prototype**

Below the grid's closing tag inside the `view === 'calendar'` block, add:

```tsx
          <p className="sm:hidden px-4 py-3 text-xs text-center text-gray-400">
            Tap a day to jump to it in the agenda — no tiny event chips.
          </p>
```

- [ ] **Step 6: Typecheck and verify**

```bash
npx tsc --noEmit
```

At 390px: the month grid fits without horizontal scroll, days with events show a crimson count dot, tapping the dot or the date number switches to Agenda, and the `+` is visible without hovering. At 1024px the grid is unchanged — chips visible, drag-and-drop still works, the `+` still appears only on hover, and the date number still opens Day view.

- [ ] **Step 7: Commit**

```bash
git add src/components/ScheduleTab.tsx
git -c user.email=gmd4fy5yb4@privaterelay.appleid.com -c user.name="Gregory Amundson" \
  commit -m "Month grid: count dots, touch-reachable add, tap-to-agenda"
```

---

## Task 9: Inline weather + call/directions

**Files:**
- Modify: `src/components/DashboardTab.tsx:120-154` (`WeatherCard`), `:423` (card wrapper), `:571-587` (after the coaches block)

**Interfaces:**
- Consumes: existing `DayWeather`, `weatherEmoji`, `weatherDesc` from `@/lib/weather`; existing `mapsUrl()` helper in this file.
- Produces: no API change. `WeatherCard` gains one optional prop.

`DashboardTab` is already "Week at a Glance," grouped by day with today first — it *is* the Today screen and does not need replacing.

- [ ] **Step 1: Give `WeatherCard` an inline variant**

Replace the `WeatherCard` signature and the final return in `src/components/DashboardTab.tsx` (lines 121, 136-153) so it renders a horizontal strip on phones. Change line 121 to:

```tsx
function WeatherCard({ data, loading, inline = false }: { data?: DayWeather; loading?: boolean; inline?: boolean }) {
```

And replace the non-loading return (lines 136-152) with:

```tsx
  if (inline) {
    // Phone variant: a 128px square beside a 390px card leaves ~240px for the
    // matchup. Same data, one row, inside the card instead of beside it.
    return (
      <div className="flex items-center gap-2 text-sm bg-sky-50 border border-sky-200 rounded-lg px-3 py-2">
        <span className="text-xl leading-none" role="img" aria-label={desc}>{weatherEmoji(data.weatherCode)}</span>
        <span className="font-bold text-gray-800">{data.tempHigh}°</span>
        <span className="text-gray-400">/ {data.tempLow}°</span>
        <span className="text-xs text-sky-700 truncate">{desc}</span>
        {isRainy && (
          <span className="ml-auto shrink-0 text-xs font-medium text-blue-700 flex items-center gap-1">
            <Icon name="droplet" className="w-3.5 h-3.5" />{data.precipChance}%
          </span>
        )}
      </div>
    )
  }
  return (
    <div className="w-32 flex-shrink-0 bg-gradient-to-b from-sky-50 to-blue-50 border border-sky-200 rounded-xl flex flex-col items-center justify-center gap-1.5 p-4 text-center shadow-sm">
      <span className="text-4xl leading-none" role="img" aria-label={desc}>
        {weatherEmoji(data.weatherCode)}
      </span>
      <p className="text-[11px] font-semibold text-sky-600 leading-tight">{desc}</p>
      <div className="mt-0.5">
        <p className="text-2xl font-bold text-gray-800 leading-none">{data.tempHigh}°</p>
        <p className="text-xs text-gray-400 mt-0.5">Low {data.tempLow}°</p>
      </div>
      {isRainy && (
        <p className="text-xs font-medium text-blue-600 flex items-center gap-1"><Icon name="droplet" className="w-3.5 h-3.5" />{data.precipChance}%</p>
      )}
      {isWindy && (
        <p className="text-xs text-gray-500 flex items-center gap-1"><Icon name="wind" className="w-3.5 h-3.5" />{data.windSpeed} mph</p>
      )}
    </div>
  )
```

`text-blue-700` in the inline variant rather than `-600`: `blue-600` on `sky-50` is 4.3:1, just under AA for 12px text; `blue-700` is 6.1:1.

- [ ] **Step 2: Hide the square on phones**

There are exactly two call sites — line 593 (game card) and line 674 (practice card), both siblings of the card inside a `flex items-stretch gap-3` wrapper:

```bash
grep -n "<WeatherCard" src/components/DashboardTab.tsx
```
Expected: 2 hits, both reading `<WeatherCard data={weatherByDate.get(date)} loading={weatherLoading} />`.

Wrap **both** in a hiding div — `WeatherCard`'s own root carries `w-32 flex-shrink-0`, so the class goes on a wrapper rather than being threaded through as another prop:

```tsx
                  <div className="hidden sm:flex">
                    <WeatherCard data={weatherByDate.get(date)} loading={weatherLoading} />
                  </div>
```

- [ ] **Step 3: Render the inline strip inside the game card body**

In the game card body (the `px-5 py-4 space-y-3.5` block starting at line 492), immediately after the teams matchup block closes (line 505), add:

```tsx
                          {/* Phone: weather folds into the card instead of
                              sitting beside it. `date` is the day group's key,
                              in scope from the enclosing map. */}
                          <div className="sm:hidden">
                            <WeatherCard data={weatherByDate.get(date)} inline />
                          </div>
```

Do the same inside the practice card's body, after its title row, so both card types match.

- [ ] **Step 4: Add the 44px action row**

After the coaches block closes (line 587), still inside the card body, add:

```tsx
                          {/* Phone: the two things a coach standing in a parking
                              lot actually needs. Each renders only when its data
                              exists — no dead buttons. */}
                          {(() => {
                            const headCoach = [...homeCoaches, ...awayCoaches].find(c => c.role === 'head' && c.phone)
                              ?? [...homeCoaches, ...awayCoaches].find(c => c.phone)
                            const directions = field?.geocoords
                              ? `https://www.google.com/maps/search/?api=1&query=${field.geocoords.lat},${field.geocoords.lon}`
                              : field?.address ? mapsUrl(field.address) : null
                            if (!headCoach && !directions) return null
                            return (
                              <div className="sm:hidden flex gap-2 pt-1">
                                {headCoach && (
                                  <a
                                    href={`tel:${headCoach.phone}`}
                                    className="flex-1 min-h-[44px] flex items-center justify-center rounded-lg border border-gray-300 text-sm font-semibold text-gray-700 active:bg-gray-50"
                                  >
                                    Call coach
                                  </a>
                                )}
                                {directions && (
                                  <a
                                    href={directions}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex-1 min-h-[44px] flex items-center justify-center rounded-lg bg-[var(--fd-primary)] text-sm font-semibold text-white active:opacity-90"
                                  >
                                    Directions
                                  </a>
                                )}
                              </div>
                            )
                          })()}
```

Geocoords are preferred over the address string because they are already cached on the field and are shared with view-only users — an address typo still routes correctly when coordinates exist.

- [ ] **Step 5: Typecheck**

```bash
npx tsc --noEmit
```
Expected: no errors. `Coach.phone` and `Field.geocoords` both exist in `types.ts` — do not modify that file, it belongs to the other session.

- [ ] **Step 6: Verify at 390px**

- Game cards show a one-row weather strip, not a square.
- Call coach and Directions are side by side, each ≥44px tall.
- A game whose field has no address and whose teams have no coach phone shows neither button and no empty row.
- At 1024px the square weather card and the original card layout are unchanged.

- [ ] **Step 7: Commit**

```bash
git add src/components/DashboardTab.tsx
git -c user.email=gmd4fy5yb4@privaterelay.appleid.com -c user.name="Gregory Amundson" \
  commit -m "Inline weather strip and call/directions actions on phones"
```

---

## Task 10: `EventModal` as a bottom sheet

**Files:**
- Modify: `src/components/EventModal.tsx:389-390` and `:487-488`

**Interfaces:**
- Consumes: `.animate-sheet-up`, `.animate-backdrop-in` (Task 3).
- Produces: no API change.

There are **two** modal shells in this file — a secondary/confirm dialog at 389 and the main editor at 487. Both get the same treatment, or the confirm dialog stays centered while its parent is a sheet.

- [ ] **Step 1: Convert the secondary dialog**

Replace lines 389-390:

```tsx
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>
```

with:

```tsx
      <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center p-0 animate-backdrop-in sm:items-center sm:p-4">
        <div className="bg-white rounded-t-2xl shadow-2xl w-full max-h-[92vh] flex flex-col animate-sheet-up sm:rounded-2xl sm:max-w-lg sm:animate-none" onClick={e => e.stopPropagation()}>
```

- [ ] **Step 2: Convert the main editor**

Replace lines 487-488:

```tsx
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
```

with:

```tsx
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center p-0 animate-backdrop-in sm:items-center sm:p-4" onClick={onClose}>
      <div className="bg-white rounded-t-2xl shadow-2xl w-full max-h-[92vh] overflow-y-auto animate-sheet-up sm:rounded-2xl sm:max-w-lg sm:animate-none" onClick={e => e.stopPropagation()}>
```

`sm:animate-none` matters: without it the desktop dialog would slide up from the bottom of the screen, which is wrong for a centered modal.

- [ ] **Step 3: Add the grabber to the main editor**

Immediately inside the main editor's inner `<div>` (after the line you just wrote at 488), add:

```tsx
        <div className="sm:hidden flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-gray-300" />
        </div>
```

- [ ] **Step 4: Make the primary action thumb-sized**

The main editor's footer is line 835:

```tsx
        <div className="flex items-center justify-between px-6 py-4 border-t bg-gray-50 rounded-b-2xl">
```

It holds "Delete event" (line 844) on the left and Cancel (849) / Save (851) on the right. `rounded-b-2xl` is wrong once the sheet is flush with the bottom of the screen, and the buttons are `py-2` — under 44px.

Replace line 835 with:

```tsx
        <div className="flex items-center justify-between px-6 py-4 border-t bg-gray-50 sm:rounded-b-2xl">
```

Then give the Save button (line 851-852, the one with `disabled={!canSave()}`) a phone-sized target by adding to its className:

```
min-h-[44px] px-5 sm:min-h-0
```

and the same `min-h-[44px] sm:min-h-0` to the Cancel button at line 849. Leave "Delete event" as a small text link — a destructive action does not want a thumb-sized target next to Save.

Apply the same `sm:rounded-b-2xl` change to the bulk-save dialog's footer at line 455.

- [ ] **Step 5: Typecheck and build**

```bash
npx tsc --noEmit && npm run build
```

- [ ] **Step 6: Verify at 390px**

- Tapping an agenda row slides the editor up from the bottom with a slight overshoot.
- The sheet is full-width, rounded only at the top, and the Save button is full-width.
- Backdrop tap closes it.
- With OS "Reduce Motion" on, it appears instantly and still works.
- At 1024px it is a centered rounded dialog with no slide animation.

- [ ] **Step 7: Commit**

```bash
git add src/components/EventModal.tsx
git -c user.email=gmd4fy5yb4@privaterelay.appleid.com -c user.name="Gregory Amundson" \
  commit -m "Present EventModal as a bottom sheet on phones"
```

---

## Task 11: Full verification and merge

**Files:** none modified — this task gates the merge.

**Interfaces:**
- Consumes: every prior task.
- Produces: the work on `dev`, then `main`, deployed.

- [ ] **Step 1: Run the whole suite in the worktree**

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
Expected: every test passes, no type errors, build succeeds. Paste the actual output — do not claim a pass you have not read.

- [ ] **Step 2: Desktop regression check at 1280px**

Load the app signed in as `greg+test8@` and confirm: the grouped tab nav renders with Overview / Operate / Setup, the header cluster shows all six controls, the schedule opens on Calendar with event chips, game cards show the square weather card, and the event modal is a centered dialog. **No bottom bar anywhere.**

- [ ] **Step 3: Confirm no stray files**

```bash
git status --short
```
Expected: no output. Specifically confirm none of `src/lib/linkedCalendars.ts`, `src/lib/linkedCalendars.test.ts`, `src/components/LinkedCalendarsTab.tsx`, `src/lib/types.ts`, `HANDOFF-shared-calendar.md` appear in `git log --stat phase2-mobile-shell ^dev`.

- [ ] **Step 4: Check the auth regression that has bitten twice**

```sql
select email, confirmation_sent_at from auth.users order by created_at desc limit 3;
```
A non-null `confirmation_sent_at` on a recent row means "Confirm email" got switched back on in Supabase. It must stay OFF. This is unrelated to the mobile work but is the standing pre-deploy check.

- [ ] **Step 5: Merge to `dev` from the main checkout**

```bash
cd /Users/gregoryamundson/Desktop/CLAUDE/fieldday-planner
git merge --no-ff phase2-mobile-shell -m "Merge phase2-mobile-shell: coach mobile shell"
```

Do not switch branches in the main checkout — it is on `dev` already and stays there.

- [ ] **Step 6: Merge `dev` → `main` and push**

`dev` → `main` is not a fast-forward; `main` carries its own merge commits.

```bash
git checkout main && git merge --no-ff dev -m "Merge dev: Phase 2 mobile shell"
git diff --stat dev main
```
Expected: `git diff --stat dev main` prints **nothing**. If it prints anything, stop and reconcile before pushing.

```bash
git push origin main
git checkout dev
```

- [ ] **Step 7: Confirm the deploy and smoke-test production**

Watch the Vercel deploy for `fieldday-planner` reach `success`. If it never starts, check the commit author — a non-relay author silently blocks it.

```bash
curl -s -X POST -H 'Content-Type: application/json' -d '{}' \
  -w "\n%{http_code}\n" https://fielddayplanner.app/api/leagues/save
```
Expected: `401` with a JSON body. A `307` means an old build is still serving or `/api` got re-gated.

Then load fielddayplanner.app on a real phone and walk the four bottom tabs.

- [ ] **Step 8: Clean up the worktree**

```bash
git worktree remove .worktrees/phase2-mobile-shell
git branch -d phase2-mobile-shell
```

---

## Carried forward, not done here

- **Phase 2 item 2** — purpose-built coach view-only page (LIVE badge, "My team" picker, navy next-game hero, "Powered by FieldDay" acquisition footer).
- **Phase 2 item 3** — standings tap-row detail and the a11y pass (real WAI-ARIA tablist with roving tabindex, `aria-pressed` confirm toggle, `?` disclosure, division initial badges).
- **Locked-edit toast** — deferred in Phase 0. The mobile shell changes the calculus: on a phone the amber expired banner scrolls away while disabled controls stay on screen. Revisit once the expired state has actually been verified on a device.
- **The expired banner and tier-aware upgrade copy remain unverified.** None of the 9 lapsed accounts owns a league. To see those states: take an unstarted trial, generate a schedule, then backdate `subscription_end`. The trial bar, expired banner and mobile trial pill share the header region — verify them in one pass.
- **FAB quick-add** and the prototype's standalone Edit sheet — `EventModal` covers both. Add when adding a game on a phone is demonstrably buried.

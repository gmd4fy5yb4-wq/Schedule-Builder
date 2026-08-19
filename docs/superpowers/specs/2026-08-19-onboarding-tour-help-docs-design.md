# Onboarding tour + help docs — design

**Date:** 2026-08-19 · **Pre-launch polish, item 1**
**Trigger:** first two paid licences about to be sold; FieldDay has no guided onboarding.
**Reference implementation:** `softball-recruiter` (Prospect Card) — `src/lib/tour-steps.ts`, `src/contexts/TourContext.tsx`, `src/components/TourOverlay.tsx`, `TourWelcomeModal.tsx`, `HelpButton.tsx`.

## Problem

A new FieldDay admin lands on an empty league with eleven tabs and no guidance. [`FirstRunChecklist`](../../../src/components/FirstRunChecklist.tsx) tells them *what* to do in four steps but never *where* — it links to a tab and stops. There is nothing that points at a control, nothing to replay once dismissed, and no reference material to link a paying customer to in a support email.

Prospect Card already solved this. This spec ports the solution, adapted to FieldDay's very different shape, and adds the help docs that Prospect Card stubs as "Coming soon".

## Scope

Additive. No change to `isWritable()`, the scheduler, or any existing write path. One new table, one migration, four new components, one new pure module, an index plus five content pages, and `data-tour` attributes on seven existing elements.

One existing signature changes: `LeagueGate`'s `onJoin` gains a `created: boolean` argument (§4). `FirstRunChecklist` is touched for a `data-tour` attribute only — its logic is unchanged, and the tour complements it rather than replacing it.

Out of scope: rewriting `FirstRunChecklist` (the tour complements it), tour analytics, per-tier tours (FieldDay has no tier concept the way Prospect Card does).

---

## 0. The structural difference that drives everything

Prospect Card is multi-route. Its steps carry `page: '/dashboard'`, matched with `pathname.startsWith()`, and `TourContext` exists to survive `router.push()` — hence the comment in `TourContext.tsx` about re-reading `localStorage` on every navigation, because a queued React state update can lose the race against a route change.

FieldDay is a single page. `src/app/page.tsx` holds `const [tab, setTab] = useState(0)` at line 106 and renders all eleven tabs from one switch at line 852. **There is no navigation, so there is no race, so there is no need for the context.**

| Prospect Card | FieldDay |
|---|---|
| `page: string` + `pathname.startsWith()` | `tab: number`, compared directly |
| `TourContext` provider in root layout | none — `page.tsx` already owns `tab` and `user` |
| `localStorage` re-sync on every route change | not needed |
| `ClientProviders.tsx` wrapper | not needed |

`TourContext.tsx` (110 lines) and `ClientProviders.tsx` (12 lines) are **not ported**.

---

## 1. `src/lib/tour.ts` — pure engine

No React. Mirrors the shape of `trial.ts`: data plus pure functions, fully testable in isolation.

```ts
export interface TourStepDef {
  step: number
  tab: number                              // TABS index in page.tsx
  selector: string                         // [data-tour="..."]
  title: string
  body: string
  advanceOn: 'next-button' | 'element-click'
}

export interface TourState { step: number; dismissed: boolean }

export function getActiveStep(state: TourState | null, tab: number): TourStepDef | null
export function advanceTour(state: TourState): TourState
export function isTourComplete(state: TourState | null): boolean
export const TOUR_STEPS: TourStepDef[]
export const TOTAL_STEPS: number
```

Behaviour, matching Prospect Card's semantics:

| Condition | `getActiveStep` |
|---|---|
| `state` null or `dismissed` | `null` |
| no step def matches `state.step` | `null` (covers the complete state, `step > TOTAL_STEPS`) |
| `def.tab !== tab` | `null` — user navigated away mid-step; the step resumes when they return |
| otherwise | the def |

`advanceTour` clamps at `TOTAL_STEPS + 1` (the complete state) and never runs past it.

`tab` is a parameter rather than read from anywhere, so the tests are deterministic — same reason `trialBanner` takes `now`.

**Test:** `src/lib/tour.test.ts`, assert-based, `npx tsx src/lib/tour.test.ts`. FieldDay has no Vitest — this matches `trial.test.ts`, `plans.test.ts`, `mobileNav.test.ts`. Covers: every branch of the table above, advancing off the end, the tab-mismatch resume, and that every step's `tab` is a valid `TABS` index.

---

## 2. `fd_015_user_tour` — persistence

`fd_014` is the highest FieldDay migration in `supabase_migrations.schema_migrations` (verified against the live Sports DB, 2026-08-19). Next is `fd_015`.

```sql
create table public.fd_user_tour (
  user_id uuid primary key references auth.users(id) on delete cascade,
  seen_at timestamptz not null default now()
);
alter table public.fd_user_tour enable row level security;
```

One row means "this user has already been offered the tour". Presence is the whole signal.

**Why a new table and not a column on `user_subscriptions`.** That row is already fetched on page load (`page.tsx:253`), so a column there would have cost zero extra queries. But `src/app/api/payments/webhook/route.ts` upserts that table with a fixed column list at lines 49 and 80. Any column absent from those lists is wiped on every checkout and every renewal — the tour state would reset at the exact moment a trialling coach becomes a paying customer, and the welcome modal would reappear. A separate table is immune by construction.

**Why the prefix.** `memory/migrations.md`, HARD RULE: every new Sports table is app-prefixed. The Sports DB is shared with Prospect Card and AthleteCard. The migration is applied via MCP under the name `fd_015_user_tour`, matching the filename, so `supabase_migrations` stays globally unique.

**RLS.** Owner-only, `auth.uid() = user_id`, for `select` and `insert`. No `update`, no `delete` — the row is written once and never changes.

The shared-`auth.users` hazard in `memory/migrations.md` does not bite here. That hazard is about treating *authentication* as *authorization* — an AthleteCard signup holding a valid session against FieldDay tables. This policy keys on `auth.uid() = user_id`, so the row **is** the user; a Prospect Card user can only ever reach their own row, which is correct and harmless. No allowlist needed. (Contrast `mkt_is_admin()`, which guards a shared resource and therefore does need one.)

**No `step` column, deliberately.** Persisting each advance means seven round-trips per tour and a resume path with its own edge cases. Step position lives in React state; a mid-tour reload simply ends the tour, and the `?` button replays it from the start. Add a `step int` later only if customers actually ask to resume.

**Reads/writes.** One `select` alongside the existing subscription fetch in the `page.tsx` auth effect. One `insert` when the welcome modal is answered — either button, since declining also counts as "offered". Fire-and-forget: a failed insert must not block the UI, it just means the modal may appear once more.

Rollback file `fd_015_user_tour.rollback.sql` drops the table. Reference-only, not recorded in `_migrations`.

---

## 3. `src/components/TourOverlay.tsx`

Ported from Prospect Card. The spotlight technique is sound and is kept as-is:

- `box-shadow: 0 0 0 9999px rgba(0,0,0,0.65)` on a rect-sized div — one element, no four-panel dimming maths.
- `ResizeObserver` + `scroll`/`resize` listeners re-measure the target.
- `onNextRef` keeps the native click listener pointed at the current `onNext` without re-binding.
- `pointerEvents: 'none'` on the dimmer for `element-click` steps so the target stays clickable.

Two changes:

**3a. FieldDay theming.** Prospect Card hardcodes `#14532d` / `#16a34a` and `'Oswald'`. FieldDay is multi-sport with a per-league theme (`buildThemeVars`, `src/lib/themes.ts`). The overlay uses `var(--fd-primary)`, `var(--fd-accent)`, `var(--fd-accent-hover)` so the tour matches whatever theme the league picked, and inherits the app font rather than naming one.

**3b. Off-screen target fallback — new.** `findVisibleElement()` returns `null` for a zero-size element and the component then returns `null`, rendering nothing. On desktop that is a safe guard. On FieldDay mobile it is a live failure: the desktop tab bar is `hidden sm:flex`, and `BOTTOM_TABS` puts only some tabs in the bottom bar with the rest behind MobileNav's "More" sheet. Several steps would target elements that are genuinely not on screen, and **the tour would silently disappear mid-run** with no error and no recovery.

Fix: if the target is not found after one `requestAnimationFrame` retry, render the tooltip **centred, with no spotlight and no cutout**. The step still teaches and still advances via Next; it just stops pointing. A degraded step beats a dead tour. `element-click` steps degrade to `next-button` in this mode, since there is no element to click.

---

## 4. `src/components/TourWelcomeModal.tsx`

Ported near-verbatim: `role="dialog"`, `aria-modal`, `aria-labelledby`, Escape and backdrop-click both decline. Restyled to FieldDay tokens; 🏟️ replaces 🥎; copy becomes "Want a quick tour? We'll show you how to get your season on the field — about 2 minutes."

**Trigger.** Fires once, on the first Dashboard render after **league creation**, not on every first login. `LeagueGate` has two paths (`create` and `join`); only `create` arms the modal. A coach who joined someone else's league with a code cannot perform most of the setup steps, so walking them through Setup and Divisions would be actively confusing.

Condition: `user` is signed in **and** no `fd_user_tour` row **and** this session created the league. Both buttons write the row.

**`LeagueGate` needs a one-argument change.** Today `onJoin(code, state, userName)` is called identically from the create path (`LeagueGate.tsx:66`) and the join path (line 80), so `page.tsx` cannot tell them apart. The signature becomes:

```ts
onJoin: (code: string, state: AppState, userName: string, created: boolean) => void
```

`true` at line 66, `false` at line 80, and `handleJoin` in `page.tsx` stores it. Two call sites, one handler, one prop type.

Rejected alternative: inferring "created" from an empty league (no divisions, no fields, no schedule). A genuinely empty league that someone *joined* — a co-admin invited before setup started, which is a normal way to onboard a second organiser — would false-positive and get the wrong tour. An explicit flag cannot be wrong.

---

## 5. `src/components/HelpButton.tsx`

Ported. Floating `?`, bottom-right, `z-index` below the overlay, hidden while a tour step is active. Restyled to FieldDay tokens.

The "Help docs — Coming soon" stub is replaced with real links to the five pages in §6. "Take the Tour" resets `TourState` to `{ step: 1, dismissed: false }` and calls `setTab(TOUR_STEPS[0].tab)` — the direct equivalent of Prospect Card's `router.push('/dashboard')`, and simpler because it is a state setter rather than a navigation.

Positioning: FieldDay has a bottom nav on mobile. The button sits above it (`bottom: 84px` under `sm`, `24px` at `sm` and up) so it never covers a nav target.

---

## 6. Help docs — `/help`

An index plus five articles, matching the tour arc:

| Route | Covers |
|---|---|
| `/help` | Index — links to all five, plus "Take the tour" |
| `/help/setting-up-your-season` | League name, dates, sport, theme |
| `/help/divisions-and-teams` | Divisions, teams, the two-team minimum |
| `/help/fields-and-availability` | Fields, blackout dates, time slots |
| `/help/auto-scheduling` | How the scheduler works, constraints, **and that generating starts the 14-day trial clock** |
| `/help/sharing-with-coaches` | View-only link, league code, coach view |

**Format — a deviation from the option chosen at design time, flagged for review.** The option picked was "markdown files in repo", previewed as `src/content/help/*.md`. FieldDay has **no markdown renderer** — its dependencies are `next`, `react`, `@supabase/*`, `resend`, `stripe`, `xlsx`, `zod`, `@sentry/nextjs`. Rendering `.md` means adding `react-markdown` + `remark-gfm`, and writing a markdown parser by hand is not a lazy option, it is a worse one.

The recommendation is therefore **plain TSX pages** sharing one `HelpLayout` component: same repo storage, same version control, same review-in-a-PR workflow, same deploy-to-edit tradeoff — and **zero new dependencies**. It also gets the existing `Icon` component and Tailwind classes for free, so the docs look like the app instead of like rendered markdown.

If you would rather have `.md` (easier to edit later without touching JSX), say so at spec review and the plan adds the two dependencies instead. Nothing else in this spec changes.

Public route — no auth. A prospective customer following a link from a sales email should reach it, and there is nothing confidential in it.

---

## 7. Tour content — seven steps

The tour and `FirstRunChecklist` must teach the same arc or they contradict each other. `checklistSteps()` in `trial.ts` uses tabs 1, 2, 3, 8; the tour follows that order and adds the two things the checklist cannot express.

| # | Tab | `data-tour` | Advance | Teaches |
|---|---|---|---|---|
| 1 | 0 Dashboard | `checklist` | next | "This tracks your setup and disappears when you're done" |
| 2 | 1 Setup | `league-name` | next | Name the league, set the season window |
| 3 | 2 Divisions & Teams | `add-division` | next | Majors/Minors, then teams — two per division minimum to schedule |
| 4 | 3 Fields | `add-field` | next | Where games happen; blackout dates live here too |
| 5 | 8 Auto-Schedule | `generate-schedule` | next | Builds the season conflict-free — **and starts the 14-day trial clock** |
| 6 | 5 Schedule | `schedule-grid` | next | Drag to adjust; conflicts flag live |
| 7 | 0 Dashboard | `share-link` | next | Coaches and parents see it live, no account needed |

Step 5's trial-clock warning is load-bearing. `fd_014` moved the billing trigger to first schedule generation; a paying customer surprised by that is a support email, and the fix is one sentence at the moment it matters.

All steps use `next-button`. Prospect Card's `element-click` mode is kept in the type and the overlay — it is 10 lines and the mobile fallback already handles it — but no FieldDay step uses it initially, because clicking "Generate Schedule" or "Add Division" mid-tour has real side effects on the user's league.

Advancing to a step whose `tab` differs from the current tab calls `setTab(def.tab)`, so the tour drives the app rather than asking the user to find the tab.

### `data-tour` attributes to add

Currently **zero** exist in the repo.

| Attribute | File |
|---|---|
| `checklist` | `src/components/FirstRunChecklist.tsx` — root `<section>` |
| `league-name` | `src/components/SetupTab.tsx` — league name input |
| `add-division` | `src/components/DivisionsTab.tsx` — Add Division button (~line 171) |
| `add-field` | `src/components/FieldsTab.tsx` — Add Field button (line 83) |
| `generate-schedule` | `src/components/AutoScheduleTab.tsx` — Generate Schedule button (line 650) |
| `schedule-grid` | `src/components/ScheduleTab.tsx` — grid container |
| `share-link` | `src/app/page.tsx` — `copyReadOnlyLink` button (line 641, desktop) |

Step 1 targets `FirstRunChecklist`, which **returns `null` once all four steps are done**. A returning admin replaying the tour from `?` would hit a missing target — handled by the §3b fallback, which is the second reason that fallback is required rather than nice-to-have.

`share-link` appears twice in `page.tsx` (line 641 desktop, line 718 mobile). Both get the attribute; `findVisibleElement()` already walks all matches and picks the first with non-zero size, which resolves it per viewport.

---

## 8. Wiring in `page.tsx`

Additions only:

```
const [tourState, setTourState] = useState<TourState | null>(null)
const [showWelcome, setShowWelcome] = useState(false)
const tourStep = getActiveStep(tourState, tab)
```

- The existing auth effect additionally selects from `fd_user_tour`; absence + league-just-created sets `showWelcome`.
- `advance()` calls `advanceTour`, and `setTab` when the next step's tab differs.
- Render `<TourWelcomeModal>`, `<TourOverlay>`, `<HelpButton>` after the existing content, before `<MobileNav>`.

`page.tsx` is 898 lines. This adds roughly 30. That is the wrong direction for a file already too big, but extracting a `useTour` hook that needs `tab`, `setTab`, `user` and `leagueJustCreated` passed in and returns four values is more indirection than the 30 lines cost. Noted as debt, marked with a `ponytail:` comment, revisit if `page.tsx` is split.

---

## 9. Files

**New (13)** — static routes, no `[slug]`, consistent with the TSX-pages recommendation in §6:
```
src/lib/tour.ts
src/lib/tour.test.ts
src/components/TourOverlay.tsx
src/components/TourWelcomeModal.tsx
src/components/HelpButton.tsx
src/app/help/page.tsx                              index
src/app/help/HelpLayout.tsx                        shared chrome
src/app/help/setting-up-your-season/page.tsx
src/app/help/divisions-and-teams/page.tsx
src/app/help/fields-and-availability/page.tsx
src/app/help/auto-scheduling/page.tsx
src/app/help/sharing-with-coaches/page.tsx
src/db/migrations/fd_015_user_tour.sql
src/db/migrations/fd_015_user_tour.rollback.sql
```
(14 lines above; `fd_015_user_tour.rollback.sql` is reference-only and not counted as a shipped file.)

If `.md` is chosen at spec review instead, these five article routes collapse into one `src/app/help/[slug]/page.tsx` plus `src/content/help/*.md`, and `react-markdown` + `remark-gfm` are added.

**Modified (8)** — `page.tsx` (wiring + `share-link`), `LeagueGate` (the `created` flag from §4), `FirstRunChecklist`, `SetupTab`, `DivisionsTab`, `FieldsTab`, `AutoScheduleTab`, `ScheduleTab`.

## 10. Verification

1. `npx tsx src/lib/tour.test.ts` — engine.
2. `npm run build` — types and build.
3. Dev server, desktop: create a league → modal → all seven steps → tab switching → `?` replays.
4. Dev server at 390px: confirm the §3b fallback renders centred rather than vanishing.
5. Reload mid-tour: tour ends, modal does **not** reappear, `?` still replays.
6. Supabase: confirm exactly one `fd_user_tour` row, and that it survives a simulated webhook upsert to `user_subscriptions`.

Per `memory/feedback_preview_verification.md`, `preview_*` tools fail under `~/Desktop`; the dev server runs via Bash `run_in_background` and browser checks go through the Playwright MCP.

## 11. Risks

| Risk | Mitigation |
|---|---|
| Tour silently dies on mobile | §3b fallback; explicit 390px verification step |
| Step 1 target absent for returning users | Same fallback; `FirstRunChecklist` self-hides when complete |
| Migration applied unprefixed | Applied via MCP as `fd_015_user_tour`, matching the filename |
| Tour state lost on payment | Root cause of the separate-table decision; §10 step 6 verifies it |
| `page.tsx` grows further | Accepted, `ponytail:` comment, revisit on split |
| Selectors rot as tabs are refactored | `tour.test.ts` asserts every step's `tab` is a valid index; a wrong *selector* is caught only by step 3 of §10 |

# Design — FieldDay Planner Phase 2, Item 2: Coach View-Only Page

**Date:** 2026-07-31
**Source:** `HANDOFF-phase2-coach-mobile.md`; `~/Downloads/design_handoff_fieldday_review/Coach View-Only Prototype.dc.html` (390px).
**Depends on:** Phase 2 item 1 (mobile shell), shipped 2026-07-31, `main` @ `2341127`.
**Scope:** Item 2 only. Item 3 (standings detail + a11y pass) is out of scope.

---

## Problem

The share link is the product's only viral surface — every coach and parent who taps it is a prospective league admin. Today it renders the admin shell with the buttons removed: six tabs including Field Calendar and Coaches, a league-code region, and navigation built for someone running a season. A parent opening a link from a group chat wants one thing: when and where does my kid play next.

## Decisions taken before design

1. **Full replacement.** When `isViewer`, render a purpose-built page instead of the admin shell. Viewers lose the Field Calendar and Coaches tabs — a deliberate trade for a surface that answers the one question parents have.
2. **Directions only; no Add to calendar.** Every other element on this page is a re-render of data the client already holds. Calendar export is the sole genuinely new capability, it has no code in the repo, the roadmap files it under Phase 4, and its behaviour varies across iOS and Android in ways this environment cannot verify. A silently broken "Add to calendar" on a parent's phone is worse than its absence.

---

## The seam

`src/app/page.tsx` already computes `isViewer = readOnly && !expired` — a share-link viewer, as distinct from an owner whose plan lapsed. The whole feature hangs off one early return, placed after the hydration, bad-token and no-league gates and before the admin shell:

```tsx
if (isViewer) return <CoachView … />
```

An expired owner is **not** a viewer: they keep the admin shell and the amber renew banner. That split predates this work and is preserved exactly.

**Consequence, accepted deliberately:** every `isViewer` guard remaining in the admin shell below that return is now unreachable. They are correct either way and cost nothing at runtime. Sweeping ~900 lines of `page.tsx` to delete them would risk regressions in a file two other tasks just edited, for no user-visible benefit. Left in place; noted here so the next reader knows it is a choice, not an oversight.

---

## Components

### `src/lib/coachView.ts` (new)

Pure, React-free, runnable under `npx tsx` — the same shape as `mobileNav.ts`.

- `teamOptions(state): { id, name, divisionId, divisionName }[]` — every team, flattened across divisions, for the picker.
- `isTeamEvent(event, teamId): boolean` — true when the team is the home side, the away side, or the practising team. Special events belong to no team and are never "yours".
- `nextGameFor(state, teamId, now): ScheduledGame | ScheduledPractice | null` — the soonest event strictly at or after `now` involving that team.
- `upcomingFor(state, teamId, now, limit): (ScheduledGame | ScheduledPractice)[]` — that team's next `limit` events after the next one, in order.

`now` is a parameter, never `Date.now()` read internally — that is what makes the logic testable without freezing the clock.

### `src/components/CoachView.tsx` (new)

The entire surface in one file: header, tab bar, three panels, footer, and a local team-picker modal. Props: `state`, `viewToken`, `lastUpdatedAt`.

- **Header** — league name, and a LIVE pill (green dot) replacing the current "View Only" badge. Below it the team pill: the picked team's name plus "change", or "Pick your team →" when none is set.
- **Tabs** — Next / Schedule / Standings. A fixed bottom bar below 640px, matching the pattern item 1 established, and a top strip at ≥640px. Local `useState`; no router, no involvement with `TABS`.
- **Footer** — on every tab: *"Powered by FieldDay Planner — run your own league free"*, linking to `/pricing`. `/pricing` is public and trial-first as of Phase 1; linking to `/` would bounce a signed-out coach to `/login`, which is a poor first impression for the one acquisition surface the product has.
- **Team picker** — a modal presented as a bottom sheet below 640px and centred above it, reusing the `animate-sheet-up` / `sm:animate-none` classes item 1 added to `globals.css`. Teams grouped by division, plus a "Show the whole league" row that clears the selection. Written locally rather than extracting `MobileNav`'s `Sheet`: that one is `sm:hidden` by design and this one must work at every width, so sharing it would mean adding a variant flag to satisfy two callers — a premature abstraction.

### `StandingsTab.tsx` (modified)

Gains one optional prop, `highlightTeamId?: string`, which visually marks that team's row. One standings implementation continues to serve both surfaces. No other change.

---

## Panels

**Next.** A navy hero for the picked team's next event: division chip, when, the matchup, the inline weather strip from item 1, the venue, and a 44px **Directions** button built from the field's `geocoords` with `address` as fallback — the same precedence item 1 proved, so an address typo still routes correctly. Below the hero, that team's following few events as a compact list.

**Schedule.** The whole league, grouped by day, with a `YOURS` tag on rows matching the picked team. It renders its own compact list rather than reusing `ScheduleTab`'s agenda: that component is ~900 lines of filters, exports and edit modals, and the coach list differs in every material way (YOURS tag, no tap-to-edit, no filters, no month toggle). Shared *logic* lives in `coachView.ts`; only presentation is separate. The duplication is presentational and bounded.

**Standings.** `StandingsTab` with `highlightTeamId`, plus the prototype's "Updated … · auto-refreshes" line driven by `lastUpdatedAt`.

## State and persistence

The picked team persists in `localStorage` under **`fd-coach-team:<viewToken>`**. Keyed by token deliberately: a parent with children in two leagues follows two different share links, and a bare key would make one league's choice clobber the other's. Read once on mount through a lazy `useState` initializer with a `typeof window` guard — a bare read would evaluate during server rendering and crash, the same trap item 1 hit in `ScheduleTab`.

No new fetching. `page.tsx` already polls every 30s for read-only sessions, which is what makes "LIVE" and "auto-refreshes" honest rather than decorative.

## Empty and edge states

- No team picked → hero replaced by a "Pick your team" prompt; Schedule shows the whole league with no YOURS tags; Standings highlights nothing.
- Team picked, no future events → "No upcoming games" card, with the team pill still offering a change.
- League with no events at all → empty-state copy on Next and Schedule.
- A team that was picked and has since been deleted from the league → treated as no selection, and the stale key is cleared.
- No results recorded → `StandingsTab`'s existing empty handling, unchanged.

## Testing

`src/lib/coachView.test.ts`, run with `npx tsx`, covering the logic that can actually be wrong:

1. `nextGameFor` returns the soonest event at or after `now`, never a past one.
2. It counts the team as home **or** away, and matches practices by `teamId`.
3. It ignores other teams' events, and returns `null` when the team has none.
4. `upcomingFor` returns events in chronological order and respects `limit`.
5. `isTeamEvent` returns false for special events, which belong to no team.

Presentation is verified in a browser at 390px and 1280px against a real share link, as in item 1.

## Constraints carried in

- **Shared checkout.** Another live session owns `src/lib/linkedCalendars.*`, `LinkedCalendarsTab.tsx`, `src/lib/types.ts` and `HANDOFF-shared-calendar.md`. Do not touch them; do not switch branches in the main checkout. Work in a worktree under `.worktrees/`, and merge to `main` via a temporary worktree rather than checking out `main` in the shared tree.
- **No new dependencies, no migration.** Every field needed already exists.
- **WCAG AA** 4.5:1 for text under 18px. `text-gray-400` (~2.5:1) fails; this recurred four times during item 1.
- **Touch targets ≥44px.**
- **Nothing above 640px may regress** for the admin shell.
- **Commit author must be** `gmd4fy5yb4@privaterelay.appleid.com` or Vercel silently blocks the deploy.

## Success criteria

A parent opens a share link on a phone, taps their team once, and sees when and where the next game is with a working Directions button — without ever meeting a league code, a setup tab, or an empty admin control. Every screen carries the line that tells them they could run their own league. The admin experience is untouched at every width.

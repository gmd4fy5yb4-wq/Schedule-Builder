/**
 * Tab partition for both shells. `page.tsx` keeps a single `tab: number` as the only
 * navigation truth — there is no router — so the phone shell re-groups those
 * same indices rather than introducing a second route table. Deep links from
 * the first-run checklist (`onNavigate` → tabs 1, 2, 3, 8) therefore keep
 * working on a phone with no changes at all.
 *
 * Label-free and React-free on purpose: TABS labels depend on the season's
 * sport config, and this file has to run under `npx tsx`.
 */

/**
 * Desktop nav clusters, as indices into TABS in page.tsx. Lives here rather
 * than in page.tsx so mobileNav.test.ts can assert against the real thing
 * instead of a hand-copied mirror that drifts.
 */
export const NAV_GROUPS: { label: string; indices: number[] }[] = [
  { label: 'Overview', indices: [0] },
  { label: 'Schedule', indices: [5, 8, 9] },
  { label: 'League', indices: [1, 2, 3, 4, 10] },
]

/** Flattened NAV_GROUPS order — the order the nav and the More sheet read in. */
export const NAV_ORDER = NAV_GROUPS.flatMap(g => g.indices)

/**
 * Retired indices: Team Schedules (6) and Field Calendar (7) are now views
 * inside Calendar (5), chosen by its own switcher. The holes stay rather than
 * renumbering, because 8/9/10 are hard-coded in tour.ts, BOTTOM_TABS and
 * ADMIN_ONLY — shifting them would silently retarget the onboarding tour.
 */
export const RETIRED_TABS = [6, 7] as const

/** Content slots in the bottom bar: Dashboard, Calendar, Standings. */
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

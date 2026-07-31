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

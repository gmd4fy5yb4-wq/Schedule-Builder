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

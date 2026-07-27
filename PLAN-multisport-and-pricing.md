# FieldDay Planner — Multi-Sport Leagues + Pricing Redesign Plan

**Date:** June 16, 2026
**Supersedes:** the 5-phase shared-calendar approach in `HANDOFF-shared-calendar.md`
**Core decision:** A league holds **multiple sports** sharing one field pool. No groups table, no cross-league conflict API, no field registry. Sport moves from a league-level string to a league-level `sports[]`, with per-division tagging available later.

Why this replaces the handoff: the codebase has **zero sport-specific scheduling logic** — `sport` only swaps display nouns (Field/Court, Game/Match, Umpire/Referee) via `getSportConfig`. So multi-sport is a labeling change, not an engine change. Baseball+softball share identical vocabulary, so for the real next-season customer the label sites need no work.

---

## Scope

**v1 (this plan, ~half a day):** baseball/softball little leagues. Multi-select sports at onboarding, fields shared, in-league conflict detection (already exists) covers shared facilities. Gate on **sports + divisions**.

**Deferred (not built here):**
- Per-division sport tagging UI + making the 16 `getSportConfig` sites division-aware (only needed when a customer mixes *different-vocabulary* sports, e.g. a school with basketball+soccer). v1 feeds those sites `sports[0]` — correct for baseball/softball.
- `adminsLimit` gate — no admin-identity records exist yet (collaborators are just code-holders). Column reserved, gate added when co-admin invites ship.
- Cross-*league* conflict detection (multi-campus districts). YAGNI until one signs.

---

## 🛑 YWWM8G Safety Guarantee (live softball org — never break)

Verified state (June 17, 2026): `season.sport='softball'`, no `sports` field, 5 divisions, 14 fields. Owner `695631aa` is `plan_tier='unlimited'` — **one of the 4 protected tester accounts.**

This refactor cannot harm them, by construction:

1. **Billing can't touch them.** Owner is on `unlimited` (999/999/999) and exempt from the trial clock. Any limit/tier change is a no-op for this account.
2. **Schema change is additive only.** `season.sport` is kept, `sports?` is added, reads go through `getSports()` which returns `['softball']` for their legacy blob. Their data renders identically with zero changes to the stored blob.
3. **No deploy rewrites the `leagues` table.** Migration 012 alters only `user_subscriptions` (additive columns w/ defaults). The league blob is never touched by migration or by read-time code.
4. **Snapshot restore stays valid forever.** The 37 `league_snapshots` are old-shape blobs; `getSports()` tolerates them, so recovery still works.
5. **`sports` is only ever written on an explicit multi-sport save** — which a softball-only org never performs.

**Pre-build:** capture a full backup of YWWM8G's `data` blob (beyond existing snapshots) before touching code.
**Pre-merge gate (dev → main):** load a copy of YWWM8G's real blob in dev → confirm it renders identically → save → diff the stored blob and assert it is **byte-identical except for any additive `sports` key**. Do not merge if their data changes in any other way.

---

## Tiers

Gate on **sports** (headline — what the buyer shops on). Guard on **divisions + teams** (silent — stop mega-division abuse, never advertised).

| Tier | Sports (headline) | Divisions (guard) | Teams (guard) | Annual | 3-mo pass |
|---|---|---|---|---|---|
| Trial | full Pro for 14 days, then read-only | — | — | $0 | — |
| Starter | 1 | 3 | 24 | $99/yr | $39 |
| Pro | 3 | 10 | 100 | $199/yr | $69 |
| Org | ∞ | ∞ | ∞ | $399/yr | $129 |

Lands: men's softball → Starter · little league (2 sports, 6 divisions) → Pro · school (8+ sports) → Org.

### Trial (no permanent free tier)

The prod `handle_new_user` trigger is missing today, so this is built fresh, not migrated.

- New org gets **full Pro-equivalent access for 14 days**.
- Clock starts on **first schedule generation** (the value moment), NOT signup — so off-season planners aren't burned by an expired trial before their season starts.
- On expiry → **read-only** (can view, can't edit). Data preserved as a re-conversion hook for next season. Not hard-locked.
- Inactive lapsed orgs auto-archive (cron) — resource backstop. **Deferred**, not v1.
- The 4 `plan_tier='unlimited'` tester accounts are **exempt from the trial clock** — never brick the real testers.

Mechanics: one `trial_started_at TIMESTAMPTZ` column (null until first schedule gen), one middleware check (`now > trial_started_at + 14d && tier === 'trial'` → read-only). Reuses the existing `/pricing` gate path.

---

## Phase 1 — `plans.ts` rewrite

`leaguesLimit → sportsLimit`, drop `teamsLimit`, keep `divisionsLimit`. `adminsLimit` reserved but unused in v1.

```typescript
export type PlanTier = 'trial' | 'starter' | 'pro' | 'org'

export interface PlanLimits {
  sportsLimit: number     // headline gate
  divisionsLimit: number  // silent guard
  teamsLimit: number      // silent guard — caps mega-division abuse
  adminsLimit: number     // reserved — not enforced in v1 (no admin records yet)
}

export interface Plan extends PlanLimits {
  tier: PlanTier
  name: string
  annualPriceUsd: number
  seasonPassPriceUsd: number
  stripePriceIdAnnual: string
  stripePriceIdSeason: string
}

export const PLANS: Plan[] = [
  // Trial = full Pro limits for 14 days (enforced by trial_started_at + middleware, not here).
  { tier: 'trial',   name: 'Free Trial', annualPriceUsd: 0,   seasonPassPriceUsd: 0,
    stripePriceIdAnnual: '', stripePriceIdSeason: '',
    sportsLimit: 3, divisionsLimit: 10, teamsLimit: 100, adminsLimit: 5 },
  { tier: 'starter', name: 'Starter',    annualPriceUsd: 99,  seasonPassPriceUsd: 39,
    stripePriceIdAnnual: process.env.STRIPE_PRICE_STARTER_ANNUAL ?? '',
    stripePriceIdSeason: process.env.STRIPE_PRICE_STARTER_SEASON ?? '',
    sportsLimit: 1, divisionsLimit: 3, teamsLimit: 24, adminsLimit: 2 },
  { tier: 'pro',     name: 'Pro',        annualPriceUsd: 199, seasonPassPriceUsd: 69,
    stripePriceIdAnnual: process.env.STRIPE_PRICE_PRO_ANNUAL ?? '',
    stripePriceIdSeason: process.env.STRIPE_PRICE_PRO_SEASON ?? '',
    sportsLimit: 3, divisionsLimit: 10, teamsLimit: 100, adminsLimit: 5 },
  { tier: 'org',     name: 'Org',        annualPriceUsd: 399, seasonPassPriceUsd: 129,
    stripePriceIdAnnual: process.env.STRIPE_PRICE_ORG_ANNUAL ?? '',
    stripePriceIdSeason: process.env.STRIPE_PRICE_ORG_SEASON ?? '',
    sportsLimit: 999, divisionsLimit: 999, teamsLimit: 999, adminsLimit: 999 },
]

export function getPlan(tier: PlanTier): Plan {
  return PLANS.find(p => p.tier === tier) ?? PLANS[0]
}

export interface LimitCheckResult {
  allowed: boolean
  reason?: string
  limitType?: 'sports' | 'divisions' | 'teams'
}

// v1: gate on sports (headline), guard on divisions + teams. adminsLimit reserved.
export function checkLimits(
  limits: PlanLimits,
  sportCount: number,
  divisions: { teams: unknown[] }[]
): LimitCheckResult {
  const totalTeams = divisions.reduce((s, d) => s + d.teams.length, 0)

  if (sportCount > limits.sportsLimit) {
    return { allowed: false, limitType: 'sports',
      reason: `Your plan allows ${limits.sportsLimit} sport${limits.sportsLimit === 1 ? '' : 's'}.` }
  }
  if (divisions.length > limits.divisionsLimit) {
    return { allowed: false, limitType: 'divisions',
      reason: `Your plan allows ${limits.divisionsLimit} division${limits.divisionsLimit === 1 ? '' : 's'}.` }
  }
  if (totalTeams > limits.teamsLimit) {
    return { allowed: false, limitType: 'teams',
      reason: `Your plan allows ${limits.teamsLimit} team${limits.teamsLimit === 1 ? '' : 's'} total.` }
  }
  return { allowed: true }
}
```

**Self-check** (`plans.test.ts`, assert-based — the only non-trivial logic here):
```typescript
import { checkLimits, getPlan } from './plans'
const starter = getPlan('starter')
assert(checkLimits(starter, 2, []).limitType === 'sports')                            // 2 sports → blocked
assert(checkLimits(starter, 1, Array(4).fill({teams:[]})).limitType === 'divisions')  // 4 div → blocked
assert(checkLimits(starter, 1, Array(3).fill(0).map(() => ({teams: Array(9).fill(0)}))).limitType === 'teams') // 27 teams → blocked
assert(checkLimits(starter, 1, Array(3).fill({teams:[]})).allowed)                    // 1 sport / 3 div → ok
assert(getPlan('org').sportsLimit === 999)
```

✅ **Resolved (routes read):** Both `save/route.ts` and `create/route.ts` enforce limits from the **DB columns** (`leagues_limit, divisions_limit, teams_limit`), not `getPlan(tier)` — they never read `plan_tier`. So:
- **Phase 3 migration is REQUIRED** — `sports_limit` must exist as a column or there's nothing to gate on.
- Both routes change identically: add `sports_limit` to the `select`, add `sports_limit: 1` to the inline `sub ?? {…}` fallback, and pass `sportsLimit` + `new Set(state.season.sports ?? []).size` into `checkLimits`.
- **Stripe webhook also writes these columns** (`src/app/api/payments/webhook/route.ts`) — its upsert must set `sports_limit`/`teams_limit` from the purchased tier, or paid users get a null sports limit. Add this to Phase 5.
- The rename to `trial/starter/pro/org` does NOT touch these routes (they ignore `plan_tier`).
- The `sub ?? { leagues_limit:1, divisions_limit:2, teams_limit:8 }` fallback is today's de-facto trial for rowless users; the new trial mechanics replace that branch.

---

## Phase 2 — types + state (ADDITIVE — do not mutate or remove)

**Safety rule:** keep `season.sport`, ADD optional `sports?`. Never delete `sport`, never mutate the blob on read. This keeps the live `YWWM8G` blob and all 37 snapshots valid forever (see Safety section).

`types.ts`:
```typescript
export interface SeasonConfig {
  leagueName: string
  sport?: string          // KEPT for back-compat — legacy single-sport blobs + snapshot restores
  sports?: string[]       // NEW — e.g. ['softball'] or ['softball','baseball']
  // ...rest unchanged
}
// Division gains an OPTIONAL discipline tag — unused by v1 UI, present so the
// deferred school case is an additive change, not a re-migration:
export interface Division {
  // ...existing
  sport?: string          // defaults to getSports(season)[0] when unset
}
```

`sports.ts` — one tolerant helper, the single read path (no blob mutation):
```typescript
export function getSports(season: { sport?: string; sports?: string[] }): string[] {
  return season.sports?.length ? season.sports : [season.sport ?? 'softball']
}
```

All 16 `getSportConfig(state.season.sport)` sites → `getSportConfig(getSports(state.season)[0])`. Mechanical; correct for v1 (baseball/softball share vocabulary). These are the seams to revisit for the deferred school case. **No `page.tsx` read-time mutation** — the helper handles legacy shape on the fly; `sports` is only ever *written* when the user saves a multi-sport setup.

---

## Phase 3 — DB migration (only if save route reads DB columns; see Phase 1 warning)

`src/db/migrations/012_pricing_sports_gate.sql` — run **manually in Supabase SQL editor** (never CLI):
```sql
ALTER TABLE user_subscriptions
  ADD COLUMN IF NOT EXISTS sports_limit     INTEGER     NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMPTZ,   -- null until first schedule generation
  ADD COLUMN IF NOT EXISTS billing_period   TEXT        NOT NULL DEFAULT 'annual'
    CHECK (billing_period IN ('annual','season_3mo'));
-- leagues_limit left in place (unused, non-destructive). teams_limit kept (still guarded).
-- The 4 tester rows (plan_tier='unlimited') are untouched — defaults apply, and the
-- middleware trial check exempts plan_tier='unlimited' so testers never go read-only.
```
Do **not** modify the 4 `plan_tier='unlimited'` tester rows. Do **not** touch league `YWWM8G`.

---

## Phase 4 — onboarding (`LeagueGate.tsx`)

- Single sport `<select>` (line ~139) → **multi-select** (checkbox list off `SPORTS`).
- Initial state `season.sports` from the selection (currently sets `sport`, line ~36).
- Live tier badge: `(sports.length, divisions, admins) → tier` is just `checkLimits` run against each plan ascending — first that passes is the recommendation. This **is** the "onboarding quiz": the form fields are the questions, `plans.ts` is the scoring. No separate wizard.

---

## Phase 5 — Stripe

New products/prices (prices are immutable). Annual + season for Starter/Pro/Org → 6 prices. Set `STRIPE_PRICE_*_ANNUAL` / `_SEASON` in Vercel, archive old `STRIPE_PRICE_SMALL/MEDIUM/LARGE`. Register prod webhook unchanged. Test in test mode, verify via `user_subscriptions` rows (Stripe MCP connector is live-mode read-only — can't see test objects).

---

## Order of work

1. `plans.ts` rewrite + `plans.test.ts` (no deps).
2. **Check the two API routes** for where limits come from → decide if Phase 3 runs.
3. `types.ts` + `page.tsx` backfill + 16 site swap.
4. `LeagueGate` multi-select + live tier badge.
5. Stripe products + env vars (can run in parallel with 3–4).
6. Verify: live softball blob still loads, single-sport unaffected, 2-sport league gates to Pro.

**Untouched by design:** scheduler, conflict engine, `EventModal` logic, `FieldCalendarTab`. Sport never reached them.
</content>
</invoke>

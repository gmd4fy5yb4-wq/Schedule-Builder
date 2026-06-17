# FieldDay Planner — Shared Calendar & Pricing Redesign Handoff

**Date:** June 16, 2026  
**Author:** Claude (Sonnet 4.6) — conversation with Greg Amundson  
**Purpose:** Full context handoff for implementing the shared calendar feature and pricing model redesign. Read this before touching any code.

---

## 1. What FieldDay Planner Is

A multi-sport league scheduling SaaS. Live at `fielddayplanner.app`. Stack: Next.js 15 / React 19 / TypeScript / Tailwind / Supabase (Postgres + auth) / Stripe / Resend.

**Active users:** One live softball org (2 directors, running spring → summer → fall continuously). 9 auth users total, 4 active subscription rows. 5 leagues in the DB.

**Supabase project:** `actgfxrinoxlyrprzkoh` (Alfred Digital Sports DB — shared with AthleteCard. Do not touch `ac_*` tables.)

**Repo branching:** Work on `dev` branch. Merge `dev → main` to deploy to Vercel. Never push features directly to `main`.

**Critical auth rule:** `flowType: 'implicit'` — never change to PKCE. See `src/middleware.ts`.

---

## 2. Current Architecture (What Exists Today)

### Data model: one giant JSONB blob per league

The entire app state for a league lives in a single `leagues.data` JSONB column. There are **no normalized tables** for games, teams, fields, or divisions. One row = one league = one sport.

```
leagues table:
  id          TEXT (6-char code, e.g. "YWWM8G") — shared access credential
  data        JSONB — entire AppState
  owner_id    UUID → auth.users
  view_token  UUID — read-only share link
```

The `AppState` type (`src/lib/types.ts`) structure:
```typescript
{
  season: { leagueName, sport, startDate, endDate, gameDurationMinutes, practiceDurationMinutes }
  divisions: Division[]   // each has teams[], gamesPerTeam, gameDays, preferredStartTime
  fields: Field[]         // name, location, address, blackoutDates, geocoords
  umpires: Umpire[]
  fieldStaff: FieldStaffMember[]
  schedule: {
    games: ScheduledGame[]       // each has durationMinutes, fieldId, homeTeamId, awayTeamId, divisionId
    practices: ScheduledPractice[]  // each has durationMinutes, fieldId, teamId, divisionId
    specialEvents: ScheduledSpecialEvent[]
  }
}
```

**Key facts:**
- `season.sport` is a single string — one league = one sport. There is no multi-sport league concept today.
- `ScheduledGame.durationMinutes` and `ScheduledPractice.durationMinutes` ARE stored. Conflict detection can use actual game length, not a fixed assumption.
- Field IDs inside the JSONB are client-generated UUIDs (e.g., `"abc123..."`). They're consistent within a league but have no DB-level existence.
- Fields are scoped to their league. Field 2 in the softball league and Field 2 in the baseball league are completely unrelated records.

### Conflict detection: client-side only, within one league

`src/components/EventModal.tsx` has full conflict detection logic:
- Field double-booking (hard block — prevents save)
- Operating hours violation 8AM–8PM (hard block)
- Team scheduling conflict (warning, not blocked)
- Umpire double-assignment (warning)
- Team blackout dates (warning)

The field availability check also greys out booked/blacked-out fields in the EventModal dropdown. This logic is solid and should be reused/extended for cross-league detection.

**The save route (`src/app/api/leagues/save/route.ts`) does NOT check field conflicts** — only subscription limits. Conflict detection is entirely frontend today.

### Subscription model: monthly, gates on leagues/divisions/teams

`src/lib/plans.ts` — current tiers:
```
trial:  1 league, 2 divisions, 8 teams,  $0/mo
small:  1 league, 4 divisions, 16 teams, $12/mo
medium: 2 leagues, 8 divisions, 32 teams, $25/mo
large:  999/999/999 (unlimited),          $49/mo
```

Limits are denormalized into `user_subscriptions` columns: `leagues_limit`, `divisions_limit`, `teams_limit`. The plans.ts values define what they should be; the DB values are what's actually enforced at runtime.

**Known issue:** The `handle_new_user` trigger from migration 002 doesn't exist in prod. New signups get no subscription row and hit the `/pricing` gate immediately. Do not fix this as part of the shared calendar work — it's a separate deferred task.

**Tester accounts:** 4 users have `plan_tier='unlimited'` (an invalid value vs code's valid tiers), `active`, no Stripe link. **Never touch these.**

### Collaborator model

Multiple admins share a 6-character league code. Any authenticated user who knows the code can edit. The save route enforces limits against the **owner's** subscription, not the collaborator's. Collaborators editing another user's league do not consume their own quota.

There is currently **no cross-league ownership tracking** — games in one league have no knowledge of another league's schedule.

### Field Calendar Tab

`src/components/FieldCalendarTab.tsx` — a per-field monthly calendar view. Already has:
- Field sidebar with event count badges
- Busyness color-coding (green/yellow/orange/red) based on total booked minutes
- Blackout date rendering
- Division color-coding on events
- Click-to-edit event modal
- Click-to-add on empty days

This is the foundation for the shared calendar view.

### Other relevant components
- `src/components/DivisionsTab.tsx` — manages divisions and teams
- `src/components/ScheduleTab.tsx` — the auto-generated schedule view with filters
- `src/components/SetupTab.tsx` — initial league setup (sport selection, season dates, etc.)
- `src/lib/sports.ts` — 12 sports defined (softball, baseball, basketball, football, soccer, lacrosse, hockey, cricket, volleyball, tennis, cornhole, other)

---

## 3. Decisions Made in This Conversation

### Pricing model redesign

**Move from monthly-only to annual + short-season billing.** The key insight: the product is a year-round operations tool (spring schedule + summer/fall field management), not a subscribe-and-cancel scheduler.

**New tier structure — gates on sports, divisions, and admins:**

| Tier | Sports | Divisions (total) | Admins | Annual | 3-month |
|---|---|---|---|---|---|
| Free/Trial | 1 | 1 | 1 | $0 | — |
| Starter | 1 | 3 | 2 | $99/yr | $39 |
| Pro | 3 | 10 | 5 | $199/yr | $69 |
| Org | Unlimited | Unlimited | Unlimited | $399/yr | $129 |

**Why sports as the primary gate:** One sport = one league today. The multi-sport org (the little league running softball + baseball) is a Pro or Org tier customer. A college athletic department (8+ sports) is definitively Org.

**Why divisions, not teams:** Teams within a division are relatively small (6–16 per division). Division count is the real complexity driver. The little league example: 2 sports × 3 age divisions each = 6 divisions → Pro tier.

**Why admins:** Maps to organizational growth. Solo volunteer = Starter. Multi-director org (like the active softball org with 2 directors) = Pro. Natural upgrade trigger when you onboard a co-admin.

**Short-season pass:** For genuinely one-off organizers (a school field day, a single tournament). Price punitively per-month vs annual to nudge toward annual. No monthly billing at all — monthly billing invites subscribe/schedule/cancel churn.

**Implementation note:** The new billing model requires new Stripe products/prices. Stripe prices are immutable — create new ones, update `STRIPE_PRICE_*` env vars, archive old ones. The `user_subscriptions` table will need new columns: `sports_limit`, `admins_limit`. The existing `leagues_limit` column becomes less relevant as the gate shifts to sports count. The `plans.ts` `checkLimits` function needs to be extended.

### Shared calendar feature

**What it does:** Multiple leagues (different sports or divisions) share a single calendar view and a common field pool. Field conflicts are hard-blocked across all leagues in the group.

**Real-world use case that drives design:** A little league running softball + baseball at the same facilities. They share fields and umpires. The calendar must show and prevent conflicts across both sports' schedules.

**What Greg confirmed:**
- Hard block on field conflicts (no double-booking, ever)
- All admins of any league in the group see the full shared calendar
- Games belong to their source league — cross-league delete requires a confirmation step ("This game belongs to 8U Baseball. Delete anyway?"), not a hard lock
- All admins can add/edit games on the shared calendar
- Umpire pool sharing: out of scope for now, but the data model should accommodate it later
- Admin toggle to enable shared calendar, then choose which leagues/sports to group

---

## 4. The Core Architecture Problem

**Fields only exist inside the league JSONB blob.** There is no shared field registry at the database level. This is the fundamental blocker for cross-league conflict detection.

To check whether Field 2 is booked at 3pm across the softball league AND the baseball league, you currently have to:
1. Load both league JSONB blobs
2. Find matching fields (by name? by ID? — there's no cross-league field identity)
3. Merge their schedules
4. Run conflict detection

This is doable but fragile. The long-term fix is a DB-level field registry. The short-term fix is a hybrid approach that gets the feature working without a destructive migration.

---

## 5. Migration Plan

### Phase 1: Shared Calendar Groups (migration 012) — DO THIS FIRST

Create two new tables. No field migration needed yet.

```sql
-- Migration 012: shared_calendar_groups
CREATE TABLE shared_calendar_groups (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  owner_id   UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE shared_calendar_group_members (
  group_id   UUID NOT NULL REFERENCES shared_calendar_groups(id) ON DELETE CASCADE,
  league_id  TEXT NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  added_at   TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (group_id, league_id)
);

-- RLS: owner can read/write their own groups
ALTER TABLE shared_calendar_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE shared_calendar_group_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_all" ON shared_calendar_groups
  FOR ALL USING (owner_id = auth.uid());

CREATE POLICY "member_read" ON shared_calendar_group_members
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM shared_calendar_groups g
      WHERE g.id = group_id AND g.owner_id = auth.uid()
    )
  );

CREATE POLICY "owner_write" ON shared_calendar_group_members
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM shared_calendar_groups g
      WHERE g.id = group_id AND g.owner_id = auth.uid()
    )
  );
```

Run this in the Supabase SQL editor. **Never use `supabase db push` or the CLI for migrations.**

### Phase 2: Cross-league conflict detection API

New route: `src/app/api/shared-calendar/check-conflict/route.ts`

```
POST /api/shared-calendar/check-conflict
Body: {
  groupId: string,
  fieldName: string,   // match by name+location since there's no cross-league field ID yet
  fieldLocation?: string,
  date: string,        // YYYY-MM-DD
  startTime: string,   // HH:MM
  durationMinutes: number,
  excludeGameId?: string  // for edits — exclude this game from the check
}
Response: {
  hasConflict: boolean,
  conflictingEvents: Array<{
    leagueId: string,
    leagueName: string,
    sport: string,
    eventType: 'game' | 'practice',
    time: string,
    endTime: string,
    description: string
  }>
}
```

**How this works:**
1. Auth-check the requesting user
2. Verify the user is owner/collaborator of a league in the group (so they have access)
3. Load all member leagues' `data` JSONB blobs
4. For each league, find fields matching the requested `fieldName + fieldLocation`
5. Check schedule for overlapping events at those field IDs on the given date/time
6. Return any conflicts with full context

**Field matching strategy (Phase 1):** Match by `name` (case-insensitive) + optional `location`. This is pragmatic but imperfect — if two leagues name their fields differently, they won't conflict-check correctly. This is acceptable for Phase 1; Phase 2 (field registry) fixes it properly.

### Phase 3: Shared calendar UI

**Modify `FieldCalendarTab`** (or create a `SharedCalendarTab`) to:
1. Accept an optional `groupId` prop
2. When `groupId` is set, load all member leagues' states in parallel
3. Aggregate fields from all leagues (de-duplicate by name+location)
4. Show events from all leagues in the calendar, color-coded by league/sport (extend the existing division color system)
5. Display a legend showing which color = which league

**Modify `EventModal`** to:
1. Accept optional `groupId` and `sharedFields` props
2. When in shared calendar context, replace the `hasHardConflict` client-side check with a call to the conflict-check API (the server-side check is authoritative)
3. Show the API response in the same conflict UI that already exists
4. For cross-league events (events from another league shown in the shared calendar), add a deletion confirmation modal instead of direct delete

**New UI in `SetupTab` or a new `SharingTab`:**
- Toggle: "Share calendar with another league"
- Dropdown to select which of the user's other leagues to group with
- Shows the shared group ID/link for the other admin to join
- Simple on/off with the group name

### Phase 4: Pricing model migration

**New Stripe products/prices:** Create annual and 3-month prices for Starter/Pro/Org tiers. Update `STRIPE_PRICE_*` env vars in Vercel. Archive old monthly prices.

**New `user_subscriptions` columns:**
```sql
-- Migration 013
ALTER TABLE user_subscriptions
  ADD COLUMN sports_limit INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN admins_limit INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN billing_period TEXT NOT NULL DEFAULT 'monthly'
    CHECK (billing_period IN ('monthly', 'annual', 'season_3mo', 'season_6mo'));
```

**Update `src/lib/plans.ts`:** Replace `leaguesLimit` with `sportsLimit` and `adminsLimit`. Update `checkLimits()` to check sports count and admin count.

**Backfill existing subscriptions:** The 4 tester accounts with `plan_tier='unlimited'` stay untouched. New column defaults handle existing rows safely.

### Phase 5 (future): Field registry normalization

Extract fields from JSONB into a proper `league_fields` DB table. This enables clean cross-league field identity, umpire pool sharing, and field-level analytics. This is a bigger change and should be deferred until the shared calendar is working in Phase 1–3.

When you do this: preserve the existing client-generated field UUIDs as the primary keys in the new table. This way, the `fieldId` references inside the JSONB schedule data remain valid without any schedule data migration.

---

## 6. Critical Constraints — Do Not Violate

1. **Never break the active softball org** — league `YWWM8G` (owner `695631aa-80c6-4817-8272-b7b6fade6fb1`) is a live production user. Test that any migration leaves their data fully intact.

2. **Do NOT run `supabase db push` or use Supabase CLI for migrations.** Run all SQL manually in the Supabase SQL editor. Track it in `src/db/migrations/` with the next number (currently `011_fix_security_definer_view.sql` is the last; next is `012`).

3. **Auth: `flowType: 'implicit'` is required** in Sports apps. Do not change to PKCE.

4. **Authorization uses `getUser()`, not `getSession()`** in middleware and payment routes. Do not revert to `getSession()`.

5. **Payment routes are exempt from the subscription gate** in `middleware.ts`. Keep them in `PUBLIC_PREFIXES`.

6. **Stripe prices are immutable** — never edit a live Stripe price. Create new, repoint env var, archive old.

7. **Tester accounts:** 4 users with `plan_tier='unlimited'`. Never modify their subscription rows.

8. **The `organizations`, `teams`, `profiles`, `ac_*` tables** belong to AthleteCard/Prospect Card, not FieldDay Planner. Do not query or modify them in FieldDay code.

9. **No `vercel env pull`** — it dumps all secrets to disk. Copy env values manually from the Vercel dashboard.

---

## 7. Files to Read Before Writing Any Code

In order of importance:

```
src/lib/types.ts                          — AppState and all domain types
src/lib/plans.ts                          — subscription tiers and checkLimits()
src/components/EventModal.tsx             — conflict detection logic (reuse this)
src/components/FieldCalendarTab.tsx       — calendar UI (extend this)
src/app/api/leagues/save/route.ts         — save endpoint (add server-side conflict check here)
src/app/api/leagues/create/route.ts       — create endpoint (update for new plan limits)
src/lib/sports.ts                         — 12 sports defined
src/middleware.ts                         — auth gate and PUBLIC_PREFIXES
src/db/migrations/011_fix_security_definer_view.sql  — last migration applied
```

---

## 8. DB State as of June 16, 2026

**Sports Supabase project:** `actgfxrinoxlyrprzkoh`

**Relevant FieldDay tables:**
- `leagues` — 5 rows. 1 owned by `695631aa...` (active softball org), 1 by `3a2a880c...`, 3 unclaimed.
- `user_subscriptions` — 5 rows. 4 with `plan_tier='unlimited'` (testers), 1 normal.
- `league_snapshots` — 37 rows (point-in-time backups, used for the SnapshotModal recovery feature).
- `_migrations` — 11 rows (tracks applied migrations).

**Migrations applied through:** `011_fix_security_definer_view.sql`

**Next migration number:** `012`

---

## 9. What the Full Feature Looks Like When Done

From the admin's perspective:

1. Admin goes to Settings → enables "Shared Calendar" toggle
2. Names the shared group (e.g., "Little League — All Sports")  
3. Selects which of their leagues to include (softball 8U/10U/12U + baseball 8U/10U/12U)
4. Shared Calendar tab appears in the nav
5. Shared Calendar shows all fields from all grouped leagues in the sidebar
6. Clicking a field shows events from all divisions/sports color-coded by league
7. Adding a game: picks field → API checks across ALL grouped leagues → hard blocks if field is already booked in any league at that time
8. Admin from another league in the group (e.g., the baseball director) sees the same shared calendar, can add/edit their own games, cannot easily delete softball games

**UX for field conflicts across leagues:**  
Same red conflict UI that already exists in EventModal — "Field 2 is already booked 3:00 PM–4:30 PM" — but now it includes the source league context: "Field 2 is already booked 3:00–4:30 PM (8U Baseball)."

---

## 10. Open Questions for Greg Before Building

1. **Multi-admin invite flow:** Today admins join a league by sharing the 6-char code. For the shared calendar group, should joining require the group creator to explicitly add leagues, or can any admin of a grouped league invite other leagues to the group?

2. **Billing period for Stripe:** Annual and 3-month will be two separate Stripe subscription products. Should the UI show both options side-by-side on the `/pricing` page, or default to annual with a "shorter commitment" option?

3. **Sports limit enforcement:** Under the new model, each league is still one sport. The "sports limit" gate would be enforced at league-create time (count distinct sports across owned leagues). Confirm this is the right interpretation.

4. **Admin count:** Where does the admin count gate apply? Per-league (each league can have N co-admins), or across the whole subscription (total admins across all your leagues)? Per-league seems more intuitive.

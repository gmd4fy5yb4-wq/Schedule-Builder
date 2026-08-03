# Per-App Signup Attribution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record which app each user signed up through, so the three Sports products sharing one `auth.users` table can be told apart — and delete 11 obsolete test accounts.

**Architecture:** A new shared table `_app_signups`, written by its own trigger on `auth.users` (separate from FieldDay's `handle_new_user`, so a change to one cannot break the other). Each app stamps its identity into `options.data` at signup; AthleteCard's OAuth path, which cannot carry metadata, is inferred from the provider and later confirmed by a `security definer` RPC. Nothing about entitlements changes, so no user can be locked out.

**Tech Stack:** Postgres (Supabase, Sports project `actgfxrinoxlyrprzkoh`), Next.js + TypeScript (FieldDay, Prospect Card), Expo/React Native (AthleteCard), `@supabase/supabase-js`.

**Spec:** `fieldday-planner/docs/superpowers/specs/2026-08-03-per-app-signup-attribution-design.md`

## Global Constraints

- **This is a live user table.** 24 accounts exist; 13 survive this plan. Every destructive step names its exact expected row count, and a count that does not match means STOP.
- **Attribution must never break signup.** The trigger body ends in `EXCEPTION WHEN OTHERS THEN RETURN NEW`. An `AFTER INSERT` trigger that raises rolls back the `auth.users` insert — that swallow is the only thing between an analytics bug and a total signup outage for all three products.
- **Never modify `handle_new_user`.** It carries FieldDay's billing logic. This plan adds a *second*, independent trigger.
- **No entitlement changes.** Do not alter who receives a `user_subscriptions` row. `isWritable(null)` is `false` (`fieldday-planner/src/lib/plans.ts:101-105`), so any user without a row is write-locked out of FieldDay.
- **Migration name must be `shared_001_app_signups`** — the same string in the filename and in the MCP `apply_migration` `name` argument. The Sports DB is shared and each app runs its own `001…` counter.
- **Owner attestation outranks every derived signal.** Three accounts are owner-attested; do not let a `CASE` expression overwrite them.
- **Commit author must be `gmd4fy5yb4@privaterelay.appleid.com`** in the `fieldday-planner` and `softball-recruiter` repos, or Vercel silently blocks the deploy.
- **Never edit `fieldday-planner/src/lib/types.ts`** — another session owns it with uncommitted changes.
- **AthleteCard ships no store build.** There is no `eas.json` and no OTA config; changes take effect on the next local build. No release is required by this plan.

---

## File Structure

| File | Responsibility |
|---|---|
| `fieldday-planner/src/db/migrations/shared_001_app_signups.sql` | **New.** Table, RLS, trigger function, trigger, confirm RPC. No backfill. |
| `fieldday-planner/src/db/migrations/shared_001_app_signups.rollback.sql` | **New.** Drops all four objects. |
| `fieldday-planner/src/db/migrations/shared_002_app_signups_backfill.sql` | **New.** The 13 backfill rows, separated so the schema can be approved independently of the data. |
| `fieldday-planner/src/app/login/page.tsx:65-70` | **Modify.** Add `data: { app: 'fieldday' }`. |
| `softball-recruiter/src/app/login/page.tsx:40-43` | **Modify.** Add `data: { app: 'prospect-card' }`. |
| `athletecard/src/app/(auth)/sign-in.tsx:70` | **Modify.** Add `options: { data: { app: 'athletecard' } }`. |
| `athletecard/src/app/(app)/onboarding.tsx:19-24` | **Modify.** Call `confirm_app_signup` after the profile insert. |
| `memory/migrations.md` | **Modify.** Record the `shared_` prefix convention and `_app_signups` ownership. |

**Deviation from the spec, stated deliberately:** the spec asks for the backfill as `CASE` expressions "so the reasoning is auditable." Since three of the thirteen rows are owner-attested and contradict what any rule would derive, a pure `CASE` cannot produce the correct result. The backfill therefore uses **explicit rows with a per-row `basis` string**, plus a commented verification query showing what the rules *would* have derived — which is both correct and more auditable, because it shows exactly where attestation overrode inference. Flag this to the spec owner if they disagree.

---

### Task 1: Author and branch-test the schema

**Files:**
- Create: `fieldday-planner/src/db/migrations/shared_001_app_signups.sql`
- Create: `fieldday-planner/src/db/migrations/shared_001_app_signups.rollback.sql`

**Interfaces:**
- Produces: table `public._app_signups(user_id, app, source, basis, confidence, recorded_at)`; function `public.record_app_signup()`; trigger `on_auth_user_created_record_app`; function `public.confirm_app_signup(p_app text)`. Tasks 4, 5 and 6 all depend on these exact names.

**Background:** existing migration files in this directory open with a `-- Migration <name>: <purpose>` header, state the target project, and say what name to apply it under. Match that style — see `fd_014_trial_clock_on_first_schedule.sql:1-14`.

- [ ] **Step 1: Write the migration file**

Create `fieldday-planner/src/db/migrations/shared_001_app_signups.sql`:

```sql
-- Migration shared_001: record which app each user signed up through.
-- Run in the Supabase SQL editor for Alfred Digital Sports (actgfxrinoxlyrprzkoh).
--
-- SHARED TABLE — NOT FieldDay's. It lives in this repo only because the auth.users
-- trigger it sits beside (handle_new_user) is already in FieldDay's migration history.
-- FieldDay, Prospect Card and AthleteCard all write to it.
--
-- Apply as name "shared_001_app_signups". The `shared_` prefix is new: the app-prefix
-- hard rule governs app-OWNED tables, and this one is owned by no single app. The `_`
-- table prefix follows the existing `_migrations` precedent for shared infrastructure.
--
-- Why: all three apps share one auth.users, and nothing recorded the origin of a
-- signup. handle_new_user fires on every insert, so Prospect Card and AthleteCard
-- signups silently received FieldDay trial rows — making user_subscriptions read as
-- "9 lapsed FieldDay trials" for an app with zero outside users.
--
-- This changes NO entitlements. Nothing gates on this table.

create table if not exists public._app_signups (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  app         text not null check (app in ('fieldday','prospect-card','athletecard','unknown')),
  source      text not null check (source in ('signup-stamp','app-confirmed','derived','manual')),
  basis       text,
  confidence  text not null check (confidence in ('certain','high','inferred','none')),
  recorded_at timestamptz not null default now()
);

comment on table public._app_signups is
  'Signup ORIGIN per user (not apps-used). Shared by FieldDay, Prospect Card, AthleteCard. Nothing gates on this table.';

-- Service-role only. RLS on with zero policies means no client can read or write,
-- so a user can never alter their own attribution.
alter table public._app_signups enable row level security;

create or replace function public.record_app_signup() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public._app_signups (user_id, app, source, basis, confidence)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'app',
      -- Only AthleteCard uses signInWithIdToken. This inference breaks the day
      -- FieldDay or Prospect Card adds a social login — revisit it then.
      case when new.raw_app_meta_data->>'provider' in ('apple','google')
           then 'athletecard' end,
      'unknown'
    ),
    'signup-stamp',
    case
      when new.raw_user_meta_data->>'app' is not null
        then 'app stamped at signup'
      when new.raw_app_meta_data->>'provider' in ('apple','google')
        then 'native OAuth provider - only AthleteCard uses signInWithIdToken'
      else 'no signal at signup'
    end,
    case
      when new.raw_user_meta_data->>'app' is not null then 'certain'
      when new.raw_app_meta_data->>'provider' in ('apple','google') then 'high'
      else 'none'
    end
  )
  on conflict (user_id) do nothing;
  return new;
exception when others then
  -- LOAD-BEARING. An AFTER INSERT trigger that raises rolls back the auth.users
  -- insert it fired on. Without this swallow, any bug here takes down signup for
  -- all three products at once. Attribution is never worth failing a signup over.
  return new;
end $$;

create trigger on_auth_user_created_record_app
  after insert on auth.users
  for each row execute function public.record_app_signup();

-- AthleteCard is an Expo client with no server of its own, and RLS blocks direct
-- writes, so it confirms its attribution through this function instead.
-- auth.uid() guarantees a caller can only write its OWN row. It does NOT guarantee
-- p_app is truthful — trustworthy against accident, not against malice. Acceptable
-- because this table gates nothing.
create or replace function public.confirm_app_signup(p_app text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_app not in ('fieldday','prospect-card','athletecard') then
    raise exception 'invalid app: %', p_app;
  end if;
  insert into public._app_signups (user_id, app, source, basis, confidence)
  values (auth.uid(), p_app, 'app-confirmed', 'confirmed by app at onboarding', 'certain')
  on conflict (user_id) do update
    set app = excluded.app, source = excluded.source,
        basis = excluded.basis, confidence = excluded.confidence,
        recorded_at = now();
end $$;

revoke all on function public.confirm_app_signup(text) from public;
grant execute on function public.confirm_app_signup(text) to authenticated;
```

- [ ] **Step 2: Write the rollback file**

Create `fieldday-planner/src/db/migrations/shared_001_app_signups.rollback.sql`:

```sql
-- Rollback shared_001: drop the attribution trigger, functions and table.
-- Safe at any time: nothing reads _app_signups and no app behaviour depends on it.
-- The app-side options.data stamps become inert, not broken.
DROP TRIGGER IF EXISTS on_auth_user_created_record_app ON auth.users;
DROP FUNCTION IF EXISTS public.record_app_signup();
DROP FUNCTION IF EXISTS public.confirm_app_signup(text);
DROP TABLE IF EXISTS public._app_signups;
```

- [ ] **Step 3: Create a Supabase branch**

Use MCP `mcp__supabase-sports__create_branch` with `name: 'attribution-test'`.

Expected: a branch id is returned. Note it — every following step in this task targets the branch, **never production**.

If branch creation fails or is unavailable, STOP and report. Do not test the trigger against production; the failure being tested for is "signup breaks for all three products."

- [ ] **Step 4: Apply the migration to the branch**

Use MCP `mcp__supabase-sports__apply_migration` against the **branch**, with `name: 'shared_001_app_signups'` and the file's contents.

Expected: success, no error.

- [ ] **Step 5: Verify the happy path on the branch**

Run against the branch. **If the insert fails on a NOT NULL column this snippet omits, add it and retry** — this is a throwaway branch, so iterate freely. Supabase's `auth.users` shape varies by version; the columns below are the minimum that has worked, not a guaranteed-complete list.

```sql
-- simulate an OTP signup that stamped its app
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        'branchtest-fd@example.com', '{"app":"fieldday"}'::jsonb, '{"provider":"email"}'::jsonb, now(), now());

-- simulate an AthleteCard Apple signup, which cannot stamp metadata
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        'branchtest-ac@example.com', '{}'::jsonb, '{"provider":"apple"}'::jsonb, now(), now());

select u.email, s.app, s.source, s.confidence, s.basis
from _app_signups s join auth.users u on u.id = s.user_id
where u.email like 'branchtest-%' order by u.email;
```

Expected exactly:

| email | app | source | confidence |
|---|---|---|---|
| branchtest-ac@example.com | athletecard | signup-stamp | high |
| branchtest-fd@example.com | fieldday | signup-stamp | certain |

- [ ] **Step 6: Prove the trigger cannot break signup — the critical test**

Deliberately break the trigger on the branch, then confirm a signup still succeeds:

```sql
-- Break it: write an app value the CHECK constraint forbids.
create or replace function public.record_app_signup() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public._app_signups (user_id, app, source, basis, confidence)
  values (new.id, 'THIS-VIOLATES-THE-CHECK', 'signup-stamp', 'deliberate break test', 'none');
  return new;
exception when others then
  return new;
end $$;

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        'branchtest-broken@example.com', '{"app":"fieldday"}'::jsonb, '{"provider":"email"}'::jsonb, now(), now());

select
  (select count(*) from auth.users where email = 'branchtest-broken@example.com') as user_created,
  (select count(*) from _app_signups s join auth.users u on u.id=s.user_id
    where u.email = 'branchtest-broken@example.com') as attribution_row;
```

Expected: `user_created = 1`, `attribution_row = 0`.

**This is the test that matters.** `user_created = 1` proves a broken attribution trigger loses the attribution but still lets the person sign up. If `user_created = 0`, the `EXCEPTION` handler is not working — STOP and fix before going near production.

- [ ] **Step 7: Delete the branch**

Use MCP `mcp__supabase-sports__delete_branch` with the branch id from Step 3.

Expected: success. Confirm with `mcp__supabase-sports__list_branches` that it is gone — branches cost money while they exist.

- [ ] **Step 8: Commit**

```bash
cd /Users/gregoryamundson/Desktop/CLAUDE/fieldday-planner
git add src/db/migrations/shared_001_app_signups.sql src/db/migrations/shared_001_app_signups.rollback.sql
git -c user.email=gmd4fy5yb4@privaterelay.appleid.com -c user.name='Gregory Amundson' \
  commit -m "Add shared_001: per-app signup attribution schema

Branch-tested, including a deliberately broken trigger body confirming a
failed attribution cannot roll back the auth.users insert.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Delete the 11 obsolete test accounts

**Files:** none — this is a production data operation.

**Interfaces:**
- Produces: `auth.users` reduced from 24 rows to 13. Task 5's backfill assumes exactly these 13.

**This task is irreversible.** Deleted accounts and their cascaded content cannot be restored. The account list below was confirmed individually with the owner and must not be re-derived from an email pattern.

**Delete exactly these 11:**

```
greg+test1@alfred-digital.com   greg+test5@alfred-digital.com
greg+test2@alfred-digital.com   greg+test6@alfred-digital.com
greg+test3@alfred-digital.com   greg+test7@alfred-digital.com
greg+test4@alfred-digital.com   greg+test8@alfred-digital.com
gareg+test4@alfred-digital.com  greg.amundson+test1@gmail.com
fieldday-verify-check@gmail.com
```

**Keep all 13 others.** Six are real Prospect Card customers (`achic107@gmail.com`, `joegig77@gmail.com`, `kcerc4@aol.com`, `smacken20@gmail.com`, `kjsanders25@aol.com`, `paigehansen1979@yahoo.com`) — `achic107` has 3 uploaded files. One is a real AthleteCard user. Deleting any of them destroys customer data.

- [ ] **Step 1: Verify the delete list resolves to exactly 11 users**

```sql
select count(*) as should_be_11 from auth.users where email in (
  'greg+test1@alfred-digital.com','greg+test2@alfred-digital.com','greg+test3@alfred-digital.com',
  'greg+test4@alfred-digital.com','greg+test5@alfred-digital.com','greg+test6@alfred-digital.com',
  'greg+test7@alfred-digital.com','greg+test8@alfred-digital.com','gareg+test4@alfred-digital.com',
  'greg.amundson+test1@gmail.com','fieldday-verify-check@gmail.com');
```

Expected: `11`. Any other number — STOP.

- [ ] **Step 2: Verify the 5 blocking leagues belong only to those accounts**

`leagues.owner_id` is `NO ACTION` and will block the delete.

```sql
select l.id, u.email from leagues l join auth.users u on u.id = l.owner_id
where l.owner_id in (select id from auth.users where email in (
  'greg+test1@alfred-digital.com','greg+test2@alfred-digital.com','greg+test3@alfred-digital.com',
  'greg+test4@alfred-digital.com','greg+test5@alfred-digital.com','greg+test6@alfred-digital.com',
  'greg+test7@alfred-digital.com','greg+test8@alfred-digital.com','gareg+test4@alfred-digital.com',
  'greg.amundson+test1@gmail.com','fieldday-verify-check@gmail.com'))
order by l.id;
```

Expected exactly 5 rows: `62GGLL` (test7), `6TNQ6J` (test6), `JF9ZDS` (test8), `JMZQ3R` (test6), `QLFEZC` (test5).

**`YWWM8G` must NOT appear** — that is the real production league (132 games, 36 with results). If it does, STOP.

- [ ] **Step 3: Delete the orphan-prone snapshots**

`league_snapshots` has **no foreign key to `leagues`**, so these rows are not blocked — they would silently orphan.

```sql
delete from league_snapshots
where league_id in ('QLFEZC','6TNQ6J','JMZQ3R','62GGLL','JF9ZDS');
```

Expected: 18 rows deleted.

- [ ] **Step 4: Delete the 5 leagues**

```sql
delete from leagues where id in ('QLFEZC','6TNQ6J','JMZQ3R','62GGLL','JF9ZDS');
```

Expected: 5 rows deleted.

Note `JF9ZDS` was the browser-verification league for the conflict-review work. Future verification will need a fresh league; this is expected.

- [ ] **Step 5: Delete the subscription rows**

`user_subscriptions.user_id` is `NO ACTION` (documented prod drift) and blocks the user delete.

```sql
delete from user_subscriptions where user_id in (
  select id from auth.users where email in (
  'greg+test1@alfred-digital.com','greg+test2@alfred-digital.com','greg+test3@alfred-digital.com',
  'greg+test4@alfred-digital.com','greg+test5@alfred-digital.com','greg+test6@alfred-digital.com',
  'greg+test7@alfred-digital.com','greg+test8@alfred-digital.com','gareg+test4@alfred-digital.com',
  'greg.amundson+test1@gmail.com','fieldday-verify-check@gmail.com'));
```

Expected: 11 rows deleted.

- [ ] **Step 6: Delete the users**

This cascades `profiles` (4 rows), `account_tiers`, `ac_profiles`, `pc_subscriptions`, `user_roles`, `team_coaches`, `pc_card_sends`.

```sql
delete from auth.users where email in (
  'greg+test1@alfred-digital.com','greg+test2@alfred-digital.com','greg+test3@alfred-digital.com',
  'greg+test4@alfred-digital.com','greg+test5@alfred-digital.com','greg+test6@alfred-digital.com',
  'greg+test7@alfred-digital.com','greg+test8@alfred-digital.com','gareg+test4@alfred-digital.com',
  'greg.amundson+test1@gmail.com','fieldday-verify-check@gmail.com');
```

Expected: 11 rows deleted.

- [ ] **Step 7: Verify the survivors**

```sql
select count(*) as should_be_13 from auth.users;
select email from auth.users order by created_at;
```

Expected: `13`, and the list is exactly `greg@lev-itsb.com`, `greg@alfred-digital.com`, `jonathan@lev-itsb.com`, `jherrera.online@yahoo.com`, `gamundson@mac.com`, `greg.amundson@gmail.com`, `paigehansen1979@yahoo.com`, `kcerc4@aol.com`, `kjsanders25@aol.com`, `n264vgksyc@privaterelay.appleid.com`, `achic107@gmail.com`, `smacken20@gmail.com`, `joegig77@gmail.com`.

Also confirm the real production league survived:

```sql
select id, jsonb_array_length(data->'schedule'->'games') as games from leagues where id = 'YWWM8G';
```

Expected: one row, 132 games.

---

### Task 3: Stamp the app at signup in all three apps

**Files:**
- Modify: `fieldday-planner/src/app/login/page.tsx:65-70`
- Modify: `softball-recruiter/src/app/login/page.tsx:40-43`
- Modify: `athletecard/src/app/(auth)/sign-in.tsx:70`

**Interfaces:**
- Produces: `auth.users.raw_user_meta_data->>'app'` populated at signup with `'fieldday'`, `'prospect-card'` or `'athletecard'`. Task 1's trigger reads it; Task 5's backfill can also read it for anyone who signs up between this deploy and the migration.

**Background:** `options.data` maps to `auth.users.raw_user_meta_data` (verified in `@supabase/auth-js` `types.d.ts:526-531`). It applies at user **creation** only, and the trigger reads it only on `INSERT`, so these edits cannot rewrite an existing user's attribution on a later sign-in.

- [ ] **Step 1: FieldDay**

In `fieldday-planner/src/app/login/page.tsx`, replace:

```ts
    const { error: authError } = await getSupabase().auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: {
        emailRedirectTo: callbackUrl,
      },
    })
```

with:

```ts
    const { error: authError } = await getSupabase().auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: {
        emailRedirectTo: callbackUrl,
        // Records signup origin in raw_user_meta_data. The Sports Supabase project is
        // shared by three apps, so without this a signup cannot be attributed. Applies
        // at user creation only — a returning user's attribution is never rewritten.
        data: { app: 'fieldday' },
      },
    })
```

- [ ] **Step 2: Prospect Card**

In `softball-recruiter/src/app/login/page.tsx`, replace:

```ts
    const { error: authError } = await getSupabase().auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { emailRedirectTo: callbackUrl },
    })
```

with:

```ts
    const { error: authError } = await getSupabase().auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      // data records signup origin — the Sports Supabase project is shared by three
      // apps. Applies at user creation only.
      options: { emailRedirectTo: callbackUrl, data: { app: 'prospect-card' } },
    })
```

- [ ] **Step 3: AthleteCard (email path only)**

In `athletecard/src/app/(auth)/sign-in.tsx`, replace:

```ts
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim() });
```

with:

```ts
    // data records signup origin. Only reaches the email path — signInWithIdToken
    // (Apple/Google) accepts no metadata, so those signups are inferred from the
    // provider by the DB trigger and confirmed at onboarding.
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { data: { app: 'athletecard' } },
    });
```

- [ ] **Step 4: Type-check and build both web apps**

```bash
cd /Users/gregoryamundson/Desktop/CLAUDE/fieldday-planner && npx tsc --noEmit
cd /Users/gregoryamundson/Desktop/CLAUDE/softball-recruiter && npx tsc --noEmit
```

Expected: no output from either.

Note: `npm run build` in `fieldday-planner` exits non-zero at the lint step (`ESLint must be installed`) on every branch — pre-existing, not caused by this change. Read the log for `Compiled successfully` rather than trusting the exit code.

- [ ] **Step 5: Type-check AthleteCard**

```bash
cd /Users/gregoryamundson/Desktop/CLAUDE/athletecard && npx tsc --noEmit
```

Expected: no output.

- [ ] **Step 6: Commit all three**

```bash
cd /Users/gregoryamundson/Desktop/CLAUDE/fieldday-planner
git add src/app/login/page.tsx
git -c user.email=gmd4fy5yb4@privaterelay.appleid.com -c user.name='Gregory Amundson' \
  commit -m "Stamp signup origin as fieldday

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"

cd /Users/gregoryamundson/Desktop/CLAUDE/softball-recruiter
git add src/app/login/page.tsx
git -c user.email=gmd4fy5yb4@privaterelay.appleid.com -c user.name='Gregory Amundson' \
  commit -m "Stamp signup origin as prospect-card

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"

cd /Users/gregoryamundson/Desktop/CLAUDE/athletecard
git add "src/app/(auth)/sign-in.tsx"
git commit -m "Stamp signup origin as athletecard on the email path

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 7: Report deploy status, do not deploy unasked**

The two web apps reach production by merging to `main` (FieldDay: `dev` → `main`; check Prospect Card's own convention in its `CLAUDE.md` before assuming). AthleteCard has **no store build** — no `eas.json`, no OTA config — so its change takes effect on the next local build and needs no release.

Report which repos have unpushed commits and stop. Deployment is the owner's call.

---

### Task 4: Apply the schema to production

**Files:** none — applies Task 1's migration.

**Interfaces:**
- Consumes: `shared_001_app_signups.sql` from Task 1.
- Produces: the live table, trigger and RPC that Tasks 5 and 6 use.

- [ ] **Step 1: Confirm Task 2 completed**

```sql
select count(*) as should_be_13 from auth.users;
```

Expected: `13`. If 24, Task 2 has not run — the backfill in Task 5 would then attribute accounts that are about to be deleted. STOP.

- [ ] **Step 2: Apply the migration**

Use MCP `mcp__supabase-sports__apply_migration` against **production**, with `name: 'shared_001_app_signups'` and the exact contents of the file from Task 1.

The `name` must match the filename exactly — it lands in `supabase_migrations`, the one list where all three apps' migrations sit together.

- [ ] **Step 3: Verify the objects exist**

```sql
select
  (select count(*) from information_schema.tables
    where table_schema='public' and table_name='_app_signups') as table_exists,
  (select count(*) from pg_trigger
    where tgname='on_auth_user_created_record_app') as trigger_exists,
  (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('record_app_signup','confirm_app_signup')) as functions,
  (select relrowsecurity from pg_class where relname='_app_signups') as rls_on,
  (select count(*) from pg_policies where tablename='_app_signups') as policy_count;
```

Expected: `table_exists=1`, `trigger_exists=1`, `functions=2`, `rls_on=true`, `policy_count=0`.

`policy_count=0` with RLS on is the point — it means no client can read or write the table.

- [ ] **Step 4: Confirm FieldDay's trigger is untouched**

```sql
select count(*) as should_be_2 from pg_trigger t join pg_class c on c.oid=t.tgrelid
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='auth' and c.relname='users' and not t.tgisinternal;
```

Expected: `2` — `on_auth_user_created` (FieldDay's, pre-existing) and `on_auth_user_created_record_app` (new). If `1`, the new trigger replaced rather than joined the old one — STOP and restore, because FieldDay signups would then get no subscription row and be write-locked.

---

### Task 5: Backfill the 13 surviving accounts

**Files:**
- Create: `fieldday-planner/src/db/migrations/shared_002_app_signups_backfill.sql`

**Interfaces:**
- Consumes: the table from Task 4.
- Produces: 13 rows in `_app_signups`, zero with `app='unknown'`.

**Background — the attribution and why each row reads as it does:**

Three accounts are **owner-attested** and contradict what any rule would derive. All three signed up through FieldDay first and reached Prospect Card later. Earliest-activity inference got all three wrong, because it measures which app someone engaged with most readily, not which door they came through.

- [ ] **Step 1: Dry-run — confirm the current state matches expectations**

```sql
select u.email, u.created_at::date as signed_up,
  (select count(*) from leagues l where l.owner_id=u.id) as fd,
  (select count(*) from profiles p where p.manager_id=u.id)
   +(select count(*) from teams t where t.created_by=u.id)
   +(select count(*) from account_tiers a where a.user_id=u.id) as pc,
  (select count(*) from ac_profiles a where a.user_id=u.id) as ac
from auth.users u order by u.created_at;
```

Expected 13 rows. Note `profiles.manager_id` — **not** `profiles.id`, which is the player id. Joining on `id` was the original error that produced the whole misdiagnosis, and it returns a clean, plausible, wrong answer.

- [ ] **Step 2: Write the backfill migration**

Create `fieldday-planner/src/db/migrations/shared_002_app_signups_backfill.sql`:

```sql
-- Migration shared_002: backfill signup attribution for the 13 pre-existing accounts.
-- Run in the Supabase SQL editor for Alfred Digital Sports (actgfxrinoxlyrprzkoh).
-- Apply as name "shared_002_app_signups_backfill".
--
-- Requires shared_001 and the test-account cleanup (24 users -> 13) to have run first.
--
-- Rows are explicit rather than CASE-derived on purpose. Three accounts are
-- owner-attested and contradict every derivable signal: earliest-activity inference
-- placed all three in prospect-card, and the owner confirmed all three signed up
-- through FieldDay first and reached Prospect Card later. A CASE expression cannot
-- produce the right answer, so the basis string carries the reasoning per row instead.

insert into public._app_signups (user_id, app, source, basis, confidence)
select u.id, v.app, v.source, v.basis, v.confidence
from (values
  -- Owner-attested: FieldDay signup first, Prospect Card later. Overrides inference.
  ('gamundson@mac.com',                    'fieldday',      'manual',  'owner-attested: FieldDay signup first, Prospect Card later', 'certain'),
  ('greg@alfred-digital.com',              'fieldday',      'manual',  'owner-attested: FieldDay signup first, Prospect Card later', 'certain'),
  ('jherrera.online@yahoo.com',            'fieldday',      'manual',  'owner-attested: FieldDay signup first, Prospect Card later', 'certain'),

  -- Rule 1, temporal: signed up 2026-04-29, before Prospect Card had any data
  -- (2026-05-02). Only a 3-day margin, and that boundary is itself observed from one
  -- account's behaviour rather than a deployment date, so: inferred, not certain.
  -- Corroborated: greg@lev-itsb.com owns YWWM8G, the only league with recorded results.
  ('greg@lev-itsb.com',                    'fieldday',      'derived', 'predates Prospect Card first data; owns the production league', 'inferred'),
  ('jonathan@lev-itsb.com',                'fieldday',      'derived', 'predates Prospect Card first data; same domain as greg@lev-itsb.com', 'inferred'),

  -- Rule 2, earliest activity. Sound here because each of these has content in
  -- exactly ONE app. Rule 2 is not evidence for multi-app accounts.
  ('greg.amundson@gmail.com',              'prospect-card', 'derived', 'Prospect Card activity on signup day; no other app', 'high'),
  ('paigehansen1979@yahoo.com',            'prospect-card', 'derived', 'Prospect Card activity on signup day; no other app', 'high'),
  ('kcerc4@aol.com',                       'prospect-card', 'derived', 'Prospect Card activity on signup day; no other app', 'high'),
  ('kjsanders25@aol.com',                  'prospect-card', 'derived', 'Prospect Card activity on signup day; no other app', 'high'),
  ('achic107@gmail.com',                   'prospect-card', 'derived', 'Prospect Card activity on signup day; no other app', 'high'),
  ('smacken20@gmail.com',                  'prospect-card', 'derived', 'Prospect Card activity on signup day; no other app', 'high'),
  ('joegig77@gmail.com',                   'prospect-card', 'derived', 'Prospect Card activity on signup day; no other app', 'high'),

  -- Rule 2 plus corroboration: Apple provider, and auth.sessions.user_agent carries
  -- the native 'AthleteCard/1 CFNetwork/...' string, which cannot appear by accident.
  ('n264vgksyc@privaterelay.appleid.com',  'athletecard',   'derived', 'AthleteCard profile; Apple provider; native client user-agent', 'high')
) as v(email, app, source, basis, confidence)
join auth.users u on u.email = v.email
on conflict (user_id) do nothing;
```

- [ ] **Step 3: Verify the row count before applying**

Count the `values` rows in the file:

```bash
grep -c "^  ('" /Users/gregoryamundson/Desktop/CLAUDE/fieldday-planner/src/db/migrations/shared_002_app_signups_backfill.sql
```

Expected: `13`.

- [ ] **Step 4: Apply the backfill**

Use MCP `mcp__supabase-sports__apply_migration` against production, `name: 'shared_002_app_signups_backfill'`.

- [ ] **Step 5: Verify every account is placed**

```sql
select app, source, confidence, count(*)
from _app_signups group by 1,2,3 order by 1,2;

select (select count(*) from _app_signups) as total,
       (select count(*) from _app_signups where app='unknown') as unknown_rows,
       (select count(*) from auth.users u where not exists
         (select 1 from _app_signups s where s.user_id=u.id)) as unattributed_users;
```

Expected: `total=13`, `unknown_rows=0`, `unattributed_users=0`, and the breakdown:

| app | count |
|---|---|
| fieldday | 5 |
| prospect-card | 7 |
| athletecard | 1 |

- [ ] **Step 6: Confirm the original wrong answer is now impossible**

```sql
select count(*) as real_fieldday_signups
from _app_signups where app = 'fieldday';

select count(*) as phantom_fieldday_trials
from user_subscriptions s
join _app_signups a on a.user_id = s.user_id
where a.app <> 'fieldday';
```

Expected: `real_fieldday_signups = 5`, and `phantom_fieldday_trials = 8` — the Prospect Card and AthleteCard users still holding a FieldDay `user_subscriptions` row they never asked for. That second number is now *visible and filterable*, which is the point of the whole exercise. Removing those rows is deliberately out of scope.

- [ ] **Step 7: Commit**

```bash
cd /Users/gregoryamundson/Desktop/CLAUDE/fieldday-planner
git add src/db/migrations/shared_002_app_signups_backfill.sql
git -c user.email=gmd4fy5yb4@privaterelay.appleid.com -c user.name='Gregory Amundson' \
  commit -m "Add shared_002: backfill attribution for the 13 surviving accounts

Three rows are owner-attested and override inference: earliest-activity
placed all three in prospect-card, and all three signed up through FieldDay.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: AthleteCard confirms its attribution at onboarding

**Files:**
- Modify: `athletecard/src/app/(app)/onboarding.tsx:19-24`

**Interfaces:**
- Consumes: `public.confirm_app_signup(p_app text)` from Task 1, live after Task 4.

**Background:** AthleteCard's Apple/Google path uses `signInWithIdToken`, whose `options` accepts only `captchaToken` — no metadata. Those signups are inferred from the provider at `confidence='high'`; this call upgrades them to `source='app-confirmed'`, `confidence='certain'`.

- [ ] **Step 1: Add the confirm call**

In `athletecard/src/app/(app)/onboarding.tsx`, replace:

```ts
    const { error } = await supabase.from('ac_profiles').insert(buildProfileInsert(d, userId, birthdate));
    if (error) {
      return error.message.includes('display_name_blocked')
        ? 'Please choose a different display name.'
        : friendlyError(error);
    }
    await refreshProfile(); // routing advances to /(app)
```

with:

```ts
    const { error } = await supabase.from('ac_profiles').insert(buildProfileInsert(d, userId, birthdate));
    if (error) {
      return error.message.includes('display_name_blocked')
        ? 'Please choose a different display name.'
        : friendlyError(error);
    }
    // Apple/Google sign-in cannot carry signup metadata, so the DB inferred this
    // user from their provider. Confirm it authoritatively now. Fire-and-forget:
    // attribution must never block onboarding.
    void supabase.rpc('confirm_app_signup', { p_app: 'athletecard' });
    await refreshProfile(); // routing advances to /(app)
```

- [ ] **Step 2: Type-check**

```bash
cd /Users/gregoryamundson/Desktop/CLAUDE/athletecard && npx tsc --noEmit
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
cd /Users/gregoryamundson/Desktop/CLAUDE/athletecard
git add "src/app/(app)/onboarding.tsx"
git commit -m "Confirm AthleteCard signup attribution at onboarding

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Record the new conventions and verify end to end

**Files:**
- Modify: `memory/migrations.md`

**Interfaces:** none.

- [ ] **Step 1: Record the `shared_` prefix convention**

In `memory/migrations.md`, in the Sports "HARD RULE — every NEW Sports table MUST be app-prefixed" section, add after the prefix table:

```markdown
**Cross-app infrastructure uses `shared_` (migrations) and a leading `_` (tables).**
The app-prefix rule governs app-OWNED tables. A table owned by no single app — like
`_migrations`, and `_app_signups` since 2026-08-03 — takes a leading underscore, and
its migrations take the `shared_` prefix (`shared_001_app_signups`). Do not give such
a table an app prefix: that would imply an owner who can drop it.
```

- [ ] **Step 2: Add `_app_signups` to the Sports ownership map**

In the Sports Table Ownership Map, change the `**Shared**` row to:

```markdown
| **Shared** | `_migrations` + `_migrations_summary` (rows separated by `app_name`), `_app_signups` (signup origin per user; service-role only) |
```

- [ ] **Step 3: Record the cross-app auth hazard**

Add to the same section, after the Collision risk line:

```markdown
**Cross-app auth hazard:** all three Sports apps share one `auth.users`, and
`handle_new_user` fires on EVERY insert — so a Prospect Card or AthleteCard signup
still receives a FieldDay `user_subscriptions` row. Never read `user_subscriptions`
as a list of FieldDay users; join `_app_signups` and filter on `app='fieldday'`.
This produced a fully wrong user analysis on 2026-08-03.
```

- [ ] **Step 4: Commit the memory change**

```bash
cd /Users/gregoryamundson/Desktop/CLAUDE
git add memory/migrations.md
git commit -m "Record shared_ migration prefix and the cross-app auth hazard

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 5: End-to-end verification with a real signup**

Only after the two web apps are deployed. Sign up one throwaway address on FieldDay, then check:

```sql
select u.email, s.app, s.source, s.confidence, s.basis
from _app_signups s join auth.users u on u.id = s.user_id
where u.created_at > now() - interval '10 minutes';
```

Expected: `app='fieldday'`, `source='signup-stamp'`, `confidence='certain'`, `basis='app stamped at signup'`.

Then delete the throwaway, in the Task 2 order: `user_subscriptions` row first, then `auth.users` (`_app_signups` cascades on its own).

- [ ] **Step 6: Final state check**

```sql
select
  (select count(*) from auth.users) as users,
  (select count(*) from _app_signups) as attributed,
  (select count(*) from _app_signups where app='unknown') as unknown;
```

Expected: `users = attributed`, `unknown = 0`.

---

## Rollback

Attribution (Tasks 1, 3, 4, 5, 6) is fully reversible with zero user impact — run `shared_001_app_signups.rollback.sql`, and the app-side stamps become inert rather than broken.

**Task 2 is not reversible.** Deleted accounts and their cascaded content cannot be restored.

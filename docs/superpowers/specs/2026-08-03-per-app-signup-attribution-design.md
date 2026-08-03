# Design — Per-app signup attribution across the shared Sports Supabase project

**Date:** 2026-08-03
**Scope:** FieldDay Planner, Prospect Card, AthleteCard (Sports DB `actgfxrinoxlyrprzkoh`)
**Note:** this spec is cross-app. It lives in the `fieldday-planner` repo only because the `auth.users` trigger it modifies already lives in FieldDay's migration history — it is not FieldDay-owned.
**Status:** approved design, not yet implemented

---

## The problem, and how it surfaced

All three Sports apps share one Supabase project, therefore one `auth.users` table. **Nothing records which app a user signed up through.** Attribution has to be guessed from downstream content, and that guess is wrong often enough to be dangerous.

It produced a concrete, confidently-stated, wrong analysis on 2026-08-03. The chain:

1. `handle_new_user` fires on **every** `auth.users` insert, so every Prospect Card and AthleteCard signup silently receives a **FieldDay `user_subscriptions` row**.
2. Until `fd_014`, that row's trial clock started at signup. So Prospect Card users accumulated FieldDay trials that lapsed without them ever opening FieldDay.
3. Reading `user_subscriptions` therefore showed "9 lapsed FieldDay trials" for an app with **zero** outside users.
4. A first attempt at content-based attribution joined `profiles.id = auth.users.id`. `profiles.id` is the *player* id; the user link is `profiles.manager_id`. Every Prospect Card user came back as having no Prospect Card content, which "confirmed" the false reading.

The correct picture: **FieldDay has 4 real users** (`greg@lev-itsb.com`, `jonathan@lev-itsb.com`, `jherrera.online@yahoo.com`, `gamundson@mac.com`), Prospect Card has 6 outside users, AthleteCard has 1.

The lesson this design encodes: **attribution must be recorded at signup, not reconstructed afterward** — and where it must be reconstructed, the reconstruction's confidence must travel with the value.

### Why the table-prefix convention did not prevent this

`memory/migrations.md` requires every new Sports table to carry its app's prefix (`fd_`, `pc_`, `ac_`) precisely so the three apps cannot collide. But `auth.users` sits upstream of that convention and cannot be prefixed. One unprefixed trigger on it writes into one app's table for all three apps' signups, quietly undoing the isolation the prefix rule buys everywhere else.

---

## Decisions

| Question | Decision | Rationale |
|---|---|---|
| Scope | **Attribution only** | No entitlement change, so no user can be locked out. See Out of Scope. |
| Storage | **`_app_signups` table**, trigger-written | Not user-writable; one join answers every question; survives metadata being overwritten. |
| AthleteCard OAuth | **Infer from provider, then confirm from the app** | `signInWithIdToken` cannot carry metadata (verified below). |
| Unattributable accounts | **Human-labelled, never guessed** | Only 3 arose, all internal test accounts. |
| Confidence | **Recorded per row** | An observation and a deduction must not read identically. |
| Test accounts | **Delete 11, keep 13** | Explicitly confirmed account-by-account. |

---

## Verified constraints

These were checked against the live code and schema, not assumed. Each one changed the design.

| Fact | Evidence | Consequence |
|---|---|---|
| `signInWithOtp` `options.data` → `raw_user_meta_data` | `@supabase/auth-js` `types.d.ts:526-531`, documented as "maps to the `auth.users.raw_user_meta_data` column" | Stamping works for FieldDay, Prospect Card, and AthleteCard's email path |
| `signInWithIdToken` `options` has **only** `captchaToken` | same file, `SignInWithIdTokenCredentials`, lines 570-583 | AthleteCard's Apple/Google path **cannot** stamp at signup |
| `isWritable(null)` returns `false` | `fieldday-planner/src/lib/plans.ts:101-105` | A FieldDay user with no `user_subscriptions` row is write-locked — this is why entitlement is out of scope |
| Only one trigger on `auth.users` | `pg_trigger` query | `handle_new_user`; a second trigger is additive, not a rewrite |
| An `AFTER INSERT` trigger that raises rolls back the insert | Postgres semantics | Attribution must never raise, or signup breaks |
| Prospect Card and AthleteCard create their own per-user rows in app code | `account_tiers` at PC onboarding; `ac_profiles` at `athletecard/src/app/(app)/onboarding.tsx:19` | FieldDay's trigger is the anomaly, not the pattern |
| `flow_state.referrer` is NULL throughout | live query | Sports apps use `flowType: 'implicit'`; PKCE flow state is never populated, so the redirect URL is not recoverable |
| `auth.audit_log_entries` is empty | live query | Supabase prunes it; no historical signup evidence survives there |

---

## Architecture

### The table

```sql
create table public._app_signups (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  app         text not null check (app in ('fieldday','prospect-card','athletecard','unknown')),
  source      text not null check (source in ('signup-stamp','app-confirmed','derived','manual')),
  basis       text,
  confidence  text not null check (confidence in ('certain','high','inferred','none')),
  recorded_at timestamptz not null default now()
);
alter table public._app_signups enable row level security;
-- no policies: service-role only. A user cannot read or alter their own attribution.
```

`on delete cascade` is deliberate and differs from `user_subscriptions` (which is `NO ACTION`): this table holds no billing state, so it should follow the user out. The trade-off is that attribution history is lost when a user is deleted; accepted, because the table exists to describe live users.

The `_` prefix follows `_migrations`, the existing precedent for shared infrastructure. The app-prefix hard rule governs **app-owned** tables; `_app_signups` is owned by no single app.

### Writers

| Path | `source` | `confidence` |
|---|---|---|
| New signup via OTP, app stamped metadata | `signup-stamp` | `certain` |
| New signup via OAuth, provider inferred | `signup-stamp` | `high` |
| AthleteCard onboarding RPC | `app-confirmed` | `certain` |
| One-time backfill, evidence-derived | `derived` | `high` or `inferred` |
| One-time backfill, human-labelled | `manual` | `certain` |

### The trigger

A **separate** trigger and function, not an edit to `handle_new_user`. FieldDay's trigger carries billing consequences; keeping attribution independent means a change to one cannot break the other.

```sql
create function public.record_app_signup() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public._app_signups (user_id, app, source, basis, confidence)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'app',
      case when new.raw_app_meta_data->>'provider' in ('apple','google')
           then 'athletecard' end,
      'unknown'
    ),
    'signup-stamp',
    case
      when new.raw_user_meta_data->>'app' is not null then 'app stamped at signup'
      when new.raw_app_meta_data->>'provider' in ('apple','google') then 'native OAuth provider — only AthleteCard uses signInWithIdToken'
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
  -- Attribution is never worth failing a signup over. An AFTER INSERT trigger
  -- that raises rolls back the auth.users insert; this swallow is the only thing
  -- standing between an analytics bug and a total signup outage.
  return new;
end $$;

create trigger on_auth_user_created_record_app
  after insert on auth.users
  for each row execute function public.record_app_signup();
```

**The provider inference is an assumption with an expiry date.** It holds only while AthleteCard is the sole app using `signInWithIdToken`. The day FieldDay or Prospect Card adds OAuth, this misattributes. It is a fallback used only when explicit metadata is absent, and it must be revisited before any other app adds a social login.

### The AthleteCard confirm RPC

RLS is service-role only and AthleteCard is an Expo client talking directly to Postgres with no server of its own, so it cannot write the table. A `security definer` function scoped to the caller:

```sql
create function public.confirm_app_signup(p_app text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_app not in ('fieldday','prospect-card','athletecard') then
    raise exception 'invalid app';
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

**Trust model, stated plainly:** `auth.uid()` guarantees a caller can only write *their own* row, but not that `p_app` is truthful. A determined user could claim a different app. There is no security consequence — this table gates nothing — so `app-confirmed` is trustworthy against accident, not against malice.

---

## App changes

Three one-line edits at exact call sites:

```ts
// fieldday-planner/src/app/login/page.tsx:65
options: { emailRedirectTo: callbackUrl, data: { app: 'fieldday' } }

// softball-recruiter/src/app/login/page.tsx:40
options: { emailRedirectTo: callbackUrl, data: { app: 'prospect-card' } }

// athletecard/src/app/(auth)/sign-in.tsx:70   — currently passes no options at all
supabase.auth.signInWithOtp({ email: email.trim(), options: { data: { app: 'athletecard' } } })
```

Plus one call in `athletecard/src/app/(app)/onboarding.tsx`, after the `ac_profiles` insert succeeds:

```ts
void supabase.rpc('confirm_app_signup', { p_app: 'athletecard' });
```

Fire-and-forget: attribution must not block onboarding any more than it blocks signup.

**These edits are inert for existing users.** `options.data` applies at user creation, and the trigger reads it only on `INSERT`, so a returning user's row can never be rewritten by a later sign-in.

---

## Phase 0 — test account cleanup (destructive, runs first)

Confirmed account-by-account with the account owner. **11 deleted, 13 kept.**

**Delete (11):** `greg+test1` … `greg+test8@alfred-digital.com`, `gareg+test4@alfred-digital.com` (a typo'd signup, never signed in), `greg.amundson+test1@gmail.com`, `fieldday-verify-check@gmail.com`.

**Keep (13):** the 4 real FieldDay users, the 6 real Prospect Card users (`achic107`, `joegig77`, `kcerc4`, `smacken20`, `kjsanders25`, `paigehansen1979`), the 1 real AthleteCard user (`n264vgksyc@privaterelay.appleid.com`), plus `greg@alfred-digital.com` and `greg.amundson@gmail.com` — both hold real Prospect Card content.

> **This list is the safety boundary.** An earlier reading of "everyone else can be deleted" would have destroyed 6 Prospect Card customers including one with 3 uploaded files. Any future cleanup re-derives this list from evidence and re-confirms it; it is never inferred from an email pattern.

### Deletion order — mandatory

FK analysis of `auth.users` shows four constraints that **block** a delete and several that **cascade silently**:

| Constraint | Rule | Effect |
|---|---|---|
| `leagues.owner_id` | NO ACTION | blocks |
| `user_subscriptions.user_id` | NO ACTION | blocks (documented prod drift) |
| `teams.created_by` | RESTRICT | blocks — none of the 11 trigger it |
| `organizations.created_by` | RESTRICT | blocks — none of the 11 trigger it |
| `profiles`, `account_tiers`, `ac_profiles`, `pc_subscriptions`, `user_roles`, `team_coaches`, `pc_card_sends` | CASCADE | destroyed silently |

`league_snapshots` has **no FK to `leagues` at all**, so its rows are not blocked — they are orphaned. They must be deleted explicitly or 18 rows will point at league ids that no longer exist.

```sql
-- 1. snapshots first — no FK protects these, they would orphan
delete from league_snapshots where league_id in ('QLFEZC','6TNQ6J','JMZQ3R','62GGLL','JF9ZDS');

-- 2. leagues owned by the doomed accounts — unblocks leagues.owner_id (NO ACTION)
delete from leagues where id in ('QLFEZC','6TNQ6J','JMZQ3R','62GGLL','JF9ZDS');

-- 3. subscription rows — unblocks user_subscriptions.user_id (NO ACTION)
delete from user_subscriptions where user_id in (select id from auth.users where email = any($1));

-- 4. the users — cascades profiles (4 rows), account_tiers, ac_profiles, etc.
delete from auth.users where email = any($1);
```

**Before step 1, verify the league list belongs only to the 11.** `JF9ZDS` is `greg+test8`'s league and was the browser-verification league for the conflict-review work; deleting it means future verification needs a fresh league. That is acceptable and expected.

**Count check between each step.** Expected: 18 snapshots, 5 leagues, 11 subscription rows, 11 users. A count that does not match means the account list drifted — stop.

---

## Backfill — the 13 surviving accounts

Runs after Phase 0, so it attributes only live accounts.

The backfill is a **single SQL migration with the evidence rules written as `CASE` expressions**, not a script that computes values elsewhere and inserts literals. The reasoning must be auditable in the migration file itself.

### The evidence ladder, strongest first

1. **Temporal impossibility.** App launch dates are established from earliest data: FieldDay 2026-03-24, Prospect Card 2026-05-02, AthleteCard 2026-06-23. First-ever signup was 2026-04-29. Anyone who signed up before 2026-05-02 could only have come through FieldDay. → `confidence='inferred'`
2. **Earliest activity after signup.** The app whose first content appears soonest after the signup timestamp. Same-day matches → `confidence='high'`; a gap of weeks → `confidence='inferred'`.
3. **Native user-agent / OAuth provider.** `auth.sessions.user_agent like 'AthleteCard/%'` — the native client identifies itself and cannot appear by accident. Used to corroborate, never to override rule 1.
4. **Human label.** For accounts with no evidence. → `source='manual'`

**Rule 1 must outrank rule 3.** An earlier draft ordered native-UA first and attributed `gamundson@mac.com` to AthleteCard — but they signed up 2026-05-02, seven weeks before AthleteCard existed. The UA proves later *use*, not *origin*. Temporal impossibility outranks every positive signal.

### Expected result

| App | Count | Accounts | Confidence |
|---|---|---|---|
| fieldday | 4 | `greg@lev-itsb.com`, `greg@alfred-digital.com`, `jonathan@lev-itsb.com`, `jherrera.online@yahoo.com` | all `inferred` — rule 1, signed up 2026-04-29 |
| prospect-card | 8 | `gamundson@mac.com`, `greg.amundson@gmail.com`, and the 6 outside users | `high` — rule 2, mostly same-day activity |
| athletecard | 1 | `n264vgksyc@privaterelay.appleid.com` | `high` — rule 2, corroborated by native UA |
| unknown | 0 | — | every surviving account placed |

**One open discrepancy, deliberately recorded rather than resolved.** The account owner names `gamundson@mac.com` as a real FieldDay user. The evidence ladder assigns it `prospect-card`: it signed up 2026-05-02 11:33 and created a Prospect Card profile at 14:07 the same day — 7 weeks before AthleteCard existed, 6 weeks before its first FieldDay league. Both statements are compatible: a real FieldDay *user* whose signup *origin* was Prospect Card. The implementation must not silently pick one. Write the derived value, and confirm the reading with the owner before applying. If they intend `fieldday`, it becomes `source='manual'`.

**All four `fieldday` rows are `inferred`, and two deserve ongoing scepticism.** `greg@alfred-digital.com` and `jherrera.online@yahoo.com` are attributed to FieldDay *only* because Prospect Card did not exist on 2026-04-29 — yet both have since used Prospect Card almost exclusively, and the owner's own list of real FieldDay users excludes `greg@alfred-digital.com`. The value is defensible as signup origin; the `confidence` column is what stops it being read later as observed fact.

---

## Migration mechanics

**Name:** `shared_001_app_signups`, extending the prefix vocabulary with `shared_` for cross-app infrastructure — mirroring how `_app_signups` extends `_migrations`. The same string is passed to MCP `apply_migration`, per the hard rule that the applied name must match the file name.

**This is a new convention** and must be recorded in `memory/migrations.md`: the `shared_` migration prefix, and a row in the Sports ownership map marking `_app_signups` as Shared.

**File location:** `fieldday-planner/src/db/migrations/` — not because FieldDay owns the table, but because `handle_new_user` already lives in FieldDay's migration history, so `auth.users` triggers are already de facto managed there. The file header must state that the table is shared and not FieldDay's, so nobody later mistakes it.

**Phase order:**

1. **Phase 0** — test account cleanup (destructive; own verification)
2. **Phase 1** — deploy the three app stamps. Harmless with no table: metadata is written and simply unread.
3. **Phase 2** — apply `shared_001` (table + trigger + RPC + backfill). The backfill can then also read metadata from anyone who signed up in the gap.
4. **Phase 3** — deploy AthleteCard's `confirm_app_signup` call.

Code before migration, per the existing rule. Here the reverse order costs only a few `unknown` rows rather than anything dangerous, but there is no reason to take it.

---

## Verification

**Backfill dry-run before apply.** Run the `CASE` logic as a bare `SELECT` and diff it against the expected 13-row result above. Only when it matches exactly does it become an `INSERT`. This is the step that catches a join error like `profiles.id` vs `profiles.manager_id` — the specific mistake that caused the original misdiagnosis.

**Trigger safety on a Supabase branch, never on production first.** The one genuinely dangerous failure is a trigger that raises and rolls back a signup. Use MCP `create_branch` for a throwaway copy, then:
- insert a test `auth.users` row and confirm the `_app_signups` row appears
- deliberately break the trigger body (e.g. violate the `check` constraint) and confirm the signup **still succeeds**, proving the `EXCEPTION WHEN OTHERS` swallow works

That second test is the one that matters. Without it, the exception handler is untested code on the most critical path in the business.

**After deploy:** one real signup per app, confirming `source='signup-stamp'` with the right `app`; plus one AthleteCard onboarding confirming the upgrade to `source='app-confirmed'`.

**Post-cleanup sanity:** `select count(*) from auth.users` must be 13.

---

## Failure modes

| Risk | Severity | Mitigation |
|---|---|---|
| Trigger raises → **signup breaks for all three apps** | Critical | `EXCEPTION WHEN OTHERS THEN RETURN NEW`, explicitly tested on a branch |
| Deletion removes a real customer | Critical | Explicit 11-account allowlist, confirmed individually; counts checked between steps |
| Deletion blocked mid-run, leaving partial state | Moderate | Documented FK order; each step's expected count stated |
| Orphaned `league_snapshots` | Low | Deleted explicitly in step 1 |
| Backfill misattributes | Moderate | Dry-run diff; `confidence` column keeps inferences visibly weaker |
| RPC used to claim a false app | Low | Accepted and documented; gates nothing |
| Another app adds OAuth | Low | Provider inference is a fallback only; documented as the assumption that breaks |

---

## Rollback

```sql
drop trigger on_auth_user_created_record_app on auth.users;
drop function public.record_app_signup();
drop function public.confirm_app_signup(text);
drop table public._app_signups;
```

Nothing reads `_app_signups`, no app behaviour depends on it, and the four app-side edits become inert rather than broken. **The attribution change is fully reversible with zero user impact** — the property that makes it safe to ship against a live user table.

**Phase 0 is not reversible.** Deleted accounts and their cascaded content cannot be restored. This is why the allowlist is explicit and confirmed rather than pattern-matched.

---

## Out of scope

Deliberately excluded, with reasons:

- **Changing who receives a `user_subscriptions` row.** Gating `handle_new_user` on the signup app would write-lock any cross-app user who later opens FieldDay, because `isWritable(null)` is `false` — the exact bug migration 013 was written to repair. Cross-app users are real: `gamundson@mac.com` uses all three apps.
- **Deleting the phantom FieldDay trial rows** belonging to Prospect Card users. Harmless once attribution makes them filterable; deleting rows in a shared billing table is the kind of change that fails quietly.
- **An "apps used" view** (distinct from signup origin — one user, many apps). Genuinely useful and cheap once this exists, but a separate question from the one being answered.
- **Backfilling `raw_user_meta_data`** for existing users. The `_app_signups` table is the record; rewriting historical auth metadata adds risk for no gain.

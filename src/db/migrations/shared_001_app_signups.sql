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

drop trigger if exists on_auth_user_created_record_app on auth.users;
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

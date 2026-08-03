-- Rollback shared_003: restore record_app_signup() and confirm_app_signup() to
-- their pre-hardening bodies (as applied by shared_001_app_signups). Does not
-- touch grants made by shared_001 (revoke/grant persist across create or replace),
-- but does restore anon/authenticated table privileges that shared_003 revoked.

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

grant all on table public._app_signups to anon, authenticated;

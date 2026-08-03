-- Migration shared_003: harden record_app_signup() and confirm_app_signup() against
-- a client-supplied 'app' stamp that doesn't match the whitelist.
--
-- Run in the Supabase SQL editor for Alfred Digital Sports (actgfxrinoxlyrprzkoh).
-- Apply as name "shared_003_app_signups_harden".
--
-- This does NOT re-create the trigger — `create trigger` in shared_001 binds by
-- function name, so replacing the function body here is all that's needed for the
-- live trigger to pick up the new behaviour.
--
-- Why: new.raw_user_meta_data->>'app' comes from options.data in signInWithOtp,
-- which is sent from the browser under the public anon key — entirely
-- client-controlled. Before this migration, any value outside the CHECK set
-- ('fieldday','prospect-card','athletecard','unknown') made the INSERT raise, and
-- `exception when others` swallowed it — the user got NO _app_signups row at all,
-- with no error anywhere. The realistic victim is the next app: alfred-web or a
-- fourth Sports product copies the pattern with `data: { app: 'alfred-web' }` and
-- silently produces zero rows forever. Note ->> on a non-string JSON value returns
-- serialised JSON text, which hits the same failure mode.

create or replace function public.record_app_signup() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public._app_signups (user_id, app, source, basis, confidence)
  values (
    new.id,
    -- Whitelisted: an unrecognised/client-forged stamp degrades to 'unknown'
    -- instead of failing the INSERT and vanishing silently (see header comment).
    coalesce(
      case when new.raw_user_meta_data->>'app'
                in ('fieldday','prospect-card','athletecard')
           then new.raw_user_meta_data->>'app' end,
      case when new.raw_app_meta_data->>'provider' in ('apple','google')
           -- Only AthleteCard uses signInWithIdToken. This inference breaks the day
           -- FieldDay or Prospect Card adds a social login — revisit it then.
           then 'athletecard' end,
      'unknown'
    ),
    'signup-stamp',
    -- basis and confidence MUST use the same whitelist test as the app expression
    -- above. If this instead tested "is not null", an unrecognised stamp would
    -- yield app='unknown' with confidence='certain' — worse than the bug being
    -- fixed here.
    case
      when new.raw_user_meta_data->>'app' in ('fieldday','prospect-card','athletecard')
        then 'app stamped at signup'
      when new.raw_app_meta_data->>'provider' in ('apple','google')
        then 'native OAuth provider - only AthleteCard uses signInWithIdToken'
      else 'no signal at signup'
    end,
    case
      when new.raw_user_meta_data->>'app' in ('fieldday','prospect-card','athletecard') then 'certain'
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

-- AthleteCard is an Expo client with no server of its own, and RLS blocks direct
-- writes, so it confirms its attribution through this function instead.
-- auth.uid() guarantees a caller can only write its OWN row. It does NOT guarantee
-- p_app is truthful — trustworthy against accident, not against malice. Acceptable
-- because this table gates nothing.
create or replace function public.confirm_app_signup(p_app text) returns void
language plpgsql security definer set search_path = public as $$
begin
  -- No caller (e.g. called outside an authenticated session) — nothing to record.
  if auth.uid() is null then return; end if;

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

-- Belt-and-braces, not a fix: RLS-with-zero-policies on public._app_signups already
-- reduces anon/authenticated access to zero rows. Supabase grants table-level ALL
-- on new public tables to anon and authenticated by default, though, so revoke it
-- explicitly as a second layer in case RLS is ever relaxed or policies are added.
revoke all on table public._app_signups from anon, authenticated;

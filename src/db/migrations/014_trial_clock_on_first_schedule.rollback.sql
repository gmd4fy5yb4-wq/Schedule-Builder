-- Rollback 014: restore the signup-time trial clock from migration 013.
-- Rows created while 014 was live keep trial_started_at/subscription_end = NULL
-- (i.e. an unexpiring trial) until they generate a schedule — revert the
-- save-route trial-clock block too, or grant them a clock manually.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  INSERT INTO public.user_subscriptions (
    user_id, plan_tier, subscription_status,
    sports_limit, divisions_limit, teams_limit, leagues_limit,
    trial_started_at, subscription_end
  )
  VALUES (
    NEW.id, 'trial', 'trialing',
    3, 10, 100, 999,
    now(), now() + interval '14 days'
  )
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

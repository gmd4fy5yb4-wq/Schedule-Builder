-- Migration 007: Security hardening
-- 1. Fix handle_new_user SECURITY DEFINER missing SET search_path (search_path injection risk)
-- 2. Tighten league_snapshots RLS — restrict read/write/delete to the owning user

-- Fix 1: handle_new_user — add SET search_path = '' to prevent search_path injection
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
BEGIN
  INSERT INTO public.user_subscriptions (user_id, plan_tier, subscription_status)
  VALUES (NEW.id, 'trial', 'trialing')
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Fix 2: league_snapshots RLS — scope all operations to the owning user
DROP POLICY IF EXISTS authenticated_select ON public.league_snapshots;
DROP POLICY IF EXISTS authenticated_insert ON public.league_snapshots;
DROP POLICY IF EXISTS authenticated_delete ON public.league_snapshots;

CREATE POLICY authenticated_select ON public.league_snapshots
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.leagues
      WHERE leagues.id = league_snapshots.league_id
        AND leagues.owner_id = auth.uid()
    )
  );

CREATE POLICY authenticated_insert ON public.league_snapshots
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.leagues
      WHERE leagues.id = league_snapshots.league_id
        AND leagues.owner_id = auth.uid()
    )
  );

CREATE POLICY authenticated_delete ON public.league_snapshots
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.leagues
      WHERE leagues.id = league_snapshots.league_id
        AND leagues.owner_id = auth.uid()
    )
  );

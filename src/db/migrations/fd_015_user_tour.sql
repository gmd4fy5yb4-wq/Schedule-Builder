-- Migration fd_015: remember that a user has been offered the onboarding tour.
-- Run in the Supabase SQL editor for Alfred Digital Sports (actgfxrinoxlyrprzkoh),
-- or apply via MCP under the name "fd_015_user_tour".
--
-- Prefixed because the Sports DB is shared with Prospect Card and AthleteCard, and
-- each app runs its own migration counter. See memory/migrations.md.
--
-- Why its own table rather than a column on user_subscriptions: the Stripe webhook
-- (src/app/api/payments/webhook/route.ts lines 49 and 80) upserts that table with a
-- fixed column list. Any column outside that list is wiped on every checkout and
-- every renewal — so tour state would reset at the exact moment a trialling coach
-- becomes a paying customer, and the welcome modal would reappear. This table is
-- immune to that by construction.
--
-- Presence of a row is the whole signal: "this user has been offered the tour."
-- Step position is deliberately NOT stored — see the spec, section 2.

CREATE TABLE IF NOT EXISTS public.fd_user_tour (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  seen_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.fd_user_tour ENABLE ROW LEVEL SECURITY;

-- Owner-only. The row IS the user, so auth.uid() = user_id is a complete check —
-- unlike a shared resource, where the one auth.users pool across three Sports apps
-- means `to authenticated` proves nothing and an allowlist is required.
CREATE POLICY fd_user_tour_select_own ON public.fd_user_tour
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY fd_user_tour_insert_own ON public.fd_user_tour
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- No UPDATE and no DELETE policy on purpose: the row is written once and never
-- changes. Replaying the tour from the ? button does not touch this table.

INSERT INTO public._migrations (app_name, migration_name, applied_by, notes)
VALUES (
  'fieldday-planner',
  'fd_015_user_tour',
  'claude-code',
  'Onboarding tour: one row per user who has been offered the welcome modal.'
);

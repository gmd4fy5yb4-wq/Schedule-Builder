-- Rollback shared_001: drop the attribution trigger, functions and table.
-- Safe at any time: nothing reads _app_signups and no app behaviour depends on it.
-- The app-side options.data stamps become inert, not broken.
DROP TRIGGER IF EXISTS on_auth_user_created_record_app ON auth.users;
DROP FUNCTION IF EXISTS public.record_app_signup();
DROP FUNCTION IF EXISTS public.confirm_app_signup(text);
DROP TABLE IF EXISTS public._app_signups;

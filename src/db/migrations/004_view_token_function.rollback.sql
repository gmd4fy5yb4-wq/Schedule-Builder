-- Rollback 004: Remove view token function
DROP FUNCTION IF EXISTS public.get_or_create_view_token(TEXT);

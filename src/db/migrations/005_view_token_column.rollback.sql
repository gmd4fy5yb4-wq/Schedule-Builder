-- Rollback 005
REVOKE EXECUTE ON FUNCTION public.get_or_create_view_token(TEXT) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM authenticated;
-- Note: we do not drop the view_token column on rollback to avoid data loss.

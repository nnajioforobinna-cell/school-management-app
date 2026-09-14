-- =============================================================================
-- Revoke direct RPC access to trigger-only SECURITY DEFINER functions
-- Migration 0006_lock_down_trigger_functions
--
-- These run only from triggers (never from RLS policies), so they need no
-- anon/authenticated EXECUTE grant.
-- =============================================================================

revoke execute on function public.handle_new_user() from anon, authenticated;
revoke execute on function public.on_payment_change() from anon, authenticated;
revoke execute on function public.recompute_invoice(uuid) from anon, authenticated;

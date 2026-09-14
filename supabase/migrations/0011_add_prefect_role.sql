-- =============================================================================
-- Add the "prefect" role (class prefect / monitor — records attendance only)
-- Migration 0011_add_prefect_role
--
-- Enum values must be added in their own transaction before being referenced,
-- so the attendance policy change lives in 0012.
-- =============================================================================

alter type app_role add value if not exists 'prefect';

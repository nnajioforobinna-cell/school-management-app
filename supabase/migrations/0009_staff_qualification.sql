-- =============================================================================
-- Add qualification to staff
-- Migration 0009_staff_qualification
-- =============================================================================

alter table staff add column if not exists qualification text;

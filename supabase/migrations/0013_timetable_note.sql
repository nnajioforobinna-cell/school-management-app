-- =============================================================================
-- Timetable cell label (e.g. Break, Assembly)
-- Migration 0013_timetable_note
-- =============================================================================

alter table timetable_entries add column if not exists note text;

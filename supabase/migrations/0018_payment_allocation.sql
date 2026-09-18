-- =============================================================================
-- Per-fee-structure payment allocation
-- Migration 0018_payment_allocation
--
-- A payment now carries how it splits across the invoice's fee structures, as a
-- JSON map { "<fee_structure_id>": amount }. The financial report sums these
-- actual figures per fee structure instead of proportionally guessing a split.
-- =============================================================================
alter table public.payments add column if not exists allocation jsonb;

-- Refunds (ADR-0013): pieces taken back to the store leave stock as `returned`.
-- A new enum value cannot be used in the transaction that adds it, so the
-- tables and functions that use it are in the next migration.
alter type public.movement_reason add value if not exists 'returned';

-- Repacks (ADR-0019): pieces moved from source items into a pack item. A new
-- enum value cannot be used in the transaction that adds it, so the constraint,
-- views and function that use it are in the next migration.
alter type public.movement_reason add value if not exists 'repacked';

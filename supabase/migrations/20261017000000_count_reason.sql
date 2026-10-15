-- Stock counts (ADR-0016): the difference found at a count is a `count`
-- movement. A new enum value cannot be used in the transaction that adds it,
-- so the constraint, view and function that use it are in the next migration.
alter type public.movement_reason add value if not exists 'count';

---
status: accepted
---

# Postgres owns the money, stock and insight rules

All business maths lives in Postgres views and functions, not the browser: one source of truth, a thin frontend, and pgTAP tests for money rules. Money is integer cents and stock is pieces. An item's cost per piece is the **weighted average** of stock on hand when a purchase arrives, so Insights profit stays accurate while old and new boxes mix (latest cost was the prototype's rule; the gap is about a point of margin at this scale). Stock is an **append-only ledger** of stock movements (purchase, sold, out, missing, damaged, found, donated, correction); nothing edits a stock number, so concurrent volunteers never collide and the ledger is its own audit trail. Closed sale days are fixed with correction movements, and leftovers before summer are logged as donated. Sale day phase changes go only through guarded functions (`start_sale`, `begin_count`, `sign_off`, `close_sale_day`) so double taps can't double-finish; items use a `version` column for optimistic concurrency. Insights are rule-based queries with sentence templates because the treasurer needs exact, predictable numbers.

## Considered options

- **LLM-generated insight text**: rejected. An LLM could later reword computed facts, never compute them.

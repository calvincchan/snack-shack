---
status: accepted
---

# Repacking moves stock and cost into a new item

On one sale day, volunteers repacked 155 Peach Slices and 31 Sour Keys Gummy into 31 candy packs (5 + 1 a pack), sold at $2 a pack. The team will do this again. The ledger didn't know about it, so the next stock count would have shown the slices and keys as **pieces gone** (looking sold) and the packs as pieces from nowhere at a cost of 0.

- **Repack** is a screen opened from a button next to **Count stock** on the Items tab. Any volunteer picks the pack item, the number of packs, and each source item with its pieces per pack.
- `repack()` posts, in one transaction, a `repacked` (−) movement per source item and one `repacked` (+) movement for the pack item, grouped under a `repacks` row (who, when, note). The `id` is client-generated so a retry cannot repeat it.
- The pack item's cost per piece is the sum of its source pieces' costs (here 5 × 4.20¢ + 18¢ = 39¢), blended into its weighted average the same way `log_purchase` does.
- Stock counts and **pieces gone** need no change: the count difference is measured against a ledger that already includes the repack.
- Items carry no flag. A **pack item** is one a repack made; a **Repack only** item has no price and has gone into a repack. Both are derived from the `repacks` table and the ledger, so they cannot drift and volunteers have nothing to set.
- Repack only items need no price and don't appear under **Needs a price**. Item insights count only priced items, since an item without a price is not sold. Repack only items are still bought, counted and shown on the Items tab. Giving one a price makes it a regular item again.
- Pack items show with 🛍️ wherever an item name is shown (display only, not saved in the name). Repack's first step leaves them out (a pack goes into no other pack); its second step shows only them, plus **New item**. Log purchase leaves them out too, since stores don't sell them. These are app rules; `repack()` accepts any active item on either side.
- Repack doesn't check that enough source pieces are on hand. Between counts the ledger only grows (ADR-0016), so a check would not catch anything real. The next stock count absorbs mistakes.

This is not the pre-bagging of deal items that ADR-0004 rejected: a repack makes a new item out of others, priced on its own.

## Considered options

- **Do nothing; let the stock count absorb it:** rejected. Every repack inflates pieces gone for the source items and leaves the pack's cost at 0, so its margin looks like 100%.
- **Hand-written `correction` movements:** rejected as the regular path. They fix the stock but not the cost, hide the reason, and need database access. They are fine for a one-off mistake.
- **Recipe items (a pack defined as its parts, stock derived):** rejected. It is far more model than a once-a-term repack needs.
- **Recording repacks on the Count stock screen:** rejected. Repacks happen around sale days; counts happen about once a term.
- **A stored `repack_only` flag (Sold on its own / Repack only):** rejected. The price already says whether an item is sold, a pack item marked Repack only would be useless, and any item may go into a pack to clear out odds and ends.

## Consequences

- New `movement_reason` value `repacked` (±), a `repacks` table, `repack_id` on `stock_movements`, and derived `made_by_repack` and `in_repacks` columns on `item_overview`.
- `repack()` takes one JSON argument and can make the pack item itself, like `log_purchase`, so a retry never leaves a new item without its repack.
- `bought_since` stays purchases minus returns. The Items line adds the net repacked pieces since the last count.

---
status: accepted
---

# Repacking moves stock and cost into a new item

On one sale day, volunteers repacked 155 Peach Slices and 31 Sour Keys Gummy into 31 candy packs (5 + 1 a pack), sold at $2 a pack. The team will do this again. The ledger didn't know about it, so the next stock count would have shown the slices and keys as **pieces gone** (looking sold) and the packs as pieces from nowhere at a cost of 0.

- **Repack** is a screen opened from a button next to **Count stock** on the Items tab. Any volunteer picks the pack item, the number of packs, and each source item with its pieces per pack.
- `repack()` posts, in one transaction, a `repacked` (−) movement per source item and one `repacked` (+) movement for the pack item, grouped under a `repacks` row (who, when, note). The `id` is client-generated so a retry cannot repeat it.
- The pack item's cost per piece is the sum of its source pieces' costs (here 5 × 4.20¢ + 18¢ = 39¢), blended into its weighted average the same way `log_purchase` does.
- Stock counts and **pieces gone** need no change: the count difference is measured against a ledger that already includes the repack.
- Items with a **Repack only** flag aren't sold on their own. They need no price, don't appear under **Needs a price**, and are left out of the item insights. They are still bought, counted and shown on the Items tab.
- Repack doesn't check that enough source pieces are on hand. Between counts the ledger only grows (ADR-0016), so a check would not catch anything real. The next stock count absorbs mistakes.

This is not the pre-bagging of deal items that ADR-0004 rejected: a repack makes a new item out of others, priced on its own.

## Considered options

- **Do nothing; let the stock count absorb it:** rejected. Every repack inflates pieces gone for the source items and leaves the pack's cost at 0, so its margin looks like 100%.
- **Hand-written `correction` movements:** rejected as the regular path. They fix the stock but not the cost, hide the reason, and need database access. They are fine for a one-off mistake.
- **Recipe items (a pack defined as its parts, stock derived):** rejected. It is far more model than a once-a-term repack needs.
- **Recording repacks on the Count stock screen:** rejected. Repacks happen around sale days; counts happen about once a term.

## Consequences

- New `movement_reason` value `repacked` (±), a `repacks` table, `repack_id` on `stock_movements`, and an `items.repack_only` flag.
- `repack()` takes one JSON argument and can make the pack item itself, like `log_purchase`, so a retry never leaves a new item without its repack.
- `bought_since` stays purchases minus returns. The Items line adds the net repacked pieces since the last count.

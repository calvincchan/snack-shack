---
status: accepted
---

# Stock is counted occasionally, not on sale days

Supersedes ADR-0006.

With no counts on sale days (ADR-0015), purchases add stock and nothing takes it away, so the ledger's on hand only grows. Rather than show a number nobody can trust, the app shows what it actually knows.

- **Count stock** is a screen any volunteer can open at any time, expected about once a term. It lists every active item; skipping items is allowed. Saving posts a `count` movement per counted item for the difference from the ledger, so the ledger still sums to what was on the shelf.
- **Items** shows "Counted 24 on Oct 1 · bought 48 since" (or "Not counted · bought 48") instead of on hand.
- **Pieces gone** between two counts (sold, eaten, lost) is the negative of the `count` movement. Insights use it, with the item's price and cost, for a rough per-item picture.

Removed: What to buy (stock gaps by type, target stock, sale days left), tips from recent sales and the "I'm going shopping" trip claim. The team decides what to buy in its group chat. Deal check, suggested prices and margin bands stay, because buying good deals is how the team shops.

The ledger, purchase movements, refunds and donations stay as they are, so per-sale-day counting could come back without losing history.

## Considered options

- **A "running low" flag per item:** rejected as not worth a screen; the group chat already does this.
- **What to buy sorted by "bought since last count":** rejected. A rough hint invites trust it hasn't earned.
- **Show on hand labelled "at most":** rejected as confusing.

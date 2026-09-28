---
status: accepted
---

# Item model: two types, storage as a label, deals counted in pieces

Items have exactly two types, **Snack** and **Treat**, because that's the only split the kid rules need (max 1 treat). Storage (Shelf / Freezer) is a separate field and only a label, so a frozen snack is possible and rule checks never list two treat values. Assorted variety packs are one item; the count-up note captures flavour feedback. Deals such as "2 for $1" are one price option, stock is counted in pieces, and a deal counts as one item and one treat. Loose deal items are not pre-bagged for now.

## Considered options

- **A third type ("treat, freezer")**: rejected; it grouped inconsistently.
- **"Healthy pick" tag**: rejected; no clear definition and more mental load for the buyer.
- **Splitting variety packs into flavours**: rejected; too much work for volunteers.
- **Pre-bagging deal items**: rejected for now (no volunteer time); revisit after the first real sale.

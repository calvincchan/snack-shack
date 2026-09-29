---
status: accepted
---

# Item model: two types, storage as a label, deals counted in pieces

Items have exactly two types, **Snack** and **Treat**, because that's the only split the kid rules need (max 1 treat). Storage (Shelf / Freezer) is a separate field and only a label, so a frozen snack is possible and rule checks never list two treat values. Assorted variety packs are one item; the count-up note captures flavour feedback. Deals such as "2 for $1" are one price option, stock is counted in pieces, and a deal counts as one item and one treat. Loose deal items (mini bars) are not pre-bagged. Bulk candy bought by weight is bagged by volunteers (about 65–70 g a bag) and stocked as bags: the buyer converts the pack weight to an estimated bag count when logging the purchase, so a bag is the piece, its bundle size is 1, and cost per piece is cost per bag. The app never tracks weight.

## Considered options

- **A third type ("treat, freezer")**: rejected; it grouped inconsistently.
- **"Healthy pick" tag**: rejected; no clear definition and more mental load for the buyer.
- **Splitting variety packs into flavours**: rejected; too much work for volunteers.
- **Pre-bagging deal items**: rejected for now (no volunteer time); revisit after the first real sale.
- **A "pieces per bag" field, or tracking weight**: rejected; counting bags as pieces gives the same stock and cost maths with no schema change. A bulk-by-weight helper on Log purchase may come later.

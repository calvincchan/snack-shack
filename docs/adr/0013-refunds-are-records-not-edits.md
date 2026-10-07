---
status: accepted
---

# Refunds on a claim are added records, not edits

A volunteer sometimes takes pieces back to the store after logging a purchase. A **refund** is a separate row on the claim: which line, pieces returned, the amount from the refund slip (tax included), the date, who logged it, and an optional slip photo and note. The original purchase lines never change, so the receipt photo still matches them. The claim's net is receipt total minus refunds, and that net is what the Claims screen, the CSV, the weekly email and the Mark paid link use.

Rules:

- Only **To pay** claims take refunds, logged by the buyer or a coordinator. A paid claim would leave the volunteer owing the PAC money; that flow is undecided.
- The returned pieces leave stock as a new `returned` stock movement. The refund is refused if the pieces aren't on hand, or if the item is in a sale day that has started selling.
- Pieces and amount are prefilled with what's left on the line, and the amount follows the pieces as a share of what's left until the volunteer types their own. The last refund on a line therefore clears it to exactly $0.00.
- Item unit cost is not recalculated. The drift is small and the next purchase averages it out.
- A claim refunded to $0 shows under Paid as "Refunded" and drops out of the weekly email; its status column stays To pay → Paid as in ADR-0007.
- A refund can be undone while the claim is To pay: the row is removed (the audit log keeps it) and a `correction` movement puts the pieces back.
- A Mark paid link stores the total it was issued for and refuses to redeem if the total has changed since.

## Considered options

- **Edit a To pay claim's lines in place**: rejected. The total would silently differ from the receipt photo, stock would need a correction anyway, and it breaks "add rows, don't edit".
- **No prefill, volunteer types the slip amount**: tried, then reversed after the prototype; a prefilled amount to check against the slip was easier.
- **Recalculate unit cost on refund**: rejected as more maths than it's worth.

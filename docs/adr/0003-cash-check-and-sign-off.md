---
status: accepted
---

# Cash check: fixed float, tolerances, helper credit, sign-off

The change float is fixed (default $30) so volunteers always know what to leave in the box. Volunteers check it at Check stock before Start sale; if the box is off, the counted amount becomes that sale day's float (via `start_sale`), so expected cash and the deposit start from what is really there. The Settings default is unchanged. Over/short within ±$3 is ok and within ±$10 is a warning (recount once, add a note); small differences are normal with kids. The student helper's $1 snack credit is a no-cash deduction from expected cash, not a loss or a shortage. Every count up needs **one signed-in volunteer** to confirm, enforced by the database. It began as two different volunteers; that was dropped because volunteers are short on time and one confirmation keeps the after-lunch routine minimal. The audit trail still records who confirmed, because each volunteer signs in on their own phone with an email magic link that lasts all term, which also powers the audit trail and presence.

## Considered options

- **Typed initials for sign-off** (as in the prototype): rejected; replaced by a signed-in user.
- **Two different volunteers must confirm** (the first version): dropped for simplicity; one confirmation is enough.

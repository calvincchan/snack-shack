---
status: accepted
---

# Claims are paid from a weekly treasurer email; the treasurer never logs in

Buyers pay with their own money and every purchase is a reimbursement claim with a required receipt photo and no spending limit, matching how the team works today. Claims go straight from **To pay** to **Paid**: the treasurer paying is the approval. The treasurer acts weekly for a few minutes and the role changes most years, so they get a Monday email with deposits, reimbursements grouped per volunteer (likely one e-transfer each), a CSV, and one-time signed "Mark paid" links tied to a treasurer account. The account gives a real audit trail and lets links expire (7 days); Supabase magic links can't last that long, so the app issues its own signed action tokens.

## Considered options

- **An approve step before paying**: rejected; paying is the approval.
- **Treasurer login and screens**: rejected; they only need the email and one-tap actions.

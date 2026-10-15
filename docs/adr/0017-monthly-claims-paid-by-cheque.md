---
status: accepted
---

# Claims go to the treasurer when the coordinator sends them, and are paid by cheque

Supersedes ADR-0007.

The treasurer hands out cheques at the monthly PAC meeting and does not use e-transfer or the one-tap links. So the weekly email and its signed links are replaced:

- **Send claims to treasurer:** the coordinator taps it a day or two before the PAC meeting. The email lists every To pay claim at that moment, grouped per volunteer with their full name (the name on the cheque) and a total, plus the deposits from sale days closed since the last send and a CSV. Receipt photos are **attached, not linked**, so they stay in the treasurer's mailbox for good. Sending again sends the full current list; the screen shows "Last sent on …".
- **Mark paid** is done by the coordinator in the app, per volunteer (one cheque) or per claim, with a paid date and an optional note for the cheque number or a remark. The database refuses if a claim is no longer To pay or its total changed since the list was loaded. The coordinator can mark a paid claim unpaid; the audit log keeps both.
- **Logging for someone else:** any volunteer logs their own purchases; only the coordinator can log one for another volunteer. `log_purchase` enforces this. The receipt photo stays required.
- **Receipt photos are shrunk on upload** (about 1600 px JPEG) so a month of receipts fits in one email.

Removed: the weekly cron job, `action_tokens`, the mark-paid token functions, the `/pay` page and its Edge Function, and the treasurer as a role in the app. The treasurer is only an email address in Settings.

## Considered options

- **Send automatically before each meeting:** rejected. Meeting dates move, and a manual send is simple and reliable.
- **Send only claims not sent before:** rejected. A full list each time is easier to reason about.
- **Keep links in the email:** rejected. Links expire; attachments stay readable months later.

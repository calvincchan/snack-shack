---
status: accepted
---

# Receipt photos are backed up inside the same Supabase project

The weekly backup (issue #21) dumps the database, but `pg_dump` saves only the `storage.objects` rows, not the files. Each receipt and refund slip photo is the only proof for a reimbursement claim, so the weekly workflow now also copies the `receipts` bucket into `backups/receipts/<path>`.

The copy is **copy only**: a file already in the mirror is skipped and nothing is ever deleted, so a mistaken delete in `receipts` stays recoverable. The run fails if any receipt file is missing from the mirror afterwards. Receipt photos and refund slips share the bucket, so both are covered.

## Considered options

- **Copy to a place outside Supabase** (an Actions artifact, or a cloud bucket through the S3 endpoint and `rclone`): deferred. It protects against losing the whole project, but needs a new account and secrets, and the database dump has the same weakness today. Revisit if real money starts to depend on the app, or if the project is ever paused or lost.
- **Do nothing because the paper receipts are kept:** rejected. Paper is not guaranteed to be kept, and unsent To pay claims have no other copy. (Sent claims also have the photos attached to the treasurer's email, ADR-0017.)

## Consequences

- Protects against deletes and bugs inside the project, not against losing the project itself.
- Volume is about 50–100 MB a year (1600 px JPEGs, a few a week), so the 1 GB free Storage quota is not a concern for years. There is no quota guard.
- The restore steps are in [`docs/BACKUP.md`](../BACKUP.md).

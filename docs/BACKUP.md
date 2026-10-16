# Backup and restore

Workflow: `.github/workflows/backup.yml`. It runs Sundays at 11:00 UTC and can be started by hand (Actions → Weekly backup → Run workflow). A red run emails the repo owner.

## What is backed up

- **Database:** `pg_dump` of the `public`, `auth` and `storage` schemas, gzipped, to `backups/snack-shack-<date>.sql.gz`. The newest 8 are kept.
- **Receipt photos:** every file in the `receipts` bucket (receipt photos and refund slips) copied to `backups/receipts/<same path>`. Copy only: existing files are skipped, nothing is deleted. The run fails if any file is missing from the copy.

Both live in the same Supabase project. They protect against deletes and bugs, not against losing the project (ADR-0018).

Storage budget: about 50–100 MB of photos a year, twice with the copy, plus the dumps, against 1 GB on the free plan.

## Restore

Database rows and files must match, so restore both. Try this on a local Supabase first (`supabase start`), not on production.

1. In the Supabase dashboard (Storage → `backups`) or through the Storage API with the service role key, download the newest `snack-shack-<date>.sql.gz` and the `receipts/` folder.
2. Load the dump into an empty database: `gunzip -c snack-shack-<date>.sql.gz | psql "$DB_URL"`. The dump has `storage.objects` rows but no files.
3. Upload each file from the `receipts/` copy back to the `receipts` bucket under the same path (`<purchase id>/<file name>`). The path must equal `storage.objects.name`, and match `purchases.receipt_path` or `refunds.slip_path`.
4. Check: open a claim in the app and confirm its receipt photo opens.

## Restore test

2026-10-15, local Supabase, with the workflow's copy step pointed at the local Storage API:

- Uploaded two photos to `receipts`; the copy step mirrored both to `backups/receipts/`; a second run copied nothing and passed.
- Deleted the originals, downloaded them from the mirror and uploaded them back to the same paths. Checksums matched the originals.
- A fresh `pg_dump` of `public`, `auth` and `storage` contained the `storage.objects` rows and the `receipt_path` values for those paths.

Not tested yet: loading a dump into an empty database (step 2), and a run in GitHub Actions against production. Run the workflow by hand once, then record the date here.

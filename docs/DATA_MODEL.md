# Data model

The schema is in [`supabase/migrations/`](../supabase/migrations/). It is a **reviewed draft**: it applies cleanly and passes [`supabase/tests/sale_day_flow.test.sql`](../supabase/tests/sale_day_flow.test.sql) (40 checks covering buying, the full sale day, cash maths, sign-off, locks, the ledger and treasurer links). That was checked on plain Postgres 16 with small stand-ins for Supabase's `auth`, `storage` and roles. Run `supabase test db` on the real stack as the first build step.

Conventions:
- **Money:** integer **cents** (`*_cents int`). Unit cost is fractional cents: `unit_cost_cents numeric(10,2)` (13.84 = 13.84¢).
- **Stock:** integer **pieces**, even for deal items.
- **IDs:** `uuid`. Clients may generate them so offline retries don't duplicate.
- **Who/when:** `created_by`, `updated_by` default to `public.actor()`, which is the signed-in user, or the treasurer when an Edge Function redeems a signed link.
- Business maths lives in **views and functions**. The frontend reads views and calls functions; it doesn't compute money.

## Overview

```mermaid
erDiagram
  profiles ||--o{ purchases : "buys (buyer_id)"
  purchases ||--|{ purchase_lines : has
  items ||--o{ purchase_lines : ""
  items ||--o{ stock_movements : ""
  purchase_lines ||--o| stock_movements : "creates"
  sale_days ||--|{ sale_day_items : lineup
  items ||--o{ sale_day_items : ""
  sale_days ||--|{ cash_counts : ""
  sale_days ||--o{ sale_day_signoffs : ""
  sale_days ||--o{ stock_movements : "check, sold, out"
  profiles ||--o{ shopping_trips : ""
  profiles ||--o{ action_tokens : "issued_to"
```

## Tables

| Table | Purpose | Key columns / rules |
|---|---|---|
| `settings` | One row of app settings (admin) | `float_cents` 3000, `target_sale_days` 2, `over_short_ok_cents` 300, `over_short_warn_cents` 1000, `gst_rate` 0.05, `max_items_per_kid` 3, `max_treats_per_kid` 1, `treasurer_email` |
| `profiles` | One per signed-in person | `display_name`, `role` (volunteer / treasurer / admin), `active` |
| `items` | What we sell | `name`, `type` (snack / treat), `storage` (shelf / freezer), `price_cents` (null = needs a price), `bundle_size` (pieces per deal), `unit_cost_cents` (weighted average), `archived`, `version`. Price options limited by a check constraint to $1 × 1/2/3 and $2 × 1. |
| `purchases` | A receipt = a reimbursement claim | `claim_no` (SS-001…), `purchased_on`, `store`, `buyer_id`, `receipt_path`, `status` (to_pay / paid), `paid_at`, `paid_by`, `payment_ref` |
| `purchase_lines` | Receipt lines | `item_id`, `pieces`, `cost_cents` (incl. tax) |
| `stock_movements` | **Append-only stock ledger** | `item_id`, `qty` (±), `reason` (purchase, sold, out, missing, damaged, found, donated, correction; sign enforced), links to `purchase_line_id` or `sale_day_id` |
| `sale_days` | One after-lunch sale | `sale_date`, `phase` (lineup → selling → counting → closed), `float_cents` (copied from settings), `helper_credits`, `note`, timestamps. **Only one open at a time.** |
| `sale_day_items` | The lineup, and every count for it | `check_count`, `check_reason` (lineup phase); `start_count`, `locked_price_cents`, `locked_bundle_size`, `locked_type` (set by `start_sale`); `left_count`, `out_count` (counting phase) |
| `cash_counts` | Cash by denomination | `denom_cents` (2000, 1000, 500, 200, 100, 25, 10, 5), `qty` |
| `sale_day_signoffs` | Two-person sign-off | one row per (sale day, user) |
| `shopping_trips` | "I'm going shopping" | `volunteer_id`, `planned_for` (free text), `released_at`. Only one open trip. |
| `action_tokens` | One-time signed links in the treasurer email | `token_hash` (sha256; plaintext never stored), `purpose` = mark_paid, `payload`, `issued_to`, `expires_at`, `used_at`. No client access. |
| `audit_log` | Change history | `table_name`, `row_pk`, `action`, `old_data`, `new_data`, `actor`, `at`. Filled by the `audit_row()` trigger on every important table. |

Storage: private bucket **`receipts`** (second migration). Members can read and upload.

## Views

All views use `security_invoker = true`, so row level security still applies.

| View | Gives you |
|---|---|
| `item_stock` | Every item column plus `on_hand` (sum of the ledger) |
| `claims` | Purchases plus `claim_label` (SS-001), `total_cents`, `buyer_name` |
| `sale_day_item_results` | Per lineup item: `sold_pieces = start − left − out`, `sales_cents = round(sold × locked price ÷ locked bundle)` |
| `sale_day_totals` | Per sale day: `pieces_sold`, `treat_pieces_sold`, `sales_cents`, `expected_cents = float + sales − helper credits × 100`, `counted_cents`, `over_short_cents`, `deposit_cents = counted − float`, `signoffs`, `items_over_start`, `items_uncounted` |
| `item_sale_stats` | Per item across closed sale days: `days_out`, `pieces_sold`, `pieces_per_day_out`, `sales_since_out` (0 = out at the last sale, null = never), `sold_out_recently` (closed at 0 in the last 2), `sold_out_days` |

## Functions (the only way to do the important things)

All are `security definer`, check that the caller is an active member, and keep business rules in one place.

| Function | What it does | Guards |
|---|---|---|
| `suggest_lineup()` | Scores items (HANDOFF §5.6); returns `item_id, type, score, reason, suggested` | Priced, active, stock > 0 |
| `create_sale_day(date)` | Creates the sale day with the float from settings and the suggested lineup | One open sale day |
| `start_sale(sale_day)` | Records Check stock differences as missing / damaged / found movements, sets `start_count`, **locks price, bundle and type**, phase → selling | Only from lineup; every item priced; ≥ 1 item |
| `begin_count(sale_day)` | Phase → counting; pre-fills `left_count = start_count`; creates the eight cash rows | Only from selling |
| `sign_off(sale_day)` | Adds the caller's sign-off | Only while counting; same person twice counts once |
| `close_sale_day(sale_day)` | Posts `sold` and `out` movements, phase → closed | Counting; **2 different sign-offs**; no item above its start; every item counted; guarded update so a double tap fails cleanly |
| `log_purchase(jsonb)` | One transaction: claim, new items, lines, purchase movements, weighted-average cost, optional price | Idempotent on the purchase `id`; receipt required; ≥ 1 line |
| `issue_mark_paid_tokens(interval)` | For the weekly email: one token per volunteer owed money, issued to the treasurer | Service role only |
| `redeem_action_token(token, ref)` | Marks that volunteer's claims paid, recorded as the treasurer | Service role only; single use; expires |

The `log_purchase` payload shape is documented in the migration above the function.

## Guards (triggers)

- **Phase rules** on `sale_days`, `sale_day_items` and `cash_counts`: lineup rows only change during lineup; Check stock only during lineup; leftover counts and cash only during counting; locked columns only via `start_sale`; **nothing once closed**. Functions bypass this by setting `snack.fn = on` for their own transaction.
- **Sign-offs reset** when any count, cash row or helper credit changes, so both volunteers always confirm the final numbers.
- **Ledger is append-only**: update and delete raise an error, even for the service role. Fix mistakes with a `correction` movement.
- **Items**: `updated_at/by` stamped and `version` bumped on every update. Clients do optimistic concurrency with `.update({...}).eq('id', id).eq('version', loadedVersion)`; zero rows updated means someone else changed it, so show the conflict prompt.

## Row level security

| Who | Can |
|---|---|
| Any active member | Read everything except `action_tokens`. Edit items. Add/remove lineup items and enter counts (phase rules apply). Add `donated` and `correction` stock movements. Claim and release their own shopping trip. Call the functions above. |
| Admin | Also manage `profiles` and `settings`. |
| Treasurer | Same as a member if they ever sign in. Payments come through `redeem_action_token` via the Edge Function. |
| Nobody (clients) | Insert purchases, lines or sale days directly, post sold/out/missing movements, or touch `action_tokens`. Those go through functions. |

## Realtime

The `supabase_realtime` publication includes `sale_days`, `sale_day_items`, `cash_counts` and `sale_day_signoffs`. Subscribe on the Sale day screen filtered by `sale_day_id`, and invalidate the matching TanStack Query keys on each change. Use Presence on a channel per sale day for "Yuki is counting cash".

## Weekly treasurer email (Edge Function)

1. Scheduled with Supabase Cron (pg_cron) every Monday 07:00 America/Vancouver.
2. The function (service role) reads `sale_day_totals` for last week, the `claims` view, and calls `issue_mark_paid_tokens()`.
3. It builds the email (see prototype, Buy → Claims) with links such as `https://<app>/pay?t=<token>`, attaches the CSV ledger, and sends through the email provider.
4. `/pay` is a tiny page that posts the token to a second Edge Function, which calls `redeem_action_token(token, ref)` and shows "Yuki's 2 receipts marked paid".
5. Receipt links in the email are short-lived signed URLs from the `receipts` bucket.

## What's deliberately not in the schema

Individual sales, customers, payment methods, barcodes, per-flavour stock, sale/clearance prices, a healthy flag, claim approval. See `docs/adr/`.

## Things to confirm during the build

- `auth.users` inserts in the test file use only `id` and `email`; adjust if the local Supabase version needs more columns.
- In Supabase, `pgcrypto` lives in the `extensions` schema; the functions call `extensions.gen_random_bytes` and `extensions.digest`.
- Whether to add an index on `stock_movements (item_id, created_at)` once there's real data (not needed at this scale).

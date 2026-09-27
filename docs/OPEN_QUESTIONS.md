# Open questions

Items here were not settled while designing. Each has a **working assumption** so the build can continue; change it when the answer is known.

## Learn from the first real sale

| Question | Working assumption | How to decide |
|---|---|---|
| Does letting kids take 2 loose mini bars slow the line? | No pre-bagging. | Ask the volunteers after the first sale with a deal item. |
| Is counting loose pieces at count-up tedious? | Count pieces. | Same. If tedious, pre-bag and switch the item to count by bag (bundle size 1, price $1). |
| Is a lineup of 4–6 items right? | Suggest 3 snacks + 2 treats. | Watch sell-outs and leftovers over the first few sale days. |
| Is ±$3 / ±$10 the right over/short tolerance? | Yes. | Review after 5 sale days of real data. |

## Product

| Question | Working assumption |
|---|---|
| Item cost: latest purchase cost or weighted average? | **Weighted average** of stock on hand when a purchase arrives. The prototype used the latest cost. |
| Deal items where sold pieces aren't a multiple of the deal size (e.g. 25 mini bars at 2 for $1). | Expected cash uses fractional deals, rounded to the cent. A kid could also buy a single piece at half price; not handled. Watch in practice. |
| Should an item be retired (hidden) when it's been at 0 stock for a while? | Items with 0 stock are hidden from the lineup picker automatically; add an **Archive** action on the Items tab. |
| What does the Sell helper do with a price edited mid-sale? | Uses the locked price. Already the rule. |
| Who can be treasurer? Can there be two? | One treasurer account, set by the admin. |

## Treasurer email

| Question | Working assumption |
|---|---|
| Treasurer's email address, and the day and time to send. | Monday 7:00 America/Vancouver. Address set by the admin in Settings. |
| Does the PAC need the **paper** receipts too? | Probably. Buyers keep paper receipts in an envelope in the cash box. Ask the treasurer. |
| Link expiry. | 7 days, single use. Supabase magic links can't last that long, so the build uses its own signed action tokens (see `DATA_MODEL.md`). |
| Which week does "Deposits" cover? | Monday to Sunday before the send date. |

## School and hosting

| Question | Working assumption |
|---|---|
| Does the product mix meet the school's food guidelines? BC schools apply the provincial school food guidelines to food sold to students, and some districts list candy and fried chips as not allowed. | Coordinator to confirm with the principal or PAC. Not enforced in the app. |
| Hosting and domain. | Vercel or Netlify free tier on a default subdomain. |
| Supabase plan. | Free tier. Note that free projects pause after a period of inactivity, so the weekly email job keeps it awake during the school year. Check current limits before launch. |
| Email sending service. | Resend (or any provider with a free tier) from a Supabase Edge Function. |
| Backups. | Supabase's daily backups on paid plans, or a weekly `pg_dump` via GitHub Actions on the free plan. |

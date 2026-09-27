# Decisions

Each decision was made with the coordinator while designing the prototype (September 2026). Before changing any of these, read the reason. The **Dropped** section lists ideas that were tried and removed on purpose.

## Operations

| # | Decision | Reason |
|---|---|---|
| D1 | **Count stock at the end instead of recording each sale.** | The line of kids is too fast to tap an app per sale. Two counts (stock, cash) give sales, stock and a cash check with far less effort. |
| D2 | **Lineup of 4–6 items per sale day**, chosen before selling. | Storage holds many SKUs, but only a few go out. Counting only the lineup keeps count-up fast; items in storage aren't touched. |
| D3 | **Bring out whole boxes**, not a portion. | Simplest to understand: pick the lineup, check the boxes, sell, count what's left. Partial pull-outs would need a "brought out" count and a "returned" count. |
| D4 | **Check stock before selling**, recording Missing / Damaged / Found. | Losses are found before any money changes hands, so the cash over/short measures only the cash. |
| D5 | **Price, deal size and type lock at Start sale.** | Sales are worked out as units × price. That only holds if one price applies all day. Edits during a sale apply from the next sale day. |
| D6 | **Fixed change float** (default $30). | Volunteers always know what to leave in the box. |
| D7 | **Over/short tolerance ±$3 ok, ±$10 warn.** | Small differences are normal with kids. Bigger ones get one recount and a note. |
| D8 | **Two-person sign-off** by two different signed-in volunteers. | Protects volunteers as much as the money. Signed-in identity replaces typed initials. |
| D9 | **Student helper credit** is a $1 no-cash deduction from expected cash. | Recorded as a helper reward, not a loss or a cash shortage. |
| D10 | **Leftovers before summer are donated** and logged as a stock movement. | Stock should be cleared before summer; donation keeps the books balanced. |
| D11 | **Wording:** "Sale day", "Count up", "Change float", "Target stock", "Over/short", "Out". | The sale is after lunch, not at recess. "Session", "close-out", "par" and "variance" were jargon to volunteers. |

## Products and prices

| # | Decision | Reason |
|---|---|---|
| P1 | **Two types only: Snack and Treat.** | The only split the rules need (max 1 treat). A third "treat in freezer" type caused inconsistent grouping. |
| P2 | **Storage (Shelf / Freezer) is a separate field and only a label** (❄ Freezer). | Tells volunteers where to fetch a box. Kept separate from type so a frozen snack is possible and rule checks never have to list two treat values. |
| P3 | **Assorted variety packs are one item** ("Chips, assorted"). | Splitting a Costco box into flavours is too much work for volunteers. The optional count-up note ("BBQ gone first") captures flavour feedback. |
| P4 | **Deals such as "2 for $1" are one price option; stock counts pieces.** | Very cheap items (mini bars at 13.8¢) need a deal price to make sense. Counting pieces means no pre-bagging. A deal counts as one item and one treat. |
| P5 | **No pre-bagging for now.** | The team has no time. Revisit after the first real sale (see `OPEN_QUESTIONS.md`). |
| P6 | **The buyer sets the price, helped by suggestions.** Anyone can change it later. No voting or approval. | Easiest, most casual, lowest friction. |
| P7 | **Price options: $1, $2, 2 for $1, 3 for $1.** | Covers whole-dollar cash prices kids understand. |
| P8 | **Five margin bands:** Great deal ≥60%, Good 45–60%, Fair 30–45%, Low margin 0–30%, At a loss <0%. | "Low margin" states a fact without saying don't buy; the buyer may have a reason. "At a loss" always shows the amount lost. |
| P9 | **Lineup shows its overall margin.** | A low-margin item is fine when the table as a whole makes money. |
| P10 | **Items tab** is the one place to edit price, type, storage and name. | Previously type could only be set when creating an item and there was no way to fix it. |
| P11 | **New items can wait for a price** ("Decide later"); they can't go in a lineup until priced. | Lets the buyer log the receipt now and settle the price later. |

## Buying and money

| # | Decision | Reason |
|---|---|---|
| B1 | **"What to buy" is guidance, not a shopping list.** It shows gaps by type, not products. | The buyer buys based on availability, sales and new finds. |
| B2 | **Target is about 2 sale days of stock.** | That's what storage holds. Trips are irregular (weekly or longer). |
| B3 | **Deal check** calculator in the Buy tab, with a GST toggle on by default. | Judge a box in the aisle: margin, profit on the box, compared with usual cost, how long it lasts. Snack foods usually carry GST at the till. |
| B4 | **Shopping trip claim** ("I'm going shopping"). | Stops two people buying the same things. Any free volunteer can shop. |
| B5 | **Buyers pay with their own money; every purchase is a reimbursement claim** with a required receipt photo. No spending limit. | How the team works today. |
| B6 | **No Approve step.** Status is To pay → Paid. | Paying the claim is the approval. |
| B7 | **Treasurer doesn't use the app.** Weekly email with deposits, reimbursements per volunteer, CSV attached, and one-time "Mark paid" links tied to a treasurer account. | They act weekly for a few minutes and the role changes most years. The account behind the links gives a real audit trail and lets links expire. |
| B8 | **Reimbursements grouped per volunteer.** | The treasurer likely sends one e-transfer per person. |

## Technical

| # | Decision | Reason |
|---|---|---|
| T1 | **Vite + React + TypeScript, shadcn/ui + Tailwind, TanStack Query, Supabase.** Static SPA hosting (Vercel or Netlify free tier). | Coordinator's stack is TypeScript, Node and Supabase. No server rendering needed. shadcn components are owned in the repo and accessible (Radix). |
| T2 | **Not refine.dev.** | It suits CRUD admin panels. Most of this app is workflow screens (count-up, lineup, sell helper) that would fight its abstractions. |
| T3 | **Business maths lives in Postgres** (views and functions), not the browser. | One source of truth; the frontend stays thin; easy to test in SQL. |
| T4 | **Stock is an append-only ledger.** | No lost updates when several people act at once, and it's its own audit trail. |
| T5 | **Status changes go through guarded functions**; items use a `version` column for optimistic concurrency. | Prevents double-finishing and silent overwrites. |
| T6 | **Realtime only on the Sale day screen**, plus Presence. | The only place two people work at once. |
| T7 | **Offline-safe count-up** with client-generated IDs. | School Wi-Fi is unreliable. |
| T8 | **Rule-based insights, no LLM.** | Numbers must be exact for the treasurer; rules are free, instant and predictable. An LLM could later reword computed facts, never compute them. |
| T9 | **Each volunteer signs in on their own phone** with an email magic link that lasts all term. | Makes audit, presence and sign-off meaningful. |

## Dropped (don't reintroduce without discussion)

| Idea | Why it was dropped |
|---|---|
| Recording every transaction at the till | Too slow for a line of kids. |
| Par-level shopping list with fixed products | Buyers choose by availability, sales and new finds. Replaced by "What to buy" guidance. |
| Pre-bagging deal items | No volunteer time. May revisit after the first sale. |
| Splitting variety packs into flavours | Too much work. |
| Bringing out part of a box | Harder to understand than whole boxes. |
| Separate **clearance / sale price** (one-day or timed) | Confusing. A price change on the Items tab does the same job. |
| **Healthy pick** tag | No clear definition, more mental load for the buyer. |
| Approve step before paying a claim | The treasurer paying is the approval. |
| Treasurer login and screens | They only need the weekly email and one-tap actions. |
| Storage-based third type ("treat, freezer") | Inconsistent groups. Storage became a separate label. |
| AI-generated insight text | See T8. |
| Typed initials for sign-off | Replaced by two signed-in users. |

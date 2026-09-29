# Snack Shack: handoff

This document is the source of truth for what Snack Shack does: background, screens and business rules. The reasons behind decisions are in the ADRs. Read it before writing code. The companion files are:

| File | What it covers |
|---|---|
| [`../CONTEXT.md`](../CONTEXT.md) | Glossary: the words to use, and the ones to avoid |
| [`adr/`](adr/) | Every product and technical decision, with the reason, including ideas that were tried and rejected |
| [`DATA_MODEL.md`](DATA_MODEL.md) | Tables, views, database functions, access rules, audit trail |
| [GitHub issues](https://github.com/calvincchan/snack-shack/issues) | Build tickets (`ready-for-agent`) and open questions (`needs-info`) |
| [`prototype/`](prototype/) | The clickable prototype (`snack-shack-prototype.html`) and phone-size screenshots |

The prototype is a single-file vanilla JS mock with fake data. It shows the agreed flows and wording, not the code structure to copy. Rebuild it properly; match its behaviour and copy.

---

## 1. Background

Snack Shack is a snack table run by parent volunteers at an elementary school in British Columbia, Canada. It raises money for the school's PAC (Parent Advisory Council).

- **When:** during the free time after lunch, about **15–20 minutes**, on irregular days. One of these is a **sale day**.
- **Kids:** students aged **5 to 12**.
- **Payment:** **cash only**, mostly loonies and toonies. Prices are whole dollars: **$1**, **$2**, or a deal such as **"2 for $1"**.
- **Rules for kids:** each kid can buy **up to 3 items**, of which **at most 1 is a treat** (sugary).
- **What is sold:** chips, crackers, popcorn and similar **snacks**; candy, chocolate, granola bars, popsicles and ice-cream bars as **treats**. Bought in bulk from Costco and grocery stores.
- **Buying:** whoever is free goes shopping, pays with their **own money**, and is **reimbursed by the PAC treasurer**.
- **Storage:** small. Shelf bins plus a freezer, about **2 sale days' worth** of stock in total.
- **Student helper:** usually one student helps at the table and earns a **$1 snack credit** per sale day.
- **End of year:** stock should be sold down before summer break. Leftovers are **donated** to a food bank.
- **People:** volunteers change every year and have little time. Everything must be low effort, low training and hard to get wrong.

### What the app is for

1. Keep **stock** accurate without logging every sale.
2. Make the **cash** check at the end of each sale quick and trustworthy.
3. Make **buying** easy: know what's needed, judge whether a deal is good, log the receipt once.
4. Get **reimbursements** to the treasurer cleanly.
5. Show simple **insights**: what sells, margins, cash accuracy.

### The core idea: count stock, don't record sales

The line of kids is too fast for anyone to tap an app per sale. So the app never records individual sales. Instead:

```
units sold      = pieces at start of sale − pieces left − pieces out during sale
sales ($)       = Σ units sold × price per piece        (price locked when the sale started)
expected cash   = change float + sales − helper credits
over / short    = cash counted − expected cash
```

Everything else (stock levels, insights, what to buy) follows from these counts and the purchase receipts.

---

## 2. People and roles

| Role | Who | Uses the app for | Login |
|---|---|---|---|
| **Volunteer** | Any parent on the team | Sale day, Sell helper, buying, Items, Insights | Own phone, own account (email magic link, stays signed in all term) |
| **Treasurer** | PAC treasurer | Paying reimbursements | **Does not open the app.** Gets a weekly email. Each "Mark paid" button in the email is a one-time signed link that records the payment as them. |
| **Admin** | The coordinator (the person commissioning this app) | Adding and removing volunteers, settings | Same as volunteer, plus the admin screens |

Every volunteer uses their **own phone and their own login**. That makes the audit trail meaningful, the live "who's doing what" indicator possible, and the sign-off real.

---

## 3. Glossary

The glossary lives in [`CONTEXT.md`](../CONTEXT.md). Use its words in the UI and code, and avoid the ones it lists under _Avoid_ (session, close-out, par, variance, …).

Spelling: **Canadian English** in all UI copy (colour, centre, cheque), keeping "-ize" endings (organize).

---

## 4. Screens and flows

Bottom tab bar, five tabs: **Sale day · Sell · Buy · Items · Insights**. Mobile first; design for a phone held in one hand at a busy table. See `prototype/screens/` for each screen.

### 4.1 Sale day

A sale day moves through four phases, shown as a step bar. The phase is stored on the server so every volunteer's phone shows the same one.

**1. Lineup.** The app pre-selects a suggested lineup (see §5.6). Volunteers tap items to add or remove.
- Items are grouped **Snacks** and **Treats**. Each shows price, pieces in storage and a reason tag if suggested: *New*, *Sold out lately*, *Slow seller*, *Not out for N sales*.
- Only priced, active items with stock > 0 can be picked.
- Bottom bar: "Today's lineup · about 56% margin" and "3 snacks · 2 treats". Guidance: 4–6 items, 1–2 treats.

**2. Check stock.** For each lineup item, the app shows the pieces it expects. Volunteers confirm or correct.
- Stepper per item, pre-filled with the expected count. A **Matches** button resets to expected.
- If the count is lower, pick **Missing** or **Damaged** (default Missing). If higher, it's recorded as **Found**.
- **Start sale** records the differences as stock adjustments, **locks each lineup item's price, deal size and type**, and moves to Selling.
- **Change float row** (after the items): shows what the box should hold (the Settings default). One **Matches** tap, or a whole-dollar stepper for the real total. Untouched means "as set"; Start sale is not blocked. The counted amount becomes this sale day's float (expected cash, over/short and deposit follow it) and passes to `start_sale`; the Settings default is unchanged. Nothing is saved before Start sale.
- Item differences found here do **not** affect the cash check, because they are fixed before any money changes hands. The float is fixed here too, so it counts from the counted amount.

**3. Selling.** Shows what's on the table with today's prices, any differences reported at the check, a link to the Sell helper, and **"Sale's over: count up"**.

**4. Count up**, three sub-steps:
1. **Count stock.** For each lineup item: stepper for pieces left (pre-filled with the starting count so volunteers only tap down), and an **Out** field. Live "Sold N · $X" per item; deal items show "Sold 24 pcs = 12 deals". Bottom bar shows items sold and sales so far.
2. **Count cash.** Helper credits stepper, then a stepper per denomination ($20, $10, $5, toonie, loonie, quarter, dime, nickel). Bottom bar shows counted vs expected with an over/short pill.
3. **Sign off.** Summary (items sold, sales, helper credits, float, expected, counted, over/short). Optional note: "What ran out first, or what kids asked for". **One volunteer** confirms. **Finish count-up** is disabled until someone has, and while any item shows more left than it started with.

**Done screen:** "Seal $X in the deposit bag". Write the date and the names on the bag, and leave the change float in the box. Stock updates; any price or type edits made during the sale take effect from now on.

Two phones will often work at once (typically one counts stock, one counts cash). They must see each other's entries live. See §6.

### 4.2 Sell (helper)

A quick calculator for the volunteer taking money. **Nothing here is saved.** The count-up does the bookkeeping, so the line never waits on the app.
- Tiles for today's lineup items only: name, price ("$1", "2 for $1"), Snack/Treat tag, ❄ label.
- Tapping adds to the basket. Tiles disable when the kid has **3 items** or already has **1 treat**. A deal counts as one item.
- Basket panel: total, "2 of 3 items", "1 of 1 treat", chips to remove, **Next kid** to clear.
- "Paid with" buttons ($1, $2, $5, $10, $20) show the change to give.

### 4.3 Buy

Three segments: **What to buy · Log purchase · Claims**.

**What to buy**
- **Shopping trip:** "I'm going shopping" claims the next trip so two people don't buy the same things. Others see "Yuki is going shopping, Thursday". The claimer can cancel.
- **Deal check** (in-aisle calculator), see §5.4. Inputs: shelf price, pieces in the box, Snack/Treat, "+5% GST included" toggle (on by default). **"Bought it"** carries the numbers into Log purchase.
- **Stock by type:** Snacks and Treats, each with a gauge against the 2-sale-day target, pieces on hand, average sold per sale day and "buy about N". Status: *Runs out next sale* / *About 1 sale day left* / *Covered for 2+ sale days*.
- **Tips from recent sales:** sold-out items, seasonal slowdowns, recent count-up notes.
- It is **guidance, not a shopping list.** The buyer buys whatever looks good.

**Log purchase** (one receipt = one claim)
- Date, store (Costco / Superstore / Walmart / Other), **Bought by** (the volunteer to reimburse).
- One card per receipt line: pick an existing item or **＋ New item** (name, Snack/Treat, Shelf/❄ Freezer), **pieces in total**, **cost incl. tax**. Assorted variety packs are **one item** (e.g. "Chips, assorted").
- Once pieces and cost are entered: cost per piece, a margin band pill, and price options ($1, $2, 2 for $1, 3 for $1) each with band and margin, one marked **Suggested**. New items can pick **Decide later** (they wait on the Items tab under *Needs a price* and can't go in a lineup).
- Receipt photo is **required**. Only snack lines are logged; personal items on the same receipt are left off.
- **Save and claim reimbursement:** adds the pieces to stock, updates item costs, creates the claim.

**Claims**
- Totals: owed to volunteers, reimbursed this term.
- **To pay**, grouped by volunteer. **Paid** list with payment reference.
- Preview of the weekly treasurer email (see §5.9).
- **Copy CSV ledger.**

### 4.4 Items

- **Needs a price:** new items logged with "Decide later". One tap on a price option activates the item.
- **All items:** name, New tag, ❄ label, pieces on hand, cost per piece, margin %, band pill, price. Tap to open the editor:
  - **Price:** the four options with band and margin; current one highlighted, suggested one marked.
  - **Type:** Snack / Treat.
  - **Storage:** Shelf / ❄ Freezer.
  - **Name kids see.**
  - **Archive this item:** it stays in the history but is no longer offered in a lineup or shown in the list. *Show archived items* brings the list back, and the editor puts one back on the list.
- During a sale, a note says prices and types are locked for today and changes apply from the next sale day. A changed item shows "today $2" or "today still a treat".
- Anyone on the team can edit any item. There is **no separate sale or clearance price**; to discount old stock, change the price.

### 4.5 Insights

Read-only, term to date.
- Tiles: sales, profit after stock cost and helper credits, items sold, net over/short (and how many sales were outside ±$3).
- Bar chart: sales by sale day.
- **"What the numbers say":** rule-based sentences (§5.8). Not AI-generated.
- Count-up notes, newest first.
- **Items by sales per day out:** days in a lineup, pieces per day out, sales. Only counts days the item was in the lineup, so items offered less often compare fairly.
- Cash check history: date, volunteers, items out, counted, over/short pill.

### 4.6 Signing in

- One screen: an email box and **Send me a link**. Following the link signs the volunteer in and keeps them signed in, on that phone, all term.
- Signed in but not on the team: **"Ask the coordinator to add you"** and nothing else. Same screen for a volunteer who has been taken off the team.
- The header has the signed-in volunteer's name, a way to sign out, and, for the coordinator, **Team and settings**.

### 4.7 Team and settings (coordinator only)

Reached from the header, not the tab bar, because it is rarely used. Two segments:

- **Team.** Add a volunteer with email, name and role (Volunteer / Coordinator / Treasurer). Someone who has never signed in shows under **Waiting to sign in** until they do; the coordinator can cancel that invite. **Remove** takes a volunteer off the team; they stay in the list under **Off the team** so the audit trail keeps their name, and **Add back** returns them. The coordinator cannot remove themselves, and the team always keeps one coordinator.
- **Settings.** Change float, target stock in sale days, the two over/short thresholds, GST rate, kid limits and the treasurer email (§5.10).

Everyone else who opens the screen is told only the coordinator can change these, and row level security refuses the writes anyway.

---

## 5. Business rules and formulas

Money is stored as **integer cents**. Stock is stored as **pieces** (single bars, bags, popsicles), even for deal items.

### 5.1 Prices and deals

- Price options offered everywhere: **$1**, **$2**, **2 for $1**, **3 for $1**. Stored as `price_cents` + `bundle_size` (pieces per deal).
- Price per piece = `price_cents / bundle_size`.
- A deal counts as **one item** and, for treats, **one treat** in the kid rules.
- Loose deal items are **not pre-bagged** (for now). Kids take 2 from the box; volunteers count pieces.

### 5.2 Cost per piece

- Receipt line cost is entered **including tax**. Cost per piece = line cost ÷ pieces.
- Item cost used for margins and Insights: **weighted average** across stock on hand when a new purchase arrives (see `DATA_MODEL.md`). The prototype used the latest purchase cost; weighted average is the decided rule (ADR-0008).

### 5.3 Margin bands

`margin = 1 − (cost per piece × bundle_size) ÷ price`

| Margin | Label | Colour token |
|---|---|---|
| ≥ 60% | **Great deal** | ok (green) |
| 45% to < 60% | **Good** | ok (green) |
| 30% to < 45% | **Fair** | warn (amber) |
| 0% to < 30% | **Low margin** | warn (amber) |
| < 0% | **At a loss** | bad (red), and show the amount: "Loses $0.08 each" |

Low margin and At a loss are allowed; the buyer may have a good reason. The lineup's overall margin reassures the team that one low-margin item is fine.

**Suggested price** (first rule that matches):
1. A **$1** option (single or deal) with margin 45–75%; if several, the highest margin.
2. **$2 single** with margin 45–85%.
3. Otherwise the option with the highest margin.

Example: Nestlé mini bars, $17.99 for 130 → 13.8¢ each → suggested **2 for $1** at 72%.

### 5.4 Deal check

Inputs: shelf price, pieces, type, GST toggle (default on, 5%).

```
total           = shelf price × (1.05 if GST else 1)
cost per piece  = total ÷ pieces
options         = price options with margins (5.3); rec = suggested
deals           = floor(pieces ÷ rec.bundle_size)
sales           = deals × rec.price
profit          = sales − total
usual cost      = average cost per piece of active, non-new items of the same type
rate            = average pieces sold per sale day, per item of the same type, on days it was in a lineup
sale days       = deals ÷ rate           (warn "big box, make sure it fits" when > 6)
```

Output: band pill with the suggested price and margin; cost each; deals × price = sales; profit or loss on the box; "Cheaper/Pricier than our usual treats ($0.52 each on average)"; "lasts about N sale days in the lineup"; all four options with band and margin; **Bought it** button.

### 5.5 Stock and the ledger

- Stock is a **ledger**. Nothing ever edits a stock number. Every change is a row: purchase (+), sold (−), out during sale (−), missing (−), damaged (−), found (+), donated (−), correction (±).
- Current stock = sum of the item's rows.
- Donations before summer are logged as **donated** movements.

### 5.6 Lineup suggestion

From active, priced items with stock > 0, pick the **top 3 snacks and top 2 treats** by score:

| Signal | Points |
|---|---|
| New (never in a lineup) | +40 |
| Sold out (closed at 0) in either of the last 2 sale days | +30 |
| Slow seller: pieces per day out < 60% of the average for its type | +35 |
| Sale days since last in a lineup, capped at 5 | +10 each |

The reason tag shown is the first that applies: *New* (never in a finished sale day), *Sold out lately*, *Slow seller*, *Not out for N sales* (N ≥ 2). The prototype also had *Not sold yet*; in the database that is the same as *New*.

Lineup margin estimate: weight each item by its pieces-per-day-out (15 if unknown): `1 − Σ(rate × cost) ÷ Σ(rate × price per piece)`.

### 5.7 Sale day maths and locks

For each lineup item on a sale day:

```
start pieces  = pieces counted at Check stock
sold pieces   = start − left − out
sales         = round(sold pieces × locked_price_cents ÷ locked_bundle_size)
```

```
expected cash = float + Σ sales − helper credits × 100
over/short    = counted − expected
deposit       = counted − float
```

- Over/short status: within **±$3** ok (green); within **±$10** warn (amber, "recount once, then add a note"); beyond that bad (red).
- **Locks:** at *Start sale*, each lineup item's price, deal size and type are copied onto the sale day. Edits to the item during the sale affect only later sale days.
- A **closed** sale day can't be edited. Mistakes are fixed with a correction stock movement, which keeps the original numbers.
- Deal items where sold pieces aren't a multiple of the deal size produce fractional deals. Sales are rounded to the cent. See issue #25.

### 5.8 Insights rules

Each rule is a query plus a sentence template. Show a sentence only when it applies. Current rules:

1. **Fading item:** an item's sales on its last day out fell well below its first day out this term (prototype: popsicles). "Leave them out of the lineup on cold days."
2. **Sold out:** an item closed at 0 on N of the D days it was out. "Bring more of it, or buy more next trip."
3. **Slowest mover:** lowest pieces per day out. "Try a lower price on the Items tab, or leave it out of the lineup for a while."
4. **Treat share:** treats as % of items sold.
5. **Losses at Check stock:** pieces missing or damaged, and their cost.

Possible later rules: over/short beyond ±$3 two sale days running; margin drop after a cost change; an item with no sales for 3 days out.

### 5.9 Claims and the treasurer

- Claim status: **To pay** → **Paid** (no Approve step).
- **Weekly email** (Monday morning) to the treasurer:
  - Subject: "Snack Shack week of Sep 21: $283.00 deposited, $75.70 to reimburse".
  - **Deposits:** each sale day that week with volunteers, deposit amount and over/short.
  - **To reimburse:** per volunteer, number of receipts, claim numbers (linked to receipt photos), total, and a **"Mark [name] paid"** button.
  - **CSV ledger** attached.
- Each button is a **one-time signed link** issued to the treasurer's account. It records the payment as the treasurer (audit trail shows who) and expires after 7 days.

### 5.10 Other rules

- **Sign-off:** one signed-in volunteer confirms; enforced by the database.
- **Shopping trip:** at most one open trip claim at a time; showing it is enough (no locking of purchases).
- **Settings** (admin): change float (default $30), target sale days (2), over/short thresholds ($3 / $10), GST rate (5%), kid limits (3 items, 1 treat), treasurer email.

---

## 6. Multiple phones, live updates, audit

- **Add rows, don't edit shared numbers.** Stock is a ledger; purchases are inserts. Nothing to collide on.
- **Sale day status** moves forward only through database functions that check the current status (e.g. finish only if still counting). Two taps at once: one wins, the other is told it's already done.
- **Counts are per row** (sale day × item, sale day × coin), so two volunteers counting different things never touch the same row.
- **Rare real collisions** (item edits) use a `version` column: save only if unchanged since loaded; otherwise show "Yuki changed this to $2 a minute ago. Keep yours or hers?"
- **Live updates only on the Sale day screen:** Supabase Realtime on sale day rows and counts, plus Presence ("Yuki is counting cash"). Other tabs refetch on focus.
- **Offline:** the count-up must survive a Wi-Fi drop. Queue writes locally with client-generated UUIDs so retries don't duplicate.
- **Audit trail:** every row records who created and last changed it; a shared trigger writes old and new values to `audit_log` for the tables that matter. Show history where useful ("BBQ chips count changed 14 → 12 by Yuki at 12:58").

---

## 7. Visual design

The prototype's look was approved. Carry it over as shadcn/ui theme tokens.

| Token | Light | Dark |
|---|---|---|
| background | `#F2F4EF` | `#10161B` |
| surface (card) | `#FFFFFF` | `#19222A` |
| sunk (muted bg) | `#E8ECE5` | `#0C1216` |
| ink (foreground) | `#17212A` | `#E7ECE8` |
| muted text | `#5A6670` | `#94A2AA` |
| border | `#D9DFD6` | `#2A363F` |
| accent (primary) | `#F2A900` | `#F5B82E` |
| accent soft | `#FFF1C7` | `#3A2E10` |
| accent ink (text on accent) | `#3A2900` | `#241900` |
| treat / treat bg | `#D1443B` / `#FCE4E1` | `#F0766C` / `#3B1F1D` |
| snack, ok / bg | `#2D8A55` / `#DDF1E4` | `#5CC98A` / `#15301F` |
| warn / bg | `#A8681A` / `#FCEFD6` | `#E6AE55` / `#382A12` |
| bad / bg | `#C2352C` / `#FBE1DE` | `#F0766C` / `#3B1F1D` |

- Fonts: **Bricolage Grotesque** (headings, big numbers) and **Figtree** (body). Tabular numbers wherever digits line up.
- Touch targets **44–48 px**. Steppers are − / number / + with a 44 px square button each.
- Treats have a red dot, snacks a green dot, everywhere an item appears.
- Every button sets its own text colour. The prototype had a bug where a button inherited reversed text colour from a dark panel.
- Light and dark mode both required, following the system setting.

---

## 8. Out of scope (for now)

Per-sale logging, card payments, barcode scanning, pre-bagging, splitting variety packs into flavours, separate sale/clearance prices, a "healthy pick" tag, an approval step for claims, AI-written insights, multiple schools. Reasons are in [`adr/`](adr/).

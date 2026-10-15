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
- **Rules for kids:** loosely, up to 3 items and 1 treat each. Volunteers enforce it at the table; the app doesn't.

- **What is sold:** chips, crackers, popcorn and similar **snacks**; candy, chocolate, granola bars, popsicles and ice-cream bars as **treats**. Bought in bulk from Costco and grocery stores.
- **Buying:** whoever is free goes shopping, pays with their **own money**, and is **reimbursed by the PAC treasurer**.
- **Storage:** small. Shelf bins plus a freezer, about **2 sale days' worth** of stock in total.


- **End of year:** stock should be sold down before summer break. Leftovers are **donated** to a food bank.
- **People:** volunteers change every year and have little time. Everything must be low effort, low training and hard to get wrong.

### What the app is for

1. Make the **cash** count at each sale quick, and know each sale day's **revenue**.
2. Make **buying** easy: judge whether a deal is good, log the receipt once.
3. Get **reimbursements** to the treasurer cleanly before each PAC meeting.
4. Show simple **insights**: revenue against spending, and roughly what sells.

### The core idea: count the cash, not the stock

The first real sale day showed there's no time to count stock around a sale (ADR-0015). So a sale day is two cash counts:

```
revenue  = close count − open count
deposit  = close count − left in box
```

Stock is counted occasionally, about once a term (ADR-0016). Purchases add to stock; sale days don't touch it.

---

## 2. People and roles

| Role | Who | Uses the app for | Login |
|---|---|---|---|
| **Volunteer** | Any parent on the team | Sale day, buying, Items, Stock count, Insights | Own phone, own account (email magic link, stays signed in all term) |
| **Coordinator** (admin) | The person commissioning this app | Also: team and settings, logging purchases for others, sending claims to the treasurer, marking claims paid | Same as volunteer, plus the admin screens |
| **Treasurer** | PAC treasurer | Paying claims by cheque at the monthly PAC meeting | **Does not open the app.** Gets the claims email when the coordinator sends it. Only an email address in Settings. |

Every volunteer uses their **own phone and their own login**. That makes the audit trail and the sign-off meaningful.

---

## 3. Glossary

The glossary lives in [`CONTEXT.md`](../CONTEXT.md). Use its words in the UI and code, and avoid the ones it lists under _Avoid_ (session, close-out, inventory, sales, …).

Spelling: **Canadian English** in all UI copy (colour, centre, cheque), keeping "-ize" endings (organize).

---

## 4. Screens and flows

Bottom tab bar, four tabs: **Sale day · Buy · Items · Insights**. Mobile first; design for a phone held in one hand at a busy table. See `prototype/` for each screen.

### 4.1 Sale day

A sale day is **open** or **closed** (ADR-0015). The phase is stored on the server so every volunteer's phone shows the same one, and Realtime keeps two phones in step.

**No open sale day.** Last sale day's revenue and deposit, and **Open a sale day** with a date (default today; any past date, one sale day per date).

**Open count.** A stepper per denomination ($20, $10, $5, toonie, loonie, quarter, dime, nickel) with a running total. Above it: "Left in the box last time: $30.00". If the total differs, a warning ("$2.00 less than left last time") and an optional note. Never blocks. **Start selling** saves the count. **Cancel this sale day** deletes one opened by mistake (wrong date), only before selling starts.

**Selling.** Shows the open count and **Sale's over: count the cash**.

**Close count.** The same denomination steppers. Bottom bar: counted and revenue so far (close − open). Then **Left in box** (default: the change float setting) and the deposit it gives. Optional note: "What ran out, or what kids asked for". **Close sale day** saves the count and closes the sale day; the volunteer who taps it is the sign-off.

**Done screen:** "Seal $X in the deposit bag". Write the date and names on the bag, and leave $Y in the box.

Two phones may work at once. Counts are one row per sale day × count × coin, so they see each other's entries live and never collide.

### 4.2 Buy

Three segments: **Log purchase · Claims · Deal check**.

**Deal check** (in-aisle calculator), see §5.4. Inputs: shelf price, pieces in the box, Snack/Treat, "+5% GST included" toggle (on by default). **"Bought it"** carries the numbers into Log purchase.

**Log purchase** (one receipt = one claim)
- Date, store (Costco / Superstore / Walmart / Other), **Bought by** (the volunteer to reimburse). Volunteers log their own; only the coordinator sees the picker and can log for someone else.
- One card per receipt line: pick an existing item or **＋ New item** (name, Snack/Treat, Shelf/❄ Freezer), **pieces in total**, **cost incl. tax**. Assorted variety packs are **one item** (e.g. "Chips, assorted").
- Once pieces and cost are entered: cost per piece as plain text. No price is set here. A new item waits on the Items tab under *Needs a price*; an existing item keeps its price.
- Receipt photo is **required**, shrunk on the phone to about 1600 px JPEG before upload. Only snack lines are logged; personal items on the same receipt are left off.
- **Save and claim reimbursement:** adds the pieces to stock, updates item costs, creates the claim.

**Claims**
- Totals: owed to volunteers, reimbursed this term. All totals use the **net** of each claim (receipt total minus refunds).
- **To pay**, one card per volunteer with their claims and total. Coordinator: **Mark paid** on the card opens a dialog with paid date (default today) and an optional **paid note** ("Cheque #142"); it marks all that volunteer's listed claims paid. A single claim can be marked paid from its details.
- **Paid** list with paid date and note. Coordinator: **Mark unpaid** on a paid claim's details puts it back in To pay.
- Tap a claim to see its lines like the receipt.
- **Send claims to treasurer** (coordinator): sends the email in §5.9 now. Shows "Last sent on Oct 13 by Calvin". A preview shows what will be sent.
- **Refund** (To pay claims, buyer or coordinator only): opens a dialog with item picker (lines with pieces left), **pieces returned**, **refund amount**, **refunded on** (default today), optional note and optional slip photo. Pieces and amount start as everything left on the line; changing the pieces reworks the amount as cost left × pieces ÷ pieces left until the volunteer types an amount. Hint: "Worked out from the receipt, tax included. Check it against the refund slip."
- Refunds print under their line as minus lines, with **Undo** while the claim is To pay. The returned pieces leave stock; undo puts them back. Refused after the claim is Paid or past the pieces left or on hand. Unit cost is not recalculated (ADR-0013).
- A claim refunded to $0 drops out of To pay and shows under **Paid** as "Refunded".
- **Copy CSV ledger.** Total is net; a **Refunded** column shows the refunds.

### 4.3 Items

- **Needs a price:** new items logged in Log purchase. Each shows cost per piece and the price options with band, margin and a **Suggested** marker. One tap on a price option prices the item.
- **All items:** name, New tag, ❄ label, stock ("Counted 24 on Oct 1 · bought 48 since", or "Not counted · bought 48"), cost per piece, margin %, band pill, price. Tap to open the editor:
  - **Price:** the four options with band and margin; current one highlighted, suggested one marked.
  - **Type:** Snack / Treat.
  - **Storage:** Shelf / ❄ Freezer.
  - **Name kids see.**
  - **Archive this item:** it stays in the history but is no longer shown in the list. *Show archived items* brings the list back, and the editor puts one back on the list.
- **Count stock** button opens §4.4.
- Anyone on the team can edit any item, and changes apply at once. There is **no separate sale or clearance price**; to discount old stock, change the price.

### 4.4 Stock count

About once a term (ADR-0016). Any volunteer, any time.
- Every active item, grouped by storage (Shelf, then ❄ Freezer) so volunteers walk the room once. Each row: a stepper (blank until touched) and "last counted 24 on Oct 1".
- Skipped items stay uncounted. **Save count** posts one `count` movement per counted item for the difference from the ledger, and shows "Saved 12 items".
- Saving twice on the same day is fine; the second save posts only the new difference.

### 4.5 Insights

Read-only, term to date.
- Tiles: revenue, spent on stock (net claims), revenue minus spending, sale days.
- Bar chart: revenue by sale day.
- **By month:** revenue, net claims, difference.
- **"What the numbers say":** rule-based sentences (§5.8). Not AI-generated.
- Sale day notes, newest first.
- **Items since the last stock count:** pieces gone between each item's last two counts, with price, cost and margin. Shown only once an item has two counts; until then "Count stock twice to see what sells".
- Cash history: date, who closed, open, close, revenue, deposit, and the open-count warning if any.

### 4.6 Signing in

- One screen: an email box and **Send me a link**. Following the link signs the volunteer in and keeps them signed in, on that phone, all term.
- Signed in but not on the team: **"Ask the coordinator to add you"** and nothing else. Same screen for a volunteer who has been taken off the team.
- The header has the signed-in volunteer's name, **Edit profile** (their own display name and full name, never their role), a way to sign out, and, for the coordinator, **Team and settings**.

### 4.7 Team and settings (coordinator only)

Reached from the header, not the tab bar, because it is rarely used. Two segments:

- **Team.** Add a volunteer with email, name and role (Volunteer / Coordinator). Someone who has never signed in shows under **Waiting to sign in** until they do; the coordinator can cancel that invite. **Remove** takes a volunteer off the team; they stay in the list under **Off the team** so the audit trail keeps their name, and **Add back** returns them. The coordinator cannot remove themselves, and the team always keeps one coordinator. Tapping a person or an invite opens **Edit** for display name, full name and role. Adding an email that is already on the team, off the team or invited is refused and points at Edit or Add back instead. Display names are at most 30 characters and unique across the team and open invites, ignoring case; full names at most 100 (ADR-0014).
- **Settings.** Change float (default left in box), GST rate and the treasurer email (§5.10).

Everyone else who opens the screen is told only the coordinator can change these, and row level security refuses the writes anyway.

---

## 5. Business rules and formulas

Money is stored as **integer cents**. Stock is stored as **pieces** (single bars, bags, popsicles), even for deal items.

### 5.1 Prices and deals

- Price options offered everywhere: **$1**, **$2**, **2 for $1**, **3 for $1**. Stored as `price_cents` + `bundle_size` (pieces per deal).
- Price per piece = `price_cents / bundle_size`.
- Loose deal items (mini bars) are **not pre-bagged**. Kids take 2 from the box; volunteers count pieces.
- **Bulk candy bought by weight** is bagged by volunteers, about 65–70 g a bag. Log the purchase as an estimated bag count (1 kg ≈ 15 bags, 1.2 kg ≈ 18); a bag is the piece, bundle size 1, priced $1 or $2 a bag. The next stock count absorbs the estimate's error.

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

Low margin and At a loss are allowed; the buyer may have a good reason.

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
```

Output: band pill with the suggested price and margin; cost each; deals × price = sales; profit or loss on the box; "Cheaper/Pricier than our usual treats ($0.52 each on average)"; all four options with band and margin; **Bought it** button. (The old "lasts about N sale days" line needed per-day sales and is gone, ADR-0016.)

### 5.5 Stock and the ledger

- Stock is a **ledger**. Nothing ever edits a stock number. Every change is a row: purchase (+), count (±, the difference at a stock count), donated (−), returned (−, a refund), correction (±, including the + that undoes a refund). Rows from before ADR-0015 may also be sold, out, missing, damaged or found.
- Current stock = sum of the item's rows. Sale days don't post anything, so it's only accurate right after a stock count; the app shows "counted · bought since" instead.
- **Bought since** = purchase rows minus returned rows since the item's last count.
- **Pieces gone** between two counts = −(the later count row's quantity). It covers sold, eaten and lost.
- Donations before summer are logged as **donated** movements.

### 5.6 Sale day maths

```
revenue  = close count − open count
deposit  = close count − left in box
```

- **Open warning:** when the open count differs from the previous closed sale day's left in box (by date). Shown, never blocking; optional note.
- **Left in box** defaults to the change float setting and may be anything from $0 to the close count.
- A **closed** sale day can't be edited. One sale day per date; one open at a time.

### 5.7 Item insights

```
pieces gone  = −count row quantity at the latest count
revenue est. = pieces gone × price ÷ bundle size     (current price)
margin       = §5.3 at the current cost
```

An estimate only: it can't tell sold from lost, and prices may have changed between counts.

### 5.8 Insights rules

Each rule is a query plus a sentence template. Show a sentence only when it applies. Current rules:

1. **Best month:** the month with the highest revenue minus claims.
2. **Revenue trend:** the last sale day's revenue against the average. "Revenue $12 above the usual $85."
3. **Open count off:** sale days whose open count didn't match the last left in box this term. "Check the box between sale days."
4. **Slowest mover:** the item with the fewest pieces gone between its last two counts. "Try a lower price on the Items tab."
5. **Low margin stock:** items in a Low margin or At a loss band with stock bought since the last count.

### 5.9 Claims and the treasurer

- Claim status: **To pay** → **Paid** (no Approve step). Paid claims record paid date, who marked them and an optional paid note.
- **Claims email**, sent when the coordinator taps **Send claims to treasurer** (ADR-0017), usually 1–2 days before the monthly PAC meeting:
  - Subject: "ATTN: Treasurer: Snack Shack claims".
  - **To reimburse:** per volunteer (display name plus full name when set, e.g. "Calvin C (Chun Yu Chan)", the name on the cheque), claim numbers with date, store and amount, and the total for the cheque.
  - **Deposits:** each sale day closed since the last send with date, who closed it, revenue and deposit.
  - **Receipt photos attached**, named by claim number ("SS-003.jpg"). No links.
  - **CSV ledger** attached.
- Claims use their **net** (receipt minus refunds). The email shows net and notes a refund ("SS-002 $32.00, incl. $8.00 refund"). A claim at net $0 is left out. The CSV has a **Refunded** column and calls such a claim "Refunded".
- Every send lists all To pay claims at that moment. The app records each send (when, who, to whom) for "Last sent on …".
- **Mark paid** (coordinator only) takes the claims and the total the coordinator saw. It refuses if any claim is no longer To pay or the net total changed: "A claim changed since you loaded this list. Check it and try again."
- **Mark unpaid** (coordinator only) puts a paid claim back in To pay.

### 5.10 Other rules

- **Sign-off:** the signed-in volunteer who closes the sale day; enforced by the database.
- **Logging for others:** only the coordinator can log a purchase with another volunteer as the buyer.
- **Settings** (admin): change float (default $30, the default left in box), GST rate (5%), treasurer email.

## 6. Multiple phones, live updates, audit

- **Add rows, don't edit shared numbers.** Stock is a ledger; purchases are inserts. Nothing to collide on.
- **Sale day phase** moves forward only through database functions that check the current phase. Two taps at once: one wins, the other is told it's already done.
- **Counts are per row** (sale day × open/close × coin), so two volunteers counting never touch the same row.
- **Rare real collisions** (item edits) use a `version` column: save only if unchanged since loaded; otherwise show "Yuki changed this to $2 a minute ago. Keep yours or hers?"
- **Live updates only on the Sale day screen:** Supabase Realtime on sale day rows and counts. Other tabs refetch on focus.
- **Connection:** counting needs a connection. Writes are plain online mutations; a failed write shows a clear error and "Not saved" until that row saves again. Purchases keep client-generated UUIDs so a retry doesn't duplicate (ADR-0012).
- **Audit trail:** every row records who created and last changed it; a shared trigger writes old and new values to `audit_log` for the tables that matter.

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

Per-sale logging, stock counts on sale days, a Sell helper or kid rules in the app, card payments, barcode scanning, pre-bagging, splitting variety packs into flavours, separate sale/clearance prices, a "healthy pick" tag, an approval step for claims, e-transfer or one-tap payment links, AI-written insights, multiple schools. Reasons are in [`adr/`](adr/).

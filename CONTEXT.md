# Snack Shack

A snack table run by parent volunteers after lunch at a BC elementary school, raising money for the PAC. The app counts the cash at each sale, and handles buying, occasional stock counts and reimbursements. Words here were chosen with the volunteers; avoid retail jargon.

## Language

### People

**Volunteer**:
A parent on the team who runs sale days, buys stock and edits items, each on their own phone and login.
_Avoid_: User, staff, cashier

**Coordinator**:
The volunteer who also manages the team list and settings (the admin role).
_Avoid_: Manager, owner

**Treasurer**:
The PAC treasurer who pays claims by cheque at the monthly PAC meeting, from an email the coordinator sends. Never opens the app.
_Avoid_: Approver, accountant

**Display name**:
The short name the team knows someone by, shown on sign-offs, claims and change history. At most 30 characters and unique on the team.
_Avoid_: Nickname, username

**Full name**:
The name on someone's cheque, optional, shown only in the treasurer email.
_Avoid_: Legal name, bank name, real name

**Kid**:
A student (aged 5–12) buying at the table.
_Avoid_: Customer, shopper

### Sale day

**Sale day**:
One after-lunch selling period, from the open count to the close count. Either **open** or **closed**.
_Avoid_: Session, shift, recess sale

**Open count**:
Counting the cash box by denomination when a sale day opens. Warns, without blocking, when it differs from the last left in box.
_Avoid_: Opening balance, pre-count

**Close count**:
Counting the cash box by denomination when selling ends.
_Avoid_: Close-out, reconciliation, count up

**Left in box**:
The cash that stays in the box after the close count, for the next sale day's change.

**Revenue**:
Close count minus open count for one sale day.
_Avoid_: Sales, takings, income

**Sign-off**:
The volunteer who submits the close count, recorded by the database.
_Avoid_: Approval, initials

**Change float**:
The cash usually left in the box for making change (normally $30); the default for **left in box**.
_Avoid_: Float, till, starting cash

**Deposit**:
Close count minus left in box; sealed in the deposit bag for the PAC.

### Items and prices

**Item**:
One thing the kids can buy, counted in pieces. An assorted variety pack is one item.
_Avoid_: Product, SKU

**Piece**:
The unit stock is counted in (one bar, one bag, one popsicle), even for deal items. Bulk candy bagged by volunteers counts as one piece per bag.
_Avoid_: Unit, each

**Type**:
**Snack** or **Treat**. Used for grouping and insights.
_Avoid_: Category

**Storage**:
**Shelf** or **Freezer**; a label telling volunteers where to fetch a box. It never affects rules or grouping.
_Avoid_: Location, type

**Price option**:
One of the allowed prices: $1, $2, 2 for $1, 3 for $1.

**Deal**:
A multi-piece price option such as "2 for $1".
_Avoid_: Bundle, combo, multi-buy

**Suggested price**:
The price option the app recommends from an item's cost per piece.

**Needs a price**:
A new item logged with "Decide later"; it waits on the Items tab until priced.

**Cost per piece**:
What one piece cost the team, tax included.
_Avoid_: Unit cost, COGS

**Margin**:
The share of a price option that is profit: 1 − (cost per piece × pieces per deal) ÷ price.
_Avoid_: Markup

**Margin band**:
The label for a margin: **Great deal**, **Good**, **Fair**, **Low margin**, **At a loss**.

### Stock and buying

**Stock**:
Pieces on hand, the sum of an item's stock movements. Sale days don't change it, so it's only accurate right after a stock count.
_Avoid_: Inventory

**Stock movement**:
One recorded change to an item's stock: purchase, count (the difference found at a stock count), donated, returned (pieces taken back to the store in a refund) or correction. Older rows may be sold, out, missing, damaged or found, from when sale days counted stock.
_Avoid_: Adjustment, transaction

**Stock count**:
Counting every item on hand, about once a term. Skipped items stay uncounted. Pieces gone between two counts were sold, eaten or lost.
_Avoid_: Inventory, stocktake, audit

**Deal check**:
The in-aisle calculator for judging whether a box is worth buying.
_Avoid_: Price check

**Purchase**:
One receipt's worth of snack lines, logged once with a required receipt photo.
_Avoid_: Order

**Claim**:
A logged purchase waiting to be reimbursed, numbered SS-001, SS-002, …; either **To pay** or **Paid**. The coordinator sends the To pay list to the treasurer before each PAC meeting and marks claims paid once the cheques are handed out.
_Avoid_: Expense, invoice, reimbursement request

**Paid note**:
Optional free text recorded when a claim is marked paid, such as the cheque number.
_Avoid_: Payment reference

**Refund**:
Money back from the store for pieces returned from a To pay claim; the claim then owes the receipt total minus its refunds.
_Avoid_: Return, credit

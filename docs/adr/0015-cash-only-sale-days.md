---
status: accepted
---

# Sale days count cash only

Supersedes ADR-0001, ADR-0002 and ADR-0003, and the Presence half of ADR-0010.

The first real sale day (2026-10-14) showed that nobody has time to check stock before selling or count leftovers after. Volunteers bring out what is in stock, sell it, and rebuy when something runs low or a good deal turns up. The kid rules are loosely enforced and nobody used the Sell helper. What the team does every time is count the cash box when the sale opens and again when it closes.

So a sale day is now two cash counts:

- **Open:** count the box by denomination. If the total differs from what was left in the box after the last sale day, warn and ask for an optional note. Never block; the line of kids won't wait.
- **Close:** count the box by denomination, then enter what stays in the box as the next change float (default: the change float setting). Submitting the close count is the sign-off; the database records who did it.

```
revenue = close count − open count
deposit = close count − left in box
```

A sale day has two phases, **open** and **closed**, changed only through database functions. Any past date can be picked, one sale day per date, one open at a time. Realtime stays on the Sale day screen so two phones see the same counts; Presence is dropped.

Removed: the lineup and its suggestions, Check stock, the item count up, locked prices, `sold` and `out` movements from sale days, the helper credit, expected cash, over/short and its thresholds, the Sell helper, the basket and the kid rules settings. Stock no longer changes on a sale day.

## Consequences

- Revenue is known per sale day, but not per item or per type. Pieces sold per item come only from occasional stock counts (ADR-0016).
- There is no expected cash, so a counting mistake or missing cash on the day can't be caught. The open count against the last "left in box" still catches cash lost between sale days.
- The sale day tables are dropped and rebuilt. Production had no sale days when this was decided, and it was backed up first.

## Considered options

- **Keep the count up but make it optional:** rejected. An optional count gets skipped, and a half-counted day gives wrong sales and a fake "over".
- **Assume the change float at open and count only at close:** rejected. The opening amount isn't always the float, and the open count is what catches cash lost between sale days.

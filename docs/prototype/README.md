# Prototype

`snack-shack-prototype.html` is the clickable prototype agreed with the coordinator (September 2026). Open it in a browser at phone width. It uses mock data and saves nothing; refresh to reset. Each flow has "Fill sample … (demo)" buttons.

It is a reference for **flows, wording and layout**, not code to reuse: it's one vanilla JS file with in-memory state. The real app follows `docs/HANDOFF.md` and `docs/BUILD_PLAN.md`.

Fonts (Bricolage Grotesque, Figtree) load from Google Fonts, so the screenshots below, captured offline, show a fallback font.

| Screen | File |
|---|---|
| Sale day: pick the lineup | `screens/01-sale-day-lineup.png` |
| Sale day: check stock (2 mini bars damaged) | `screens/02-sale-day-check-stock.png` |
| Sale day: selling | `screens/03-sale-day-selling.png` |
| Sell helper (basket, change) | `screens/04-sell-helper.png` |
| Count up: stock | `screens/05-count-up-stock.png` |
| Count up: cash | `screens/06-count-up-cash.png` |
| Count up: sign off | `screens/07-count-up-sign-off.png` |
| Count up: done | `screens/08-count-up-done.png` |
| Buy: what to buy, Deal check | `screens/09-buy-what-to-buy.png` |
| Buy: log purchase (from Deal check) | `screens/10-buy-log-purchase.png` |
| Buy: claims and weekly treasurer email | `screens/11-buy-claims-and-treasurer-email.png` |
| Items | `screens/12-items.png` |
| Items: editor | `screens/13-items-editor.png` |
| Insights | `screens/14-insights.png` |
| Dark mode | `screens/15-dark-mode-lineup.png` |

Known prototype shortcuts the real app must not copy: sign-off uses typed initials (real app: two signed-in users); the treasurer email is a preview inside Claims (real app: an actual email with signed links); the Sell helper and Sale day share in-memory state (real app: server state with Realtime).

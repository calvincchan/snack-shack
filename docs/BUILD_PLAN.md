# Build plan

Build in this order. Each milestone ends with something the coordinator can try on a phone. Don't start the next one until the "Done when" list passes. Keep `HANDOFF.md` open: the prototype's wording and flows are agreed.

## Stack

| Layer | Choice |
|---|---|
| App | **Vite + React 19 + TypeScript** (strict), single-page app |
| UI | **shadcn/ui** (Radix) + **Tailwind CSS**, themed with the tokens in `HANDOFF.md` §7; `lucide-react` icons |
| Routing | TanStack Router or React Router (one route per tab, plus `/pay`) |
| Data | **@supabase/supabase-js** with generated types; **TanStack Query** for fetching and caching |
| Forms | react-hook-form + zod |
| Backend | **Supabase**: Postgres, Auth (email magic link), Realtime, Storage, Edge Functions (Deno), Cron |
| Email | Resend (or similar) from an Edge Function |
| Offline | PWA (vite-plugin-pwa); TanStack Query persisted mutations for the count-up |
| Tests | pgTAP (`supabase test db`) for money rules; Vitest for UI logic; Playwright for the phone flows |
| Hosting | Vercel or Netlify (static), Supabase free tier |
| Package manager | pnpm |

Check current versions when scaffolding; don't pin from this document.

## M0. Setup

- Scaffold Vite React TS, Tailwind, shadcn/ui (`button`, `card`, `tabs`, `toggle-group`, `input`, `label`, `sheet`, `dialog`, `badge`, `sonner` for toasts, `progress`).
- Theme: map the §7 colours to shadcn CSS variables for light and dark. Add `treat`, `snack`, `ok`, `warn`, `bad` as extra tokens. Load Bricolage Grotesque and Figtree.
- `supabase init`, copy in the migrations and test from this repo, `supabase start`, `supabase db reset`, `supabase test db`.
- Generate types: `supabase gen types typescript --local > src/lib/database.types.ts`.
- ESLint, Prettier, Vitest, Playwright, a GitHub Actions workflow that runs lint, type check, Vitest and `supabase test db`.
- `.env.example` with `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. Never commit real keys.
- Mobile shell: header ("Snack Shack", next sale line), bottom tab bar with the five tabs, safe-area padding.

**Done when:** `supabase test db` passes all 40 checks; the empty shell runs on a phone in light and dark mode; CI is green.

## M1. Sign-in and Items

- Magic-link sign-in; session persists all term. First sign-in without a profile shows "Ask the coordinator to add you". Admin screen to add volunteers (email, name, role) and edit settings.
- Seed script with the prototype's mock items (`supabase/seed.sql`) for local development.
- Items tab: *Needs a price* list and *All items* list, with the editor sheet (price options with margin bands, type, storage, name). Optimistic concurrency with `version`.
- Shared helpers: `formatMoney(cents)`, `priceLabel(price, bundle)`, `marginBand(margin)`, `priceOptions(unitCost)` with the suggested-price rule. Unit-test these against the examples in `HANDOFF.md` §5.

**Done when:** two phones can sign in; editing the same item on both shows the conflict prompt; mini bars at 13.84¢ suggest "2 for $1, Great deal, 72%".

## M2. Buying and claims

- Log purchase: receipt lines with existing or new items, pieces, cost incl. tax, price options, *Decide later*, required receipt photo uploaded to `receipts/<purchase id>/`, then `log_purchase()` with a client-generated id.
- What to buy: shopping trip claim, **Deal check** (HANDOFF §5.4) with *Bought it* carrying numbers into Log purchase, stock by type, tips.
- Claims: to pay by volunteer, paid list, CSV ledger (copy or download).

**Done when:** logging the mini bar receipt creates SS-001, stock shows 130, the item shows a margin band; retrying a failed save doesn't duplicate the claim.

## M3. Sale day (the core)

- Phases: Lineup (with `suggest_lineup()` reasons and lineup margin), Check stock, Selling, Count up (stock → cash → sign-off), Done screen with deposit amount.
- All transitions through the database functions. Show their error messages as they are (they're written for volunteers).
- **Realtime** on the sale day tables and **Presence** ("Yuki is counting cash").
- **Offline:** count-up edits queue and retry; show a small "Saved" / "Waiting for Wi-Fi" indicator.
- Sell helper tab: today's lineup only, basket rules (3 items, 1 treat, deal = 1 item), change calculator. Nothing saved.

**Done when:** a full sale day can be run on two phones at once: one counts stock, the other counts cash, each sees the other's numbers within a second; turning Wi-Fi off mid-count loses nothing; both sign off; the deposit amount matches the pgTAP example; editing a price mid-sale shows "today $1".

## M4. Insights

- Tiles, sales-by-day bar chart, "What the numbers say" rules (HANDOFF §5.8), count-up notes, items by sales per day out, cash history.
- Implement each rule as a SQL view or function returning facts; the UI only formats sentences.

**Done when:** with the seed data the page shows the same kinds of sentences as the prototype, and every number can be traced to a view.

## M5. Treasurer email

- Edge Function `weekly-summary` on a Monday 07:00 America/Vancouver schedule; `pay` Edge Function and `/pay` page (see `DATA_MODEL.md`).
- Admin button "Send a test email to me".

**Done when:** the test email arrives with deposits, per-volunteer totals, receipt links and the CSV; tapping "Mark Yuki paid" marks her claims paid as the treasurer; tapping it again says the link was used.

## M6. Polish and launch

- PWA install prompt and icon; audit history on the sale day and item sheets.
- Accessibility pass: focus states, labels, contrast in both themes.
- Playwright tests for: full sale day, logging a purchase, editing an item during a sale.
- Production Supabase project, auth redirect URLs, email sender domain, hosting, backups (see `OPEN_QUESTIONS.md`).

**Done when:** the team runs a real sale day with it.

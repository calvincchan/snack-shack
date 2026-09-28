# Snack Shack

A mobile web app for parent volunteers who run an after-lunch snack table at an elementary school in BC, Canada. It tracks stock, checks the cash after each sale, handles purchases and reimbursements, and shows simple sales insights.

## Read first

1. `docs/HANDOFF.md`: background, every screen, every business rule. **Source of truth.**
2. `CONTEXT.md`: the glossary. Use its words; avoid the ones it lists under _Avoid_.
3. `docs/adr/`: why things are the way they are, and ideas that were rejected. Don't reintroduce rejected ideas without asking.
4. `docs/DATA_MODEL.md` + `supabase/migrations/`: the schema (tested draft).
5. `docs/prototype/`: clickable prototype and screenshots. Match its flows and wording, not its code.
6. GitHub issues: the build is broken into `ready-for-agent` tickets with native blocking; take any ticket whose blockers are closed. Open questions are `needs-info` issues with working assumptions.

## Stack

Vite + React + TypeScript (strict), shadcn/ui + Tailwind, `lucide-react`, TanStack Query, TanStack Router or React Router, react-hook-form + zod, Supabase (Postgres, Auth, Realtime, Storage, Edge Functions, Cron), Resend (or similar) for email, vite-plugin-pwa with persisted TanStack Query mutations for the offline count up, pnpm. Tests: pgTAP, Vitest, Playwright. Check current versions when scaffolding; don't pin from docs.

## Rules

- **Money is integer cents; stock is pieces.** Never use floats for money in the database. Format only at the edge.
- **Business maths lives in Postgres** (views and functions). The UI reads views and calls functions. If you need a new calculation, add a view or function with a pgTAP test.
- **Stock is an append-only ledger** (`stock_movements`). Never update or delete a movement; add a correction.
- **Sale day phase changes only through the functions** (`start_sale`, `begin_count`, `sign_off`, `close_sale_day`). Show their error messages to the user as-is.
- **Client-generated UUIDs** for anything created offline (purchases, count-up writes).
- **UI copy:** Canadian English (colour, centre, cheque) with "-ize" endings. Use the `CONTEXT.md` words (sale day, lineup, check stock, count up, change float, over/short, out, target stock). Keep copy short and plain.
- **Mobile first:** touch targets 44–48 px, one-handed use, light and dark mode, tabular numbers.
- Every button sets its own text colour (a dark-panel inheritance bug happened in the prototype).
- Don't commit secrets. Only `.env.example` is tracked.

## Commands (after the scaffold ticket)

```bash
pnpm dev                 # app
supabase start           # local Supabase
supabase db reset        # apply migrations + seed
supabase test db         # pgTAP tests (money and stock rules)
supabase gen types typescript --local > src/lib/database.types.ts
pnpm test                # Vitest
pnpm test:e2e            # Playwright
pnpm lint && pnpm typecheck
```

## Agent skills

### Issue tracker

GitHub Issues on calvincchan/snack-shack (gh CLI). See `docs/agents/issue-tracker.md`.

### Triage labels

Default five: needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: root `CONTEXT.md` + `docs/adr/`. See `docs/agents/domain.md`.

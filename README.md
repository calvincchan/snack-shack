# Snack Shack

Mobile web app for the parent volunteers who run an after-lunch snack table at our school: stock, the cash count-up after each sale, purchases and reimbursements, and simple sales insights.

**Status:** app scaffolded (mobile shell, theme, local Supabase, CI). Start with [`CLAUDE.md`](CLAUDE.md), then pick up the next open `ready-for-agent` ticket.

|              |                                                                                                                            |
| ------------ | -------------------------------------------------------------------------------------------------------------------------- |
| What and why | [`docs/HANDOFF.md`](docs/HANDOFF.md), [`CONTEXT.md`](CONTEXT.md) (glossary), [`docs/adr/`](docs/adr/) (decisions)          |
| Database     | [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md), [`supabase/`](supabase/)                                                       |
| Plan         | [GitHub issues](https://github.com/calvincchan/snack-shack/issues): `ready-for-agent` tickets, `needs-info` open questions |
| Prototype    | [`docs/prototype/`](docs/prototype/)                                                                                       |

Stack: Vite, React, TypeScript, shadcn/ui, Tailwind, TanStack Query, Supabase.

## Commands

```bash
pnpm dev                 # app
supabase start           # local Supabase
pnpm db:reset            # apply migrations + seed, then db:sync
pnpm db:sync             # regenerate src/lib/database.types.ts + supabase/schema.sql
supabase test db         # pgTAP tests
pnpm test                # Vitest
pnpm test:e2e            # Playwright
pnpm lint && pnpm typecheck
```

Copy `.env.example` to `.env` and fill in the local Supabase URL and anon key (printed by `supabase start`).

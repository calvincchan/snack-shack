---
status: accepted
---

# Stack: Vite + React SPA on Supabase

The app is a static single-page app (Vite, React, TypeScript strict, shadcn/ui + Tailwind, TanStack Query) on Supabase (Postgres, Auth, Realtime, Storage, Edge Functions), hosted on a free static host. It matches the coordinator's stack (TypeScript, Node, Supabase), needs no server rendering, and shadcn components are owned in the repo and accessible (Radix).

## Considered options

- **refine.dev**: rejected; it suits CRUD admin panels, and most of this app is workflow screens (count up, lineup, sell helper) that would fight its abstractions.

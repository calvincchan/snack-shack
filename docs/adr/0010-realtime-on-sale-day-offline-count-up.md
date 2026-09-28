---
status: accepted
---

# Realtime only on the sale day; offline-safe count up

The sale day is the only place two people work at once (typically one counts stock, the other counts cash), so Supabase Realtime and Presence run only on the Sale day screen; other tabs refetch on focus. School Wi-Fi is unreliable, so count-up writes queue locally with client-generated UUIDs and retry without duplicating. Counts are one row per sale day × item and per sale day × coin, so two volunteers counting different things never touch the same row.

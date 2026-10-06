---
status: partially superseded by ADR-0012 (the offline count-up half)
---

> The offline queue described below was dropped; see ADR-0012. Realtime and Presence stand.

# Realtime only on the sale day; offline-safe count up

The sale day is the only place two people work at once (typically one counts stock, the other counts cash), so Supabase Realtime and Presence run only on the Sale day screen; other tabs refetch on focus. School Wi-Fi is unreliable, so count-up writes queue locally with client-generated UUIDs and retry without duplicating. Counts are one row per sale day × item and per sale day × coin, so two volunteers counting different things never touch the same row.

Count writes set a row to an absolute value, and the row is already keyed by sale day × item or coin, so that key is what makes a retry safe; no extra UUID is needed for them. Client UUIDs stay for records created offline (purchases). Writes queue in TanStack Query, persist to local storage, and replay in order per row. Sign-off and Finish are never queued; they wait until every count has saved.

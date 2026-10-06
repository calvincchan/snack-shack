---
status: accepted
---

# Drop the offline count-up queue

Supersedes the offline half of ADR-0010. Realtime and Presence on the Sale day screen stay.

The persisted TanStack Query mutation queue added more complexity than it earned. Nobody reported a poor connection in testing, and no writes were queued before the 2026-10-05 production reset.

Count writes are now plain online mutations. A failed write toasts its error ("No connection. Change not saved." for a dropped connection, the database's own message otherwise) and the sync indicator shows "Not saved" until that row saves again. Sign-off and Finish stay disabled while any count is saving or not saved. Writes to one row still run in order, and each sets an absolute value, so a repeat is harmless.

Client-generated UUIDs stay for purchases so a retry cannot duplicate. `vite-plugin-pwa` stays for the manifest (home screen install); only the queue is removed.

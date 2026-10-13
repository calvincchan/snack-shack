---
status: accepted
---

# People edit profiles through functions; full names stay visible to the team

Volunteers need to fix their own names, and the coordinator needs to change someone's name, full name or role without re-adding them. Every profile write now goes through a `security definer` function, and the app no longer writes `profiles` directly:

- `update_my_profile(display_name, full_name)`: any active member, for their own row. Never role, active or email.
- `update_team_member(id, display_name, full_name, role)` and `set_member_active(id, active)`: coordinator only.
- `update_invite(id, display_name, full_name, role)`: coordinator only, for an invite still waiting.
- `add_volunteer` no longer updates someone who is already there. It refuses an email that is on the team, off the team or invited, and the message points at Edit or Add back.

Rules, checked in the functions with plain messages and backed by constraints and unique indexes:

- Display name: trimmed, 1–30 characters, unique ignoring case across all profiles (including people off the team) and open invites. A duplicate makes sign-offs, claims and Mark paid buttons ambiguous.
- Full name: optional, trimmed, at most 100 characters. Blank clears it.
- `profiles_guard` still stops someone removing themselves and keeps one coordinator.
- Renames show everywhere at once: views join `display_name` live, so history shows the current name. Last write wins; no version check.

## Considered options

- **Self-update RLS policy plus a trigger that blocks role, active and email changes**: rejected. Column rules spread across a policy and a trigger are harder to test than one function per action, and the sale day phase functions already set that pattern.
- **Hide full names from everyone but the coordinator and the person**: rejected for now. It's a small, trusted parent group, and column-level privacy needs revoked column grants plus a view or function for every read. Full names stay readable by every active member. Revisit if the team grows or a parent objects.
- **Snapshot names on sign-offs and claims**: rejected. Renames are rare and mostly fix typos, so the current name is clearer.
- **Keep re-adding an email as the way to edit**: rejected. It was easy to change someone's role by accident.
- **Show profile change history**: not built. The audit log already records it if needed.

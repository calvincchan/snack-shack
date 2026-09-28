---
status: accepted
---

# Adding volunteers, and where the first coordinator comes from

`profiles.id` points at `auth.users(id)`, so a profile cannot exist before that person has an account. The coordinator, though, wants to add someone from the class list on a Tuesday evening, long before that parent opens the app.

## Adding a volunteer

`add_volunteer(email, name, role)` handles both orders:

- The person already has an account (they signed in and saw "Ask the coordinator to add you"): the function writes their profile straight away and they can use the app on their next screen refresh.
- They have never signed in: the function writes a row to `volunteer_invites`. A trigger on `auth.users` turns the open invite into a profile the first time they sign in.

The coordinator's screen shows both states, so an invite that nobody ever accepts is visible rather than silent.

## Considered options

- **Edge Function with the service role calling `auth.admin.inviteUserByEmail`**: rejected for now. It would send the invite email itself, which is nicer, but it needs a deployed function, a service-role secret and a chosen email provider — and the email provider is still open (issue #28). The database-only route works locally, in CI and in production with no secrets. Revisit once the treasurer email forces an email provider decision.

## The first coordinator

On an empty database nobody is an admin, so nobody can add anyone. The trigger on `auth.users` gives the **first person to sign in** an active `admin` profile.

The window is open only until the coordinator signs in once, and it closes permanently on its own. Alternatives were a coordinator email seeded per environment (needs the real address at deploy time, and a manual step for local and CI) and a manual `insert` by an operator (safest, but blocks every fresh environment on a runbook step).

Consequence: sign in as the coordinator immediately after creating a new environment. Anyone who signs in before that becomes the coordinator.

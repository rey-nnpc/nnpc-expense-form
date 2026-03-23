# Backend And Business Logic Plan

## Objective
Introduce a real application access layer on top of Supabase Auth so that authentication and authorization are handled separately:

- Supabase Auth answers who the user is
- `public.user_accounts` answers whether the user may use the app

## Access Model
Every authenticated user belongs to one of four states:

| State | Meaning | App Access |
| --- | --- | --- |
| signed out | no active session | blocked |
| pending | signed in but awaiting approval | blocked |
| approved | signed in and approved | allowed |
| disabled | signed in but access revoked | blocked |

Admin access is a second condition:

- user must be `approved`
- user must also have `role = 'admin'`

## Auth Flow Changes
Extend the current auth layer so that after every auth event the app also resolves the current `user_accounts` row.

Account lookup should happen after:

- signup
- login
- session restore on page load
- token refresh
- explicit logout cleanup

Recommended shape for the auth context or gate:

```ts
type AppAccount = {
  userId: string;
  email: string;
  displayName: string | null;
  role: "user" | "admin";
  accessStatus: "pending" | "approved" | "disabled";
};
```

## Access Gating Rules
The app should gate access before rendering protected content.

### Unauthenticated
Show the existing login/signup experience.

### Pending
Show a minimal waiting state:

- short explanation that access is pending admin approval
- logout action only

### Disabled
Show a minimal blocked state:

- short explanation that access has been disabled
- logout action only

### Approved
Allow normal app navigation.

## Admin Route Rules
All admin pages should require:

- active session
- `access_status = 'approved'`
- `role = 'admin'`

Non-admin users who navigate to admin routes should see a plain access-denied state, not partial admin UI.

## Signup Behavior
Signup stays open, but usage does not.

Expected flow:

1. user signs up through Supabase Auth
2. sync trigger creates `public.user_accounts` row
3. new row defaults to `role = 'user'` and `access_status = 'pending'`
4. if Supabase returns a session, the app immediately routes the user into the pending-access screen

This preserves easy onboarding while keeping the main system admin-controlled.

## Admin Data Layer
Create or extend client-side service helpers to call the admin RPCs.

Suggested responsibilities:

- fetch user management data
- fetch admin management data
- approve a user
- disable a user
- re-approve a user
- promote a user to admin
- demote an admin to user

Keep these helpers thin. Final authorization must remain in the database RPCs.

## Mutation Rules
Admin mutations should follow a strict, predictable flow:

1. execute RPC
2. surface any returned DB error clearly
3. refetch relevant admin data
4. refresh current account state if the current user was affected

Business rules:

- approve: set `approved_at` and `approved_by`, clear disabled fields
- disable: set `disabled_at` and `disabled_by`
- re-approve: restore access without losing role
- promote: keep user approved and change `role` to `admin`
- demote: change `role` to `user`, but never allow the last approved admin to be removed

## Session Freshness
Because the current app is client-session driven, account status should be refreshed often enough to make admin actions effective quickly.

Recommended refresh moments:

- app boot
- route entry into protected pages
- window focus
- after admin mutations

This keeps disabled users from continuing to use the app for long after access is revoked.

## Route Structure
Recommended admin route layout:

- `/admin` for the central admin control screen
- `/admin/expenses` for expense oversight summary
- `/admin/expenses/[userId]` for user expense detail

The central admin screen should focus on access control and admin-role management. Expense oversight should remain separate so the admin tools stay clear and maintainable.

## Failure Handling
Backend-facing error handling should be explicit for:

- missing `user_accounts` row
- access denied by RPC
- invalid mutation target
- self-disable attempt
- self-demotion attempt
- last-admin protection failure

User-facing messages should stay short and operational, not technical.

## Rollout Strategy
To avoid locking out current users during deployment:

1. run the DB migration
2. backfill current users to `approved`
3. manually assign the first admin
4. deploy the gated frontend
5. verify pending flow with a newly created account

# Database Changes Plan

## Objective
Support a full admin-controlled access model where:

- new signups are created as pending users
- only approved users can access the main system
- admins can approve, disable, and manage admin privileges
- expense oversight stays available to approved admins

## Core Table Strategy
Use `public.user_accounts` as the central application account table instead of creating a second parallel user directory. It already fits the role/RBAC direction and can remain the source of truth for app-level access control.

## Required Schema Changes
Extend `public.user_accounts` with the following fields:

| Column | Type | Purpose |
| --- | --- | --- |
| `role` | `text` | `user` or `admin` |
| `access_status` | `text` | `pending`, `approved`, or `disabled` |
| `approved_at` | `timestamptz null` | when access was approved |
| `approved_by` | `uuid null` | which admin approved the user |
| `disabled_at` | `timestamptz null` | when access was disabled |
| `disabled_by` | `uuid null` | which admin disabled the user |

Recommended constraints:

- `role in ('user', 'admin')`
- `access_status in ('pending', 'approved', 'disabled')`
- `access_status default 'pending'`

## Sync Trigger Rules
Keep the sync from `auth.users` into `public.user_accounts`, but narrow its responsibility.

The trigger should only maintain identity fields such as:

- `user_id`
- `email`
- `display_name`
- `created_at`
- `updated_at`

The trigger must not overwrite:

- `role`
- `access_status`
- `approved_at`
- `approved_by`
- `disabled_at`
- `disabled_by`

That separation prevents a normal auth sync from accidentally wiping admin decisions.

## Migration And Rollout
Migration should include:

1. add the new columns and check constraints
2. backfill all existing users to `access_status = 'approved'`
3. keep all future signups defaulting to `pending`
4. manually promote the first real admin with SQL

Bootstrap SQL example:

```sql
update public.user_accounts
set role = 'admin',
    access_status = 'approved',
    approved_at = now(),
    approved_by = user_id
where email = 'admin@example.com';
```

## Admin RPC Layer
All privileged reads and writes should stay behind `security definer` RPCs.

Recommended RPCs:

### `public.get_admin_user_management()`
Returns all application users for the user management tab.

Suggested fields:

- `user_id`
- `email`
- `display_name`
- `role`
- `access_status`
- `created_at`
- `approved_at`
- `disabled_at`

### `public.get_admin_management()`
Returns data for the admin management tab.

Suggested fields:

- approved admins
- approved non-admin users who are eligible for promotion
- counts for total admins, approved users, pending users, disabled users

### `public.admin_update_user_account(p_target_user_id uuid, p_access_status text default null, p_role text default null)`
Central mutation RPC for:

- approving a pending user
- disabling an approved user
- re-approving a disabled user
- promoting a user to admin
- demoting an admin to user

## Required Authorization Rules In RPCs
Every admin RPC should enforce all checks in the database:

- caller must exist in `public.user_accounts`
- caller must have `role = 'admin'`
- caller must have `access_status = 'approved'`
- target user must exist
- prevent self-disable
- prevent self-demotion from admin
- prevent any action that would leave zero approved admins

Additional rule:

- `pending` should be treated as signup-only status and not be a manual admin action target in the UI

## Expense Dashboard Compatibility
Keep the existing expense-admin RPC approach. The admin control work should not weaken the current expense dashboard security model. Expense RPCs should continue to require an approved admin caller.

## Optional Phase 2
If stronger auditability is needed later, add a dedicated `admin_action_logs` table. For the first implementation, the inline audit columns above are enough to ship safely.

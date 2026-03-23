# Frontend UI Updates Plan

## Objective
Add a clear central admin control area for account access and admin-role management, while keeping the interface minimal, high-contrast, and easy to operate.

## Admin Information Architecture
Use a central admin screen with two primary tabs:

- `User Management`
- `Admin Management`

Keep expense oversight as a separate admin section so it does not compete with the approval workflow.

Recommended structure:

- `/admin` for the central admin control page
- `/admin/expenses` for expense overview
- `/admin/expenses/[userId]` for per-user expense detail

## Central Admin Screen
The main admin screen should include:

- a compact page header
- two tabs for management tasks
- small summary counts near the top
- table-driven workflows below

Summary counts can include:

- pending users
- approved users
- disabled users
- approved admins

## User Management Tab
This tab controls whether a user may use the application.

Recommended sections:

### Pending
Users waiting for approval.

Columns:

- user name
- email
- signup date
- current role
- actions

Actions:

- approve
- disable

### Approved
Users allowed into the system.

Columns:

- user name
- email
- approval date
- role
- actions

Actions:

- disable

### Disabled
Users whose access has been revoked.

Columns:

- user name
- email
- disabled date
- role
- actions

Actions:

- re-approve

## Admin Management Tab
This tab controls who has admin privileges.

Recommended layout:

- one table for current approved admins
- one table for approved non-admin users eligible for promotion

### Current Admins Table
Columns:

- user name
- email
- approved status
- admin since or role state
- actions

Actions:

- demote to user

Guardrails:

- hide or disable demotion for the current user
- hide or disable demotion if the target is the last approved admin

### Eligible Users Table
Columns:

- user name
- email
- access status
- approval date
- actions

Actions:

- promote to admin

Only approved users should appear here.

## Expense Admin Navigation
The admin control area should include a clear link to the expense oversight section, but the expense dashboard itself should remain on its own pages.

Suggested label:

- `View Expenses`

This keeps access control tasks separate from reporting tasks.

## Access-State Screens
Add or refine minimal state screens for blocked users.

### Pending Access Screen
Content:

- short title
- one-sentence explanation
- logout button

### Disabled Access Screen
Content:

- short title
- one-sentence explanation
- logout button

These screens should not show the main route tabs.

## Visual Direction
Keep the admin UI intentionally simple.

Rules:

- no full-page gradient backgrounds
- use solid surfaces and clear borders
- maintain strong text/background contrast
- keep spacing consistent between headers, filters, cards, and tables
- align numeric content with tabular figures where relevant
- keep action buttons compact and obvious

## Interaction Details
Recommended interaction behavior:

- tabs should switch instantly without a full page reload
- mutations should show inline loading states
- destructive actions such as disable and demote should use confirmation dialogs or a clear secondary confirmation
- after a successful action, the affected table should refresh immediately

## Mobile And Narrow Screens
The layout should stay usable on smaller screens.

Recommendations:

- keep the header stacked cleanly on mobile
- allow tables to scroll horizontally instead of collapsing into unreadable cards
- keep action buttons accessible without cramming multiple controls into one cell

## Existing Expense UI Alignment
The current admin expense pages should be visually aligned with the new control area:

- same spacing scale
- same contrast rules
- same table treatment
- same simple header structure

This keeps the whole admin experience feeling like one system instead of separate screens built with different rules.

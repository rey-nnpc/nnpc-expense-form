# Supabase Migrations

Keep all schema changes in this folder as timestamped SQL files.

Conventions:
- One migration per change set.
- Use `YYYYMMDDHHMMSS_description.sql`.
- Treat the newest migration here as the source of truth.
- Keep `../schema.sql` as a readable snapshot of the latest schema, not the primary authoring location.

Current baseline:
- `20260304115354_initial_current_scope.sql` sets up the schema for the current product scope:
  profiles, reusable company headers, daily expense reports, line items, receipt metadata, seeded expense types, triggers, indexes, and RLS policies.
- `20260304123000_supabase_storage_full_app.sql` upgrades the app to full Supabase-backed persistence:
  Storage buckets, storage policies, storage-backed company logos and receipts, and an atomic `upsert_expense_day` RPC.

-- =========================================================
-- 0003 — Supabase Realtime: push generation row updates to subscribed widgets (§1.4, D20).
-- On Supabase the `supabase_realtime` publication already exists (empty); the test harness creates it
-- in the auth shim so this applies unchanged on a bare Postgres.
-- =========================================================
ALTER PUBLICATION supabase_realtime ADD TABLE generations;
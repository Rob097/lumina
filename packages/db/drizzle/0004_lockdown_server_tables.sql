-- =========================================================
-- 0004 — lock down server-only tables + pin function search_path
--
-- Supabase configures project-level DEFAULT PRIVILEGES that silently GRANT `anon`/`authenticated`
-- on EVERY new table in `public`. The six server-only tables below were never explicitly granted in
-- 0001 (only the six tenant tables were), so the author assumed they were unreachable — but they
-- inherited those default grants and were therefore readable AND writable via PostgREST with the
-- public `anon` key (e.g. `GET /rest/v1/api_keys` would expose key hashes).
--
-- Fix: revoke the inherited grants and ENABLE RLS (deny-all to client roles). The table-owner
-- `postgres` role and `service_role` BYPASS RLS, so the API (direct Postgres connection) and the
-- durable Inngest workflow are unaffected; the dashboard never touches these tables directly (D28).
--
-- The Testcontainers harness is bare Postgres with no Supabase default privileges, so the REVOKEs
-- are no-ops there (the `anon`/`authenticated` roles exist via the auth shim) — this migration
-- applies unchanged on both targets.
-- =========================================================

REVOKE ALL ON "api_keys"          FROM anon, authenticated;
--> statement-breakpoint
REVOKE ALL ON "audit_log"         FROM anon, authenticated;
--> statement-breakpoint
REVOKE ALL ON "generation_assets" FROM anon, authenticated;
--> statement-breakpoint
REVOKE ALL ON "memberships"       FROM anon, authenticated;
--> statement-breakpoint
REVOKE ALL ON "subscriptions"     FROM anon, authenticated;
--> statement-breakpoint
REVOKE ALL ON "webhooks_inbox"    FROM anon, authenticated;
--> statement-breakpoint

ALTER TABLE "api_keys"          ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "audit_log"         ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "generation_assets" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "memberships"       ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "subscriptions"     ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "webhooks_inbox"    ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

-- Supabase linter 0011 (function_search_path_mutable): pin search_path so these functions cannot be
-- hijacked via a mutable search_path. `current_merchant_ids` already sets it in 0001.
ALTER FUNCTION debit_credits(uuid, integer, uuid) SET search_path = public;
--> statement-breakpoint
ALTER FUNCTION grant_credits(uuid, integer, ledger_reason, text) SET search_path = public;

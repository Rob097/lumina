# Platform Support Super-Admin — Design

**Date:** 2026-06-26
**Status:** Approved (owner: dellantonio47@gmail.com)
**Branch:** `feat/platform-support-superadmin`

## Problem

We want an internal **support account** that behaves as a practical super-admin: it can see **every**
workspace and operate inside it, **without** the merchant seeing that an internal account is present in
their member list.

Today the `support` role exists only as an enum value. It is **membership-scoped** like every other role —
a user sees a workspace only if it has a `memberships` row, both in the app (`resolveSessionMerchants`,
`resolveActiveMembership`) and at the DB (every RLS policy keys off
`current_merchant_ids() = SELECT merchant_id FROM memberships WHERE user_id = auth.uid()`). The invite
route already hardcodes new members to `'member'`, and its own comment states the intended design:

> "The internal YuzuView `support` account (full access to every workspace) is provisioned by us
> directly, never granted through a tenant's invite form."

That provisioning + hiding was never built. This spec builds exactly that gap.

## Core idea

Keep the existing model — **membership = access** — and reuse it:

1. Make the support account a `role='support'` **member of every workspace** (present and future).
2. **Hide** `role='support'` members from the workspace member list shown to merchants.
3. Confirm/adjust the permission gates so support is a super-admin **except billing**.

No new "global superuser" concept, no RLS exception. Every query stays scoped to a single `merchant_id`
the user is a member of; the only change is that the support user *is* a member everywhere. `HARD RULE #1`
(tenant isolation) is bent **explicitly and traceably**, not bypassed — recorded in `docs/DECISIONS.md`.

## Components

### A. Support identity — env-configured

- New env var **`LUMINA_SUPPORT_USER_IDS`**: comma-separated `auth.users` UUIDs. The owner's account is the
  first entry. Empty/unset ⇒ feature is a no-op.
- Chosen over a DB flag/table: no migration, config via env (`HARD RULE #2` channel), trivial to add/remove
  internal accounts. The in-DB marker stays `role='support'` on the membership rows.
- **Env decides WHO gets enrolled; `role='support'` on the membership drives powers + hiding.**

New module `apps/api/src/lib/account/platform-support.ts`:
- `platformSupportUserIds(env = process.env): string[]` — parse, trim, keep only valid UUIDs, dedupe.
- `enrollPlatformSupport(db, merchantId, opts?: { excludeUserId?: string }): Promise<number>` — for each
  configured id (minus `excludeUserId`), insert a `role='support'` membership with `onConflictDoNothing`
  on the unique `(merchant_id, user_id)`. **Per-id try/catch** so one bad id (e.g. not in `auth.users`)
  never aborts the batch. Returns the number enrolled.
- `syncPlatformSupport(db): Promise<{ supportIds; merchants; enrolled }>` — backfill: for each configured
  id, insert a `role='support'` membership into every merchant where missing (`ON CONFLICT DO NOTHING`).

### B. Auto-enroll at workspace creation

Single chokepoint: `createWorkspace()` in `apps/api/src/lib/bootstrap.ts` (used by first-login bootstrap
`ensureMerchantForUser` **and** "create another workspace"). After the creation transaction **commits**,
call `enrollPlatformSupport(db, merchantId, { excludeUserId: input.userId })` **best-effort** (try/catch +
log). Post-commit + best-effort guarantees that a misconfigured support id can **never** break a customer
signup or workspace creation. `excludeUserId` skips the case where the creator is itself a support account.

### C. Backfill existing workspaces

Script **`pnpm support:sync`** → `apps/api/scripts/sync-platform-support.ts` (run via `tsx`, like the
existing `e2e`/`eval` scripts). Calls `syncPlatformSupport(db)`. Idempotent and re-runnable (e.g. after
adding a new internal account). Not a Drizzle migration: it touches *data* and depends on env-configured
ids that must not be hardcoded in a committed migration.

### D. Hide support from the member list

Single point where the member list is built: `listTeam()` in `apps/api/src/lib/account/service.ts`. Add
`AND memberships.role <> 'support'`. Merchants (and everyone) viewing Settings → Team never see the
internal account. No invitation rows are created (direct provisioning), so the invitations list is clean.

Reserve the role for internal use: `INVITABLE_ROLES` in `packages/shared/src/account.ts` becomes
`['member']` (the invite route already forces `'member'`; the dashboard already sends `role: 'member'`).
`support` stays in `MEMBER_ROLES` (append-only enum).

### E. Permissions — "everything except billing" (owner's choice)

Most operational routes gate only on `requireMerchant()` (scoped by `merchantId`), so support already has
full operational access via its membership. Audit of the actual gates:

| Action | Current gate | After |
|---|---|---|
| Products / generations / API keys / domains / widget / analytics / notifications | none (merchant-scoped) | unchanged — support **allowed** |
| Rename workspace (`PUT /v1/merchant`) | none | unchanged — support **allowed** |
| Invite/manage teammates | `role==='member'` blocked | unchanged — support **allowed** |
| **Billing checkout** (`POST /v1/billing/checkout`) | **none (API hole)** | **+ account-owner gate** → support **blocked** 🔒 |
| **Billing portal** (`POST /v1/billing/portal`) | **none (API hole)** | **+ account-owner gate** → support **blocked** 🔒 |
| Change plan (`POST /v1/billing/change`) | account-owner | unchanged — support **blocked** 🔒 |
| Delete workspace (`POST /v1/workspaces/delete`) | account-owner | unchanged — support **blocked** 🔒 |
| Close account / GDPR erase (`DELETE /v1/merchant`) | `role==='owner'` | unchanged — support **blocked** 🔒 |
| Reactivate workspace (`POST /v1/workspaces/reactivate`) | account-owner | unchanged — support **blocked** (owner-only, per owner) 🔒 |

The only code change to powers: **add an account-owner gate to billing checkout + portal.** Today these
only call `requireMerchant()` — the dashboard hides the CTAs from non-owners but the API does not enforce
it, so any member could open the portal via a direct API call. The gate blocks support **and** closes that
pre-existing hole. New helper `apps/api/src/lib/account/account-owner.ts`:
`isAccountOwner(db, merchantId, userId): Promise<boolean>` (resolve merchant → account → compare
`ownerUserId`), reusing the pattern from `billing/change`.

The dashboard already gates billing CTAs on `isAccountOwner`, so no dashboard change is needed: support is
not the account owner of a customer workspace, so its billing CTAs are disabled there.

## Data flow

- **Support logs in:** `resolveSessionMerchants` returns every workspace it has a membership in → it sees
  all workspaces in the switcher. Active workspace resolved normally (membership re-checked). Within a
  workspace it acts with full operational power; billing/destructive actions are blocked.
- **Merchant views their team:** `listTeam` filters out `role='support'` → the internal account is invisible.
- **New workspace created (any path):** owner membership + (post-commit, best-effort) support membership(s).

## Edge cases & safety

- **Fail-safe enrollment:** support enrollment runs post-commit, best-effort, per-id try/catch. A bad/empty
  `LUMINA_SUPPORT_USER_IDS` never breaks workspace creation; the `support:sync` backstop fills any gap.
- **Creator is support:** `excludeUserId` avoids a redundant self-membership / conflict.
- **Idempotency:** unique `(merchant_id, user_id)` + `onConflictDoNothing` everywhere; `support:sync`
  is safely re-runnable.
- **Scale:** the workspace switcher is not designed for hundreds of workspaces (future: search/pagination).
  Out of scope here.
- **Audit:** no per-action audit log of support activity (future). Out of scope.
- **Privacy/GDPR:** a standing internal account with access to all tenants is a deliberate privacy posture;
  recorded in DECISIONS. Access still flows one tenant at a time through the same scoping.

## Verification ("controlla che funzioni")

No real AI generations are run (they burn credits). We verify access-control, which is the point.

1. **TDD integration tests** (`@lumina/db/testing` harness, real Postgres):
   - `enrollPlatformSupport` / `createWorkspace`: enrolls each configured support id as `role='support'`;
     skips `excludeUserId`; no-op when unconfigured; fail-safe when an id is not in `auth.users`.
   - `listTeam` excludes `role='support'`.
   - `resolveSessionMerchants` returns **all** workspaces for a support user (cross-workspace visibility).
   - `isAccountOwner` true only for the account owner; billing checkout + portal return 403 for support.
   - `INVITABLE_ROLES` no longer accepts `'support'`.
   - `syncPlatformSupport` enrolls into all existing merchants and is idempotent.
2. **Real-environment check** (owner-run or owner-authorized): set `LUMINA_SUPPORT_USER_IDS`, run
   `pnpm support:sync`; the assistant verifies (Supabase MCP, read-only) that the owner's account has a
   `role='support'` membership in **every** merchant; owner confirms visually: sees all workspaces, opens
   a customer's, the customer's Team list hides the support account, can edit a product, billing disabled.

## Out of scope

Switcher scaling, support action audit log, a dedicated internal admin UI, per-seat billing exclusion
(billing is account-level today).

## Owner manual tasks (post-merge)

- Set `LUMINA_SUPPORT_USER_IDS` on the **api** Vercel project (the owner's `auth.users` UUID; the assistant
  can fetch it read-only). Keep `.env.example` current.
- Run `pnpm support:sync` once against the target DB to backfill existing workspaces.

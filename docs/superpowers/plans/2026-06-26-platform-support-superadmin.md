# Platform Support Super-Admin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make an internal `support` account a practical super-admin that is a member of every workspace (present + future) and hidden from merchants' member lists, with full operational power but no billing access.

**Architecture:** Reuse the existing `membership = access` model. Env (`LUMINA_SUPPORT_USER_IDS`) names the internal accounts; they are auto-enrolled as `role='support'` memberships at workspace creation (single chokepoint `createWorkspace`) and backfilled by a `support:sync` script. `listTeam` hides `role='support'`. Billing checkout/portal gain an account-owner gate so support (and any non-owner) is blocked.

**Tech Stack:** TypeScript (strict), Drizzle ORM, Next.js route handlers, Vitest + `@lumina/db/testing` (Testcontainers Postgres), Zod (`@lumina/shared`).

## Global Constraints

- Strict TS, no `any` (use `unknown` + Zod). — verbatim from CLAUDE.md HARD RULE #6.
- Tenant isolation: every business query scoped by `merchant_id`; support access flows one tenant at a time via explicit membership. The cross-tenant standing access is a sanctioned, documented exception (DECISIONS.md).
- Migrations only via Drizzle; **no schema change in this feature** (data + code only). Supabase MCP read-only.
- Conventional Commits, small increments. Lint + typecheck + tests must pass (pre-commit hook runs lint+typecheck).
- DB tests require Docker (Testcontainers). Node 20 via nvm.
- Validation via shared Zod schemas. Standard error envelope on endpoints.

---

### Task 1: Reserve the `support` role for internal use (shared)

**Files:**
- Modify: `packages/shared/src/account.ts:135` (`INVITABLE_ROLES`)
- Test: `packages/shared/src/account.test.ts` (create)

**Interfaces:**
- Produces: `INVITABLE_ROLES = ['member'] as const`; `CreateInviteSchema` rejects `role: 'support'`.

- [ ] **Step 1: Write the failing test** — `packages/shared/src/account.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { INVITABLE_ROLES, CreateInviteSchema } from './account.js';

describe('INVITABLE_ROLES', () => {
  it('only allows inviting plain members (support is internal-only)', () => {
    expect(INVITABLE_ROLES).toEqual(['member']);
  });

  it('CreateInviteSchema rejects role=support', () => {
    const r = CreateInviteSchema.safeParse({ email: 'a@b.com', role: 'support' });
    expect(r.success).toBe(false);
  });

  it('CreateInviteSchema accepts member and defaults to member', () => {
    expect(CreateInviteSchema.parse({ email: 'a@b.com' }).role).toBe('member');
    expect(CreateInviteSchema.parse({ email: 'a@b.com', role: 'member' }).role).toBe('member');
  });
});
```

- [ ] **Step 2: Run test, verify FAIL**

Run: `pnpm -F @lumina/shared test -- account.test.ts`
Expected: FAIL (INVITABLE_ROLES currently `['member','support']`).

- [ ] **Step 3: Implement** — `packages/shared/src/account.ts`

Change line 135 region:

```ts
/** Roles assignable when inviting a teammate. `support` is internal-only (provisioned directly), and
 * `owner` is structural (set on creation) — so the only invitable role is `member`. */
export const INVITABLE_ROLES = ['member'] as const;
```

(Leave `InvitableRoleSchema`/`CreateInviteSchema` as-is — they derive from `INVITABLE_ROLES`.)

- [ ] **Step 4: Run test, verify PASS** — `pnpm -F @lumina/shared test -- account.test.ts`

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/account.ts packages/shared/src/account.test.ts
git commit -m "feat(shared): reserve the support role for internal use (uninvitable)"
```

---

### Task 2: `isAccountOwner` helper

**Files:**
- Create: `apps/api/src/lib/account/account-owner.ts`
- Test: `apps/api/test/account-owner.test.ts`

**Interfaces:**
- Produces: `isAccountOwner(db: Database, merchantId: string, userId: string): Promise<boolean>` — true iff `userId` owns the account that owns `merchantId`.

- [ ] **Step 1: Write the failing test** — `apps/api/test/account-owner.test.ts`

```ts
import { randomUUID } from 'node:crypto';
import { accounts, memberships, merchants } from '@lumina/db';
import { setupTestDb, firstOrThrow, type TestDb } from '@lumina/db/testing';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isAccountOwner } from '../src/lib/account/account-owner.js';

let ctx: TestDb;
beforeAll(async () => { ctx = await setupTestDb(); });
afterAll(async () => { await ctx?.teardown(); });

async function newUser(): Promise<string> {
  const id = randomUUID();
  await ctx.db.execute(sql`insert into auth.users (id, email) values (${id}::uuid, ${`${id}@x.test`})`);
  return id;
}

describe('isAccountOwner', () => {
  it('is true for the account owner and false for a non-owner member', async () => {
    const owner = await newUser();
    const other = await newUser();
    const acc = firstOrThrow(await ctx.db.insert(accounts).values({ ownerUserId: owner }).returning());
    const m = firstOrThrow(
      await ctx.db.insert(merchants).values({ name: 'Co', slug: `co-${randomUUID()}`, accountId: acc.id }).returning(),
    );
    await ctx.db.insert(memberships).values({ merchantId: m.id, userId: owner, role: 'owner' });
    await ctx.db.insert(memberships).values({ merchantId: m.id, userId: other, role: 'support' });

    expect(await isAccountOwner(ctx.db, m.id, owner)).toBe(true);
    expect(await isAccountOwner(ctx.db, m.id, other)).toBe(false);
  });

  it('is false when the merchant has no account', async () => {
    const u = await newUser();
    const m = firstOrThrow(
      await ctx.db.insert(merchants).values({ name: 'Co', slug: `co-${randomUUID()}` }).returning(),
    );
    expect(await isAccountOwner(ctx.db, m.id, u)).toBe(false);
  });
});
```

- [ ] **Step 2: Run, verify FAIL** — `pnpm -F @lumina/api test -- account-owner.test.ts` (FAIL: module missing)

- [ ] **Step 3: Implement** — `apps/api/src/lib/account/account-owner.ts`

```ts
import { eq } from 'drizzle-orm';
import { accounts, merchants, type Database } from '@lumina/db';

/**
 * True iff `userId` is the OWNER of the billing account that owns `merchantId`. Governs billing +
 * destructive account actions — distinct from the per-workspace membership role (a support member is a
 * super-admin operationally but is never the account owner of a customer's workspace).
 */
export async function isAccountOwner(
  db: Database,
  merchantId: string,
  userId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ ownerUserId: accounts.ownerUserId })
    .from(merchants)
    .innerJoin(accounts, eq(merchants.accountId, accounts.id))
    .where(eq(merchants.id, merchantId))
    .limit(1);
  return row?.ownerUserId === userId;
}
```

- [ ] **Step 4: Run, verify PASS** — `pnpm -F @lumina/api test -- account-owner.test.ts`

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/account/account-owner.ts apps/api/test/account-owner.test.ts
git commit -m "feat(api): add isAccountOwner helper (account-owner gate)"
```

---

### Task 3: `platform-support` module (identity + enroll + sync)

**Files:**
- Create: `apps/api/src/lib/account/platform-support.ts`
- Test: `apps/api/test/platform-support.test.ts`

**Interfaces:**
- Produces:
  - `platformSupportUserIds(env?: NodeJS.ProcessEnv): string[]`
  - `enrollPlatformSupport(db: Database, merchantId: string, opts?: { excludeUserId?: string; env?: NodeJS.ProcessEnv }): Promise<number>`
  - `syncPlatformSupport(db: Database, opts?: { env?: NodeJS.ProcessEnv }): Promise<{ supportIds: string[]; enrolled: number }>`

- [ ] **Step 1: Write the failing test** — `apps/api/test/platform-support.test.ts`

```ts
import { randomUUID } from 'node:crypto';
import { memberships, merchants } from '@lumina/db';
import { setupTestDb, firstOrThrow, type TestDb } from '@lumina/db/testing';
import { and, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  platformSupportUserIds,
  enrollPlatformSupport,
  syncPlatformSupport,
} from '../src/lib/account/platform-support.js';

let ctx: TestDb;
beforeAll(async () => { ctx = await setupTestDb(); });
afterAll(async () => { await ctx?.teardown(); });

async function newUser(): Promise<string> {
  const id = randomUUID();
  await ctx.db.execute(sql`insert into auth.users (id, email) values (${id}::uuid, ${`${id}@x.test`})`);
  return id;
}
async function newMerchant(): Promise<string> {
  return firstOrThrow(
    await ctx.db.insert(merchants).values({ name: 'Co', slug: `co-${randomUUID()}` }).returning(),
  ).id;
}
async function roleOf(merchantId: string, userId: string): Promise<string | undefined> {
  const [r] = await ctx.db
    .select({ role: memberships.role })
    .from(memberships)
    .where(and(eq(memberships.merchantId, merchantId), eq(memberships.userId, userId)))
    .limit(1);
  return r?.role;
}

describe('platformSupportUserIds', () => {
  it('parses, trims, dedupes, and drops invalid UUIDs', () => {
    const a = randomUUID(); const b = randomUUID();
    const env = { LUMINA_SUPPORT_USER_IDS: ` ${a}, ${b} ,${a}, not-a-uuid,` };
    expect(platformSupportUserIds(env)).toEqual([a, b]);
  });
  it('is empty when unset', () => {
    expect(platformSupportUserIds({})).toEqual([]);
  });
});

describe('enrollPlatformSupport', () => {
  it('enrolls each configured id as role=support, idempotently', async () => {
    const s1 = await newUser(); const s2 = await newUser();
    const m = await newMerchant();
    const env = { LUMINA_SUPPORT_USER_IDS: `${s1},${s2}` };
    expect(await enrollPlatformSupport(ctx.db, m, { env })).toBe(2);
    expect(await roleOf(m, s1)).toBe('support');
    expect(await roleOf(m, s2)).toBe('support');
    // idempotent — re-run inserts nothing new
    await enrollPlatformSupport(ctx.db, m, { env });
    const [{ n }] = await ctx.db
      .select({ n: sql<number>`count(*)::int` })
      .from(memberships)
      .where(eq(memberships.merchantId, m));
    expect(n).toBe(2);
  });

  it('skips excludeUserId (creator is support)', async () => {
    const s1 = await newUser();
    const m = await newMerchant();
    const env = { LUMINA_SUPPORT_USER_IDS: `${s1}` };
    expect(await enrollPlatformSupport(ctx.db, m, { excludeUserId: s1, env })).toBe(0);
    expect(await roleOf(m, s1)).toBeUndefined();
  });

  it('is fail-safe: a configured id not in auth.users does not throw and does not block valid ids', async () => {
    const good = await newUser();
    const ghost = randomUUID(); // never inserted into auth.users → FK would fail
    const m = await newMerchant();
    const env = { LUMINA_SUPPORT_USER_IDS: `${ghost},${good}` };
    const enrolled = await enrollPlatformSupport(ctx.db, m, { env });
    expect(enrolled).toBe(1);
    expect(await roleOf(m, good)).toBe('support');
    expect(await roleOf(m, ghost)).toBeUndefined();
  });

  it('no-op when unconfigured', async () => {
    const m = await newMerchant();
    expect(await enrollPlatformSupport(ctx.db, m, { env: {} })).toBe(0);
  });
});

describe('syncPlatformSupport', () => {
  it('backfills support membership into every existing merchant and is idempotent', async () => {
    const s1 = await newUser();
    const m1 = await newMerchant(); const m2 = await newMerchant();
    const env = { LUMINA_SUPPORT_USER_IDS: `${s1}` };
    const res = await syncPlatformSupport(ctx.db, { env });
    expect(res.supportIds).toEqual([s1]);
    expect(await roleOf(m1, s1)).toBe('support');
    expect(await roleOf(m2, s1)).toBe('support');
    // idempotent
    await syncPlatformSupport(ctx.db, { env });
    expect(await roleOf(m1, s1)).toBe('support');
  });
});
```

- [ ] **Step 2: Run, verify FAIL** — `pnpm -F @lumina/api test -- platform-support.test.ts` (FAIL: module missing)

- [ ] **Step 3: Implement** — `apps/api/src/lib/account/platform-support.ts`

```ts
import { z } from 'zod';
import { memberships, merchants, type Database } from '@lumina/db';
import { sql } from 'drizzle-orm';

const UuidSchema = z.string().uuid();

/** The internal platform-support account ids, from `LUMINA_SUPPORT_USER_IDS` (comma-separated UUIDs). */
export function platformSupportUserIds(env: NodeJS.ProcessEnv = process.env): string[] {
  const raw = env.LUMINA_SUPPORT_USER_IDS ?? '';
  const seen = new Set<string>();
  for (const part of raw.split(',')) {
    const id = part.trim();
    if (id && UuidSchema.safeParse(id).success) seen.add(id);
  }
  return [...seen];
}

/**
 * Enroll each configured support account as a `role='support'` member of `merchantId`. Idempotent
 * (unique merchant+user → onConflictDoNothing). FAIL-SAFE: each id is inserted independently and a
 * failure (e.g. an id absent from auth.users → FK violation) is swallowed so it can never break the
 * caller (workspace creation). Returns the number of rows actually inserted.
 */
export async function enrollPlatformSupport(
  db: Database,
  merchantId: string,
  opts: { excludeUserId?: string; env?: NodeJS.ProcessEnv } = {},
): Promise<number> {
  const ids = platformSupportUserIds(opts.env).filter((id) => id !== opts.excludeUserId);
  let enrolled = 0;
  for (const userId of ids) {
    try {
      const rows = await db
        .insert(memberships)
        .values({ merchantId, userId, role: 'support' })
        .onConflictDoNothing()
        .returning({ id: memberships.id });
      enrolled += rows.length;
    } catch {
      // Misconfigured support id (not a real auth.users row, etc.) must never break the caller.
    }
  }
  return enrolled;
}

/**
 * Backfill: ensure every existing merchant has a `role='support'` membership for each configured support
 * account. Idempotent and re-runnable. Returns the configured ids + total rows inserted.
 */
export async function syncPlatformSupport(
  db: Database,
  opts: { env?: NodeJS.ProcessEnv } = {},
): Promise<{ supportIds: string[]; enrolled: number }> {
  const supportIds = platformSupportUserIds(opts.env);
  let enrolled = 0;
  for (const userId of supportIds) {
    try {
      const rows = await db.execute(sql`
        insert into ${memberships} (merchant_id, user_id, role)
        select ${merchants}.id, ${userId}::uuid, 'support'
        from ${merchants}
        on conflict (merchant_id, user_id) do nothing
      `);
      // postgres-js returns a result with a row count; rows affected:
      enrolled += (rows as unknown as { count?: number }).count ?? 0;
    } catch {
      // Skip a bad id; the rest still sync.
    }
  }
  return { supportIds, enrolled };
}
```

> Note on `syncPlatformSupport` count: postgres-js returns `count` for write statements. If the count
> shape differs at runtime, the tests assert membership rows directly (not the returned number), so the
> backfill correctness does not depend on the count value.

- [ ] **Step 4: Run, verify PASS** — `pnpm -F @lumina/api test -- platform-support.test.ts`

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/account/platform-support.ts apps/api/test/platform-support.test.ts
git commit -m "feat(api): platform-support identity + enroll + backfill helpers"
```

---

### Task 4: Auto-enroll support at workspace creation

**Files:**
- Modify: `apps/api/src/lib/bootstrap.ts` (`createWorkspace`, ~line 156)
- Test: `apps/api/test/bootstrap-support.test.ts` (create)

**Interfaces:**
- Consumes: `enrollPlatformSupport` (Task 3).
- Produces: every workspace created via `createWorkspace` (both first-login and "create another") has support memberships (best-effort, post-commit).

- [ ] **Step 1: Write the failing test** — `apps/api/test/bootstrap-support.test.ts`

```ts
import { randomUUID } from 'node:crypto';
import { memberships } from '@lumina/db';
import { setupTestDb, type TestDb } from '@lumina/db/testing';
import { and, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, afterEach, describe, expect, it } from 'vitest';
import { createWorkspace } from '../src/lib/bootstrap.js';

let ctx: TestDb;
beforeAll(async () => { ctx = await setupTestDb(); });
afterAll(async () => { await ctx?.teardown(); });
afterEach(() => { delete process.env.LUMINA_SUPPORT_USER_IDS; });

async function newUser(): Promise<string> {
  const id = randomUUID();
  await ctx.db.execute(sql`insert into auth.users (id, email) values (${id}::uuid, ${`${id}@x.test`})`);
  return id;
}
async function roleOf(merchantId: string, userId: string): Promise<string | undefined> {
  const [r] = await ctx.db
    .select({ role: memberships.role })
    .from(memberships)
    .where(and(eq(memberships.merchantId, merchantId), eq(memberships.userId, userId)))
    .limit(1);
  return r?.role;
}

describe('createWorkspace + platform support', () => {
  it('adds the support account as a hidden member of the new workspace', async () => {
    const support = await newUser();
    const owner = await newUser();
    process.env.LUMINA_SUPPORT_USER_IDS = support;
    const { merchantId } = await createWorkspace(ctx.db, { userId: owner, name: 'Acme' });
    expect(await roleOf(merchantId, owner)).toBe('owner');
    expect(await roleOf(merchantId, support)).toBe('support');
  });

  it('does not self-enroll when the creator is the support account', async () => {
    const support = await newUser();
    process.env.LUMINA_SUPPORT_USER_IDS = support;
    const { merchantId } = await createWorkspace(ctx.db, { userId: support, name: 'Internal' });
    expect(await roleOf(merchantId, support)).toBe('owner'); // owner row only, no duplicate support row
  });

  it('still creates the workspace when support is misconfigured (ghost id)', async () => {
    const owner = await newUser();
    process.env.LUMINA_SUPPORT_USER_IDS = randomUUID(); // not a real auth.users row
    const { merchantId, created } = await createWorkspace(ctx.db, { userId: owner, name: 'Resilient' });
    expect(created).toBe(true);
    expect(await roleOf(merchantId, owner)).toBe('owner');
  });
});
```

- [ ] **Step 2: Run, verify FAIL** — `pnpm -F @lumina/api test -- bootstrap-support.test.ts` (FAIL: no support row)

- [ ] **Step 3: Implement** — `apps/api/src/lib/bootstrap.ts`

Add import at top:

```ts
import { enrollPlatformSupport } from './account/platform-support.js';
```

Refactor `createWorkspace` so the transaction result is captured, then support is enrolled post-commit (best-effort), then returned. Replace the final `return db.transaction(async (tx) => { ... });` wrapper so it reads:

```ts
export async function createWorkspace(
  db: Database,
  input: { userId: string; name: string; slugBase?: string },
): Promise<BootstrapResult> {
  const result = await db.transaction(async (tx) => {
    // ... existing body unchanged, ending with:
    return { merchantId, created: true, keys };
  });

  // Enroll the internal platform-support account(s) as hidden members of the new workspace. Best-effort
  // and POST-COMMIT: a misconfigured LUMINA_SUPPORT_USER_IDS must never fail a customer's signup /
  // workspace creation. `support:sync` is the backstop for any miss.
  try {
    await enrollPlatformSupport(db, result.merchantId, { excludeUserId: input.userId });
  } catch {
    // never propagate
  }

  return result;
}
```

- [ ] **Step 4: Run, verify PASS** — `pnpm -F @lumina/api test -- bootstrap-support.test.ts`

- [ ] **Step 5: Run the existing bootstrap/invitations suites to confirm no regression**

Run: `pnpm -F @lumina/api test -- bootstrap invitations`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/lib/bootstrap.ts apps/api/test/bootstrap-support.test.ts
git commit -m "feat(api): auto-enroll platform support on workspace creation (best-effort)"
```

---

### Task 5: Hide support from the member list

**Files:**
- Modify: `apps/api/src/lib/account/service.ts` (`listTeam`)
- Test: `apps/api/test/team-hides-support.test.ts` (create)

**Interfaces:**
- Produces: `listTeam` excludes `role='support'` rows.

- [ ] **Step 1: Write the failing test** — `apps/api/test/team-hides-support.test.ts`

```ts
import { randomUUID } from 'node:crypto';
import { memberships, merchants } from '@lumina/db';
import { setupTestDb, firstOrThrow, type TestDb } from '@lumina/db/testing';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { listTeam } from '../src/lib/account/service.js';

let ctx: TestDb;
beforeAll(async () => { ctx = await setupTestDb(); });
afterAll(async () => { await ctx?.teardown(); });

async function newUser(): Promise<string> {
  const id = randomUUID();
  await ctx.db.execute(sql`insert into auth.users (id, email) values (${id}::uuid, ${`${id}@x.test`})`);
  return id;
}

describe('listTeam', () => {
  it('hides role=support members from the workspace member list', async () => {
    const owner = await newUser();
    const support = await newUser();
    const m = firstOrThrow(
      await ctx.db.insert(merchants).values({ name: 'Co', slug: `co-${randomUUID()}` }).returning(),
    ).id;
    await ctx.db.insert(memberships).values({ merchantId: m, userId: owner, role: 'owner' });
    await ctx.db.insert(memberships).values({ merchantId: m, userId: support, role: 'support' });

    const team = await listTeam(ctx.db, m);
    const ids = team.map((t) => t.userId);
    expect(ids).toContain(owner);
    expect(ids).not.toContain(support);
  });
});
```

- [ ] **Step 2: Run, verify FAIL** — `pnpm -F @lumina/api test -- team-hides-support.test.ts`

- [ ] **Step 3: Implement** — `apps/api/src/lib/account/service.ts`

In `listTeam`, add `ne` to the drizzle import and add the role filter:

```ts
import { and, eq, ne } from 'drizzle-orm';
// ...
    .where(and(eq(memberships.merchantId, merchantId), ne(memberships.role, 'support')))
```

(Update the existing `.where(eq(memberships.merchantId, merchantId))` to the `and(...)` form above; merge with the existing import line — do not duplicate imports.)

- [ ] **Step 4: Run, verify PASS** — `pnpm -F @lumina/api test -- team-hides-support.test.ts`

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/account/service.ts apps/api/test/team-hides-support.test.ts
git commit -m "feat(api): hide internal support members from the team list"
```

---

### Task 6: Account-owner gate on billing checkout + portal

**Files:**
- Modify: `apps/api/src/app/api/v1/billing/checkout/route.ts`
- Modify: `apps/api/src/app/api/v1/billing/portal/route.ts`
- Test: covered by `apps/api/test/account-owner.test.ts` (Task 2) for the gate predicate; route wiring verified by typecheck.

**Interfaces:**
- Consumes: `isAccountOwner` (Task 2).
- Produces: both routes return `401 unauthorized` when the caller is not the account owner.

- [ ] **Step 1: Implement checkout gate** — `apps/api/src/app/api/v1/billing/checkout/route.ts`

Add import:

```ts
import { isAccountOwner } from '@/lib/account/account-owner';
```

Right after the `requireMerchant()` guard block (after `if (!guard.ok) { return guard.response; }`), add:

```ts
  if (!(await isAccountOwner(guard.db, guard.merchantId, guard.user.id))) {
    return errorResponse('unauthorized', 'Only the account owner can manage billing.');
  }
```

- [ ] **Step 2: Implement portal gate** — `apps/api/src/app/api/v1/billing/portal/route.ts`

Add imports (`isAccountOwner` and ensure `errorResponse` is imported alongside the existing `jsonResponse, serverError`):

```ts
import { errorResponse, jsonResponse, serverError } from '@/lib/http';
import { isAccountOwner } from '@/lib/account/account-owner';
```

After the guard block add:

```ts
  if (!(await isAccountOwner(guard.db, guard.merchantId, guard.user.id))) {
    return errorResponse('unauthorized', 'Only the account owner can manage billing.');
  }
```

- [ ] **Step 3: Typecheck + run the billing/account-owner suites**

Run: `pnpm -F @lumina/api typecheck && pnpm -F @lumina/api test -- account-owner billing`
Expected: PASS (account-owner predicate proven; routes compile).

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/app/api/v1/billing/checkout/route.ts apps/api/src/app/api/v1/billing/portal/route.ts
git commit -m "fix(api): require account owner for billing checkout + portal (blocks support, closes hole)"
```

---

### Task 7: `support:sync` backfill script + wiring

**Files:**
- Create: `apps/api/scripts/sync-platform-support.ts`
- Modify: `apps/api/package.json` (add `"support:sync"` script)
- Modify: `package.json` (root passthrough `"support:sync"`)

**Interfaces:**
- Consumes: `syncPlatformSupport` (Task 3), `createDb` from `@lumina/db`.

- [ ] **Step 1: Implement script** — `apps/api/scripts/sync-platform-support.ts`

```ts
/**
 * support:sync — backfill: make every existing workspace have the internal platform-support account(s)
 * as `role='support'` members. Idempotent + re-runnable (e.g. after adding a new internal account).
 *
 * Requires env: DATABASE_URL (privileged) + LUMINA_SUPPORT_USER_IDS (comma-separated auth.users UUIDs).
 * Run: `DATABASE_URL=… LUMINA_SUPPORT_USER_IDS=… pnpm -F @lumina/api support:sync`
 */
import { fileURLToPath } from 'node:url';
import { createDb } from '@lumina/db';
import { syncPlatformSupport } from '../src/lib/account/platform-support.js';
import { platformSupportUserIds } from '../src/lib/account/platform-support.js';

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');
  const ids = platformSupportUserIds(process.env);
  if (ids.length === 0) {
    console.log('LUMINA_SUPPORT_USER_IDS is empty — nothing to sync.');
    return;
  }
  const { db } = createDb(url, { max: 1, prepare: false });
  const res = await syncPlatformSupport(db);
  console.log(`✓ support:sync — ids=${res.supportIds.join(',')} rows_inserted=${res.enrolled}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
}
```

- [ ] **Step 2: Wire `apps/api/package.json` scripts** — add to `"scripts"`:

```json
    "support:sync": "tsx scripts/sync-platform-support.ts"
```

- [ ] **Step 3: Wire root `package.json` passthrough** — add to `"scripts"`:

```json
    "support:sync": "pnpm -F @lumina/api support:sync"
```

- [ ] **Step 4: Typecheck** — `pnpm -F @lumina/api typecheck` → PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/scripts/sync-platform-support.ts apps/api/package.json package.json
git commit -m "feat(api): support:sync backfill script for existing workspaces"
```

---

### Task 8: Docs + env example + DECISIONS

**Files:**
- Modify: `.env.example`
- Modify: `docs/DECISIONS.md`

- [ ] **Step 1: Add env var to `.env.example`**

```bash
# Internal platform-support accounts (comma-separated auth.users UUIDs). These accounts are auto-enrolled
# as hidden `role='support'` members of every workspace (super-admin, no billing). Empty = feature off.
LUMINA_SUPPORT_USER_IDS=
```

- [ ] **Step 2: Append a DECISIONS entry** — `docs/DECISIONS.md`

```markdown
## Platform support super-admin (cross-tenant by explicit membership) — 2026-06-26

The internal `support` account is auto-enrolled as a `role='support'` member of every workspace (at
creation via `createWorkspace`, backfilled by `pnpm support:sync`) and hidden from merchants' member
lists (`listTeam` excludes `role='support'`). Accounts are named by env `LUMINA_SUPPORT_USER_IDS`. This is
a **sanctioned exception** to HARD RULE #1 (tenant isolation): access is still single-tenant per request
(every query scoped to one `merchant_id` the user is a member of) — support simply has a membership
everywhere. `role='support'` is reserved (removed from `INVITABLE_ROLES`; the invite route already forced
`member`). Powers: full operational super-admin EXCEPT billing — checkout/portal/plan-change, workspace
delete/reactivate, and account closure stay account-owner/owner-only. Enrollment is best-effort + post
-commit so a misconfigured id can never break workspace creation.
```

- [ ] **Step 3: Commit**

```bash
git add .env.example docs/DECISIONS.md
git commit -m "docs(support): document platform-support super-admin + env var"
```

---

### Task 9: Full quality gates

- [ ] **Step 1: Lint + typecheck + full test suite**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: all PASS.

- [ ] **Step 2:** If anything fails, fix inline and re-run. Do not proceed until green.

---

## Self-Review

- **Spec coverage:** A=Task 3 (`platformSupportUserIds`), B=Task 4, C=Tasks 3+7, D=Tasks 5+1, E=Tasks 2+6, verification=Tasks 1-7 tests + owner manual. All covered.
- **Placeholder scan:** none — every step has concrete code/commands.
- **Type consistency:** `enrollPlatformSupport(db, merchantId, { excludeUserId, env })`, `platformSupportUserIds(env)`, `syncPlatformSupport(db, { env })`, `isAccountOwner(db, merchantId, userId)` — used consistently across tasks 2/3/4/6/7.

## Post-implementation (owner)

- Assistant fetches the owner's `auth.users` UUID (Supabase MCP, read-only) and provides it.
- Owner sets `LUMINA_SUPPORT_USER_IDS` on the **api** Vercel project + runs `pnpm support:sync`.
- Assistant verifies (read-only) the owner has a `role='support'` membership in every merchant.

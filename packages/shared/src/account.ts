import { z } from 'zod';
import { KeyEnvSchema, KeyKindSchema, MemberRoleSchema, PlanTierSchema } from './enums.js';

/**
 * Hostname (no scheme, no path) for the merchant's allowed-domains list. Accepts `localhost`,
 * normal domains, and a leading `*.` wildcard. Rejects URLs, paths, and empty strings.
 */
const HOSTNAME_RE =
  /^(\*\.)?([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/i;
export const HostnameSchema = z.string().min(1).max(253).regex(HOSTNAME_RE, 'invalid hostname');

export const DomainsSchema = z.object({
  domains: z.array(HostnameSchema),
});
export type Domains = z.infer<typeof DomainsSchema>;

/** Safe public view of an API key — never includes the secret or its hash (§6.3). */
export const ApiKeySummarySchema = z.object({
  id: z.string(),
  kind: KeyKindSchema,
  env: KeyEnvSchema,
  prefix: z.string(),
  lastUsedAt: z.string().nullable(),
  revokedAt: z.string().nullable(),
});
export type ApiKeySummary = z.infer<typeof ApiKeySummarySchema>;

export const CreateKeyRequestSchema = z.object({
  kind: KeyKindSchema,
  env: KeyEnvSchema,
});
export type CreateKeyRequest = z.infer<typeof CreateKeyRequestSchema>;

/** The raw key is returned exactly once, on creation (§1.2 / §6.3 "reveal once"). */
export const CreateKeyResponseSchema = z.object({
  id: z.string(),
  key: z.string(),
});
export type CreateKeyResponse = z.infer<typeof CreateKeyResponseSchema>;

export const MeMerchantSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  role: MemberRoleSchema,
  plan: PlanTierSchema,
  creditsBalance: z.number().int(),
});
export type MeMerchant = z.infer<typeof MeMerchantSchema>;

/** `GET /v1/me` (§6.3) — current user + their merchant memberships. */
export const MeResponseSchema = z.object({
  user: z.object({
    id: z.string(),
    email: z.string().email(),
  }),
  merchants: z.array(MeMerchantSchema),
});
export type MeResponse = z.infer<typeof MeResponseSchema>;

/** A member of the active merchant (Settings → Team). Email comes from Supabase auth. */
export const TeamMemberSchema = z.object({
  userId: z.string(),
  email: z.string().nullable(),
  role: MemberRoleSchema,
  joinedAt: z.string(),
});
export type TeamMember = z.infer<typeof TeamMemberSchema>;

/** `GET /v1/team` (§6.3) — members of the session's active merchant. */
export const TeamResponseSchema = z.object({
  members: z.array(TeamMemberSchema),
});
export type TeamResponse = z.infer<typeof TeamResponseSchema>;

/** `PUT /v1/merchant` — editable merchant fields (Settings → Account). */
export const MerchantUpdateSchema = z.object({
  name: z.string().min(1).max(80),
});
export type MerchantUpdate = z.infer<typeof MerchantUpdateSchema>;

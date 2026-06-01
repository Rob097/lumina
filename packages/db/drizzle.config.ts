import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/postgres',
  },
  // We hand-author RLS/policies/functions as a custom migration; keep generated output focused.
  verbose: true,
  strict: true,
});

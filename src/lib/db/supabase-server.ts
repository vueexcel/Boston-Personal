import { createPostgresShim, type PostgresShimClient } from "@/lib/db/postgres-shim";

type GlobalDb = typeof globalThis & {
  __bostelDb?: PostgresShimClient;
};

/**
 * Server-side PostgreSQL client (replaces Supabase service role).
 * API shape is compatible with existing `.from(...).select(...)` call sites.
 */
export function createServerSupabase(): PostgresShimClient {
  const g = globalThis as GlobalDb;
  if (!g.__bostelDb) {
    g.__bostelDb = createPostgresShim();
  }
  return g.__bostelDb;
}

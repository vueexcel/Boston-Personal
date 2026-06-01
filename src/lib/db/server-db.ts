/**
 * PostgreSQL data access (replaces Supabase service-role client).
 */
export { getDatabaseUrl, getPgPool, query, queryOne } from "@/lib/db/postgres";

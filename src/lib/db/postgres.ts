import "server-only";

import pg from "pg";

const { Pool } = pg;

type GlobalPg = typeof globalThis & {
  __bostelPgPool?: pg.Pool;
};

export function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error(
      "DATABASE_URL is not configured. Set a PostgreSQL connection string (AWS RDS or local).",
    );
  }
  return url;
}

/**
 * Shared PostgreSQL pool (server-only). Uses DATABASE_URL.
 */
export function getPgPool(): pg.Pool {
  const g = globalThis as GlobalPg;
  if (g.__bostelPgPool) return g.__bostelPgPool;

  const pool = new Pool({
    connectionString: getDatabaseUrl(),
    max: Number.parseInt(process.env.DATABASE_POOL_MAX ?? "10", 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    ssl:
      process.env.DATABASE_SSL === "1" ||
      process.env.DATABASE_SSL === "true"
        ? { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "0" }
        : undefined,
  });

  g.__bostelPgPool = pool;
  return pool;
}

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<pg.QueryResult<T>> {
  return getPgPool().query<T>(text, params);
}

export async function queryOne<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<T | null> {
  const result = await query<T>(text, params);
  return result.rows[0] ?? null;
}

import { queryOne } from "@/lib/db/postgres";

export type PostgresPingResult =
  | { ok: true; latencyMs: number }
  | { ok: false; error: string };

export async function pingPostgres(): Promise<PostgresPingResult> {
  const start = Date.now();
  try {
    await queryOne("SELECT 1 AS ok");
    return { ok: true, latencyMs: Date.now() - start };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Postgres ping failed",
    };
  }
}

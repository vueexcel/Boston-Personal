import { pingPostgres } from "@/lib/health/postgres-ping";
import { pingRedis } from "@/lib/health/redis-ping";

export const runtime = "nodejs";

/**
 * Liveness/readiness for load balancers. Returns 503 when Redis or Postgres is unreachable.
 */
export async function GET(): Promise<Response> {
  const [redis, postgres] = await Promise.all([pingRedis(), pingPostgres()]);
  const ok = redis.ok && postgres.ok;
  const body = {
    status: ok ? "ok" : "degraded",
    redis: redis.ok
      ? { ok: true, latencyMs: redis.latencyMs }
      : { ok: false, error: redis.error },
    postgres: postgres.ok
      ? { ok: true, latencyMs: postgres.latencyMs }
      : { ok: false, error: postgres.error },
    timestamp: new Date().toISOString(),
  };

  return Response.json(body, {
    status: ok ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}

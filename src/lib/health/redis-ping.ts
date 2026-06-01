import { getRedis } from "@/lib/cache/redis";

export type RedisPingResult =
  | { ok: true; latencyMs: number }
  | { ok: false; error: string };

/**
 * Pings Redis for readiness probes (ALB / ECS health checks).
 */
export async function pingRedis(): Promise<RedisPingResult> {
  const started = Date.now();
  try {
    const redis = getRedis();
    const pong = await redis.ping();
    if (pong !== "PONG") {
      return { ok: false, error: `unexpected ping response: ${pong}` };
    }
    return { ok: true, latencyMs: Date.now() - started };
  } catch (e) {
    const message = e instanceof Error ? e.message : "redis ping failed";
    return { ok: false, error: message };
  }
}

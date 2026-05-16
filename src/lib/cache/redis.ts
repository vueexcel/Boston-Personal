import Redis from "ioredis";

type GlobalRedis = typeof globalThis & { __bostelRedis?: Redis };

/**
 * Returns a shared Redis connection for caching (short TTL reads of Postgres-backed entities).
 * Lazily connects using `REDIS_URL` from the environment.
 */
export function getRedis(): Redis {
  const g = globalThis as GlobalRedis;
  if (g.__bostelRedis) {
    return g.__bostelRedis;
  }
  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error("REDIS_URL is not configured");
  }
  const client = new Redis(url, {
    maxRetriesPerRequest: 2,
    enableReadyCheck: true,
  });
  g.__bostelRedis = client;
  return client;
}

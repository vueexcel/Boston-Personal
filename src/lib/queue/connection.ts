import Redis from "ioredis";

/**
 * Creates a dedicated Redis connection for BullMQ (not shared with ad-hoc cache commands).
 * BullMQ requires `maxRetriesPerRequest: null` on ioredis.
 *
 * @param url - Redis URL (typically `REDIS_URL`).
 */
export function createBullmqConnection(url: string): Redis {
  return new Redis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  });
}

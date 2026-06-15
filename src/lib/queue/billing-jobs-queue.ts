import { Queue } from "bullmq";
import { createBullmqConnection } from "@/lib/queue/connection";

/** BullMQ queue names must not contain `:`. */
export const BILLING_JOBS_QUEUE = "bostel-billing-jobs";

export const BILLING_JOB_CLOSE_PERIODS = "close_periods";

export const BILLING_JOB_SCHEDULER_ID = "billing-close-periods";

let billingQueue: Queue | null = null;

export function isBillingJobsEnabled(): boolean {
  const flag = process.env.BILLING_JOBS_ENABLED?.trim().toLowerCase();
  if (flag === "0" || flag === "false" || flag === "no") {
    return false;
  }
  if (flag === "1" || flag === "true" || flag === "yes") {
    return true;
  }
  return Boolean(
    process.env.REDIS_URL?.trim() && process.env.DATABASE_URL?.trim(),
  );
}

export function getBillingClosePeriodsCron(): string {
  const raw = process.env.BILLING_CLOSE_PERIODS_CRON?.trim();
  if (!raw) {
    throw new Error(
      "BILLING_CLOSE_PERIODS_CRON is required when billing jobs are enabled (e.g. 0 6 * * *)",
    );
  }
  return raw;
}

export function getBillingJobsQueue(): Queue {
  if (billingQueue) return billingQueue;
  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error("REDIS_URL is not configured");
  }
  billingQueue = new Queue(BILLING_JOBS_QUEUE, {
    connection: createBullmqConnection(url),
  });
  return billingQueue;
}

/**
 * Registers (or updates) the daily billing period close repeatable job.
 * Safe to call on every worker startup — upsert is idempotent.
 */
export async function ensureBillingJobScheduler(): Promise<string> {
  const pattern = getBillingClosePeriodsCron();
  const queue = getBillingJobsQueue();
  const scheduler = await queue.jobScheduler;
  await scheduler.upsertJobScheduler(
    BILLING_JOB_SCHEDULER_ID,
    { pattern },
    BILLING_JOB_CLOSE_PERIODS,
    {},
    {
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: 50,
      removeOnFail: 100,
    },
    { override: true },
  );
  console.info(`[billing] scheduler registered: ${pattern}`);
  return pattern;
}

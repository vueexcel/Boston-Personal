import { Worker, type Job } from "bullmq";
import { createBullmqConnection } from "@/lib/queue/connection";
import {
  BILLING_JOBS_QUEUE,
  BILLING_JOB_CLOSE_PERIODS,
} from "@/lib/queue/billing-jobs-queue";
import { closeDueBillingPeriods } from "@/lib/services/tenant-billing";

export type BillingJobData = Record<string, never>;

export function createBillingJobsWorker(redisUrl: string): Worker {
  return new Worker<BillingJobData>(
    BILLING_JOBS_QUEUE,
    async (job: Job<BillingJobData>) => {
      if (job.name !== BILLING_JOB_CLOSE_PERIODS) {
        console.warn("[billing] unknown job name", { name: job.name });
        return;
      }
      const closed = await closeDueBillingPeriods(new Date());
      console.info(`[billing] Closed ${closed} billing period(s).`);
    },
    { connection: createBullmqConnection(redisUrl) },
  );
}

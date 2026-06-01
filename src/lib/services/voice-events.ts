import { getVoiceEventsQueue } from "@/lib/queue/queues";

/**
 * Enqueues an inbound voice lifecycle event for async processing (BullMQ).
 * Jobs are always labeled with `tenantId` so workers never co-mingle tenant payloads.
 *
 * @param input - Tenant-scoped identifiers for the call.
 */
export async function enqueueInboundVoiceStarted(input: {
  tenantId: string;
  callId: string;
}): Promise<void> {
  const queue = getVoiceEventsQueue();
  await queue.add(
    "inbound_started",
    {
      tenantId: input.tenantId,
      callId: input.callId,
      kind: "inbound_started" as const,
      recordedAtUtc: new Date().toISOString(),
    },
    { removeOnComplete: 1000, attempts: 3, backoff: { type: "exponential", delay: 2000 } },
  );
}

export async function enqueueInboundVoiceCompleted(input: {
  tenantId: string;
  callId: string;
}): Promise<void> {
  const queue = getVoiceEventsQueue();
  await queue.add(
    "inbound_completed",
    {
      tenantId: input.tenantId,
      callId: input.callId,
      kind: "inbound_completed" as const,
      recordedAtUtc: new Date().toISOString(),
    },
    { removeOnComplete: 1000, attempts: 3, backoff: { type: "exponential", delay: 2000 } },
  );
}

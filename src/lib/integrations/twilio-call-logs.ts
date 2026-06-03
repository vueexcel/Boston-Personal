import { getTwilioClient } from "@/lib/integrations/twilio";
import type { TwilioCallInsights } from "@/lib/types/twilio-call-insights";

export type { TwilioCallInsights };

function parseTwilioDate(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && value.trim()) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  return null;
}

function mapTwilioCallResource(call: {
  sid: string;
  status?: string;
  direction?: string;
  duration?: string | number;
  startTime?: Date | string;
  endTime?: Date | string;
  dateCreated?: Date | string;
  from?: string;
  to?: string;
  fromFormatted?: string;
  toFormatted?: string;
  answeredBy?: string;
  callerName?: string;
  forwardedFrom?: string;
  price?: string;
  priceUnit?: string;
  queueTime?: string | number;
  parentCallSid?: string;
  phoneNumberSid?: string;
}): TwilioCallInsights {
  const durationRaw = call.duration;
  const durationSeconds =
    durationRaw != null && !Number.isNaN(Number(durationRaw))
      ? Number(durationRaw)
      : null;

  const queueRaw = call.queueTime;
  const queueTimeMs =
    queueRaw != null && !Number.isNaN(Number(queueRaw))
      ? Number(queueRaw)
      : null;

  return {
    sid: call.sid,
    status: call.status ?? null,
    direction: call.direction ?? null,
    durationSeconds,
    startTime: parseTwilioDate(call.startTime),
    endTime: parseTwilioDate(call.endTime),
    dateCreated: parseTwilioDate(call.dateCreated),
    from: call.from ?? null,
    to: call.to ?? null,
    fromFormatted: call.fromFormatted ?? null,
    toFormatted: call.toFormatted ?? null,
    answeredBy: call.answeredBy ?? null,
    callerName: call.callerName ?? null,
    forwardedFrom: call.forwardedFrom ?? null,
    price: call.price ?? null,
    priceUnit: call.priceUnit ?? null,
    queueTimeMs,
    parentCallSid: call.parentCallSid ?? null,
    phoneNumberSid: call.phoneNumberSid ?? null,
  };
}

/**
 * Fetches a single call by Call SID (`client.calls(sid).fetch()`).
 */
export async function fetchTwilioCallInsights(
  callSid: string,
): Promise<TwilioCallInsights | null> {
  if (!callSid.trim()) return null;
  const client = getTwilioClient();
  try {
    const call = await client.calls(callSid).fetch();
    return mapTwilioCallResource(call);
  } catch {
    return null;
  }
}

/**
 * Fetches recent calls from Twilio (`client.calls.list()`), optionally filtered.
 */
export async function listTwilioCallInsights(params?: {
  status?: string;
  to?: string;
  from?: string;
  startTimeAfter?: Date;
  startTimeBefore?: Date;
  limit?: number;
}): Promise<TwilioCallInsights[]> {
  const client = getTwilioClient();
  const listParams: Record<string, unknown> = {
    limit: params?.limit ?? 50,
  };
  if (params?.status) listParams.status = params.status;
  if (params?.to) listParams.to = params.to;
  if (params?.from) listParams.from = params.from;
  if (params?.startTimeAfter) {
    listParams.startTimeAfter = params.startTimeAfter;
  }
  if (params?.startTimeBefore) {
    listParams.startTimeBefore = params.startTimeBefore;
  }

  const calls = await client.calls.list(listParams);
  return calls.map((c) => mapTwilioCallResource(c));
}

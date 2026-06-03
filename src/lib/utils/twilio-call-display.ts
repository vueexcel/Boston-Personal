import type { TwilioCallInsights } from "@/lib/types/twilio-call-insights";

export type { TwilioCallInsights };

export type TwilioCallDisplayFields = {
  twilioStatus: string;
  direction: string;
  answeredBy: string;
  cost: string | null;
  queueTime: string | null;
};

export function twilioInsightsFromMetadata(
  metadata: Record<string, unknown> | null | undefined,
): TwilioCallInsights | null {
  const raw = metadata?.twilioInsights;
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.sid !== "string") return null;
  return {
    sid: o.sid,
    status: typeof o.status === "string" ? o.status : null,
    direction: typeof o.direction === "string" ? o.direction : null,
    durationSeconds:
      typeof o.durationSeconds === "number" ? o.durationSeconds : null,
    startTime: typeof o.startTime === "string" ? o.startTime : null,
    endTime: typeof o.endTime === "string" ? o.endTime : null,
    dateCreated: typeof o.dateCreated === "string" ? o.dateCreated : null,
    from: typeof o.from === "string" ? o.from : null,
    to: typeof o.to === "string" ? o.to : null,
    fromFormatted:
      typeof o.fromFormatted === "string" ? o.fromFormatted : null,
    toFormatted: typeof o.toFormatted === "string" ? o.toFormatted : null,
    answeredBy: typeof o.answeredBy === "string" ? o.answeredBy : null,
    callerName: typeof o.callerName === "string" ? o.callerName : null,
    forwardedFrom:
      typeof o.forwardedFrom === "string" ? o.forwardedFrom : null,
    price: typeof o.price === "string" ? o.price : null,
    priceUnit: typeof o.priceUnit === "string" ? o.priceUnit : null,
    queueTimeMs: typeof o.queueTimeMs === "number" ? o.queueTimeMs : null,
    parentCallSid:
      typeof o.parentCallSid === "string" ? o.parentCallSid : null,
    phoneNumberSid:
      typeof o.phoneNumberSid === "string" ? o.phoneNumberSid : null,
  };
}

export function formatTwilioDirection(direction: string | null): string {
  if (!direction) return "—";
  const d = direction.toLowerCase();
  if (d === "inbound") return "Inbound";
  if (d.startsWith("outbound")) return "Outbound";
  return direction;
}

export function formatTwilioAnsweredBy(answeredBy: string | null): string {
  if (!answeredBy) return "—";
  const a = answeredBy.toLowerCase();
  if (a === "human") return "Human";
  if (a.startsWith("machine")) return "Voicemail / machine";
  if (a === "fax") return "Fax";
  return answeredBy.replace(/_/g, " ");
}

export function formatTwilioStatus(status: string | null): string {
  if (!status) return "—";
  return status.charAt(0).toUpperCase() + status.slice(1).replace(/-/g, " ");
}

export function formatTwilioPrice(
  price: string | null,
  priceUnit: string | null,
): string | null {
  if (!price?.trim() || price === "0") return null;
  const unit = priceUnit?.trim() || "USD";
  return `${price} ${unit}`;
}

export function twilioDisplayFields(
  insights: TwilioCallInsights | null | undefined,
): TwilioCallDisplayFields | null {
  if (!insights) return null;
  const queueTime =
    insights.queueTimeMs != null && insights.queueTimeMs > 0
      ? `${(insights.queueTimeMs / 1000).toFixed(1)}s`
      : null;
  return {
    twilioStatus: formatTwilioStatus(insights.status),
    direction: formatTwilioDirection(insights.direction),
    answeredBy: formatTwilioAnsweredBy(insights.answeredBy),
    cost: formatTwilioPrice(insights.price, insights.priceUnit),
    queueTime,
  };
}

export function twilioStatusBadgeVariant(
  status: string | null,
): "success" | "secondary" | "warning" | "outline" {
  const s = (status ?? "").toLowerCase();
  if (s === "completed") return "success";
  if (s === "in-progress" || s === "ringing" || s === "queued") return "secondary";
  if (s === "busy" || s === "no-answer") return "warning";
  if (s === "failed" || s === "canceled") return "warning";
  return "outline";
}

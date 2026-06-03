import type { CallChatMessage } from "@/lib/services/twilio-call-agent";
import type { CallSentiment } from "@/lib/services/openai-agent";

export type TranscriptTurn = {
  role: "user" | "assistant";
  content: string;
};

export function buildTranscriptTurns(
  messages: CallChatMessage[],
): TranscriptTurn[] {
  return messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));
}

export function buildTranscriptPlainText(turns: TranscriptTurn[]): string {
  return turns.map((t) => `${t.role}: ${t.content}`).join("\n");
}

export function parseTranscriptTurns(
  metadata: Record<string, unknown> | null | undefined,
): TranscriptTurn[] {
  if (!metadata) return [];
  const raw = metadata.transcriptTurns;
  if (!Array.isArray(raw)) return [];
  const turns: TranscriptTurn[] = [];
  for (const item of raw) {
    if (
      item &&
      typeof item === "object" &&
      "role" in item &&
      "content" in item &&
      (item.role === "user" || item.role === "assistant") &&
      typeof item.content === "string"
    ) {
      turns.push({ role: item.role, content: item.content });
    }
  }
  return turns;
}

export function getMetadataString(
  metadata: Record<string, unknown> | null | undefined,
  key: string,
): string | null {
  const v = metadata?.[key];
  return typeof v === "string" ? v : null;
}

export function getMetadataSentiment(
  metadata: Record<string, unknown> | null | undefined,
): CallSentiment | null {
  const v = metadata?.sentiment;
  if (
    v === "positive" ||
    v === "neutral" ||
    v === "negative" ||
    v === "mixed"
  ) {
    return v;
  }
  return null;
}

export function getMetadataActionItems(
  metadata: Record<string, unknown> | null | undefined,
): string[] {
  const v = metadata?.actionItems;
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string");
}

export function dispositionLabel(
  status: string,
  disposition: string | null,
): string {
  if (disposition?.trim()) return disposition;
  switch (status) {
    case "COMPLETED":
      return "Completed";
    case "MISSED":
      return "Missed";
    case "FAILED":
      return "Failed";
    case "IN_PROGRESS":
      return "In progress";
    default:
      return "Initiated";
  }
}

export function creditsDisplay(
  metadata: Record<string, unknown> | null | undefined,
  durationSec: number | null,
): string {
  const insights = metadata?.twilioInsights;
  if (insights && typeof insights === "object") {
    const o = insights as Record<string, unknown>;
    const price = o.price;
    if (typeof price === "string" && price.trim() && price !== "0") {
      const unit =
        typeof o.priceUnit === "string" ? o.priceUnit : "USD";
      return `${price} ${unit}`;
    }
  }
  const price = metadata?.twilioPrice;
  if (typeof price === "string" && price.trim()) {
    const unit =
      typeof metadata?.twilioPriceUnit === "string"
        ? metadata.twilioPriceUnit
        : "USD";
    return `${price} ${unit}`;
  }
  if (typeof price === "number") {
    return price.toFixed(2);
  }
  if (durationSec != null && durationSec > 0) {
    const minutes = durationSec / 60;
    return (minutes * 100).toFixed(2);
  }
  return "0.00";
}

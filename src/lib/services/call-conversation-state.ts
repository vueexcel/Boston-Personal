import {
  getNextCollectField,
  type CollectedInfoMap,
} from "@/lib/services/call-collected-info";
import type { CallChatMessage } from "@/lib/services/twilio-call-agent";

export type ConversationIntent =
  | "general"
  | "information_inquiry"
  | "consultation_booking";

export type CallConversationState = {
  intent: ConversationIntent;
  slots: Record<string, string>;
  extras: Record<string, string[]>;
  missing: string[];
};

const BOOKING_KEYWORDS =
  /\b(book|booking|consultation|appointment|callback|schedule|slot)\b/i;
const INQUIRY_KEYWORDS =
  /\b(services?|pricing|price|fee|hours|open|products?|provide)\b/i;

const CHILDREN_PATTERN =
  /\b(?:child(?:ren)?|kids?)\b[^.!?]{0,60}\b(?:named?|called?|is|are)\b[^.!?]{0,40}/i;

function detectIntent(messages: CallChatMessage[]): ConversationIntent {
  const userText = messages
    .filter((m) => m.role === "user")
    .map((m) => m.content)
    .join(" ");
  if (BOOKING_KEYWORDS.test(userText)) return "consultation_booking";
  if (INQUIRY_KEYWORDS.test(userText)) return "information_inquiry";
  return "general";
}

function extractChildrenExtras(messages: CallChatMessage[]): string[] {
  const names: string[] = [];
  for (const m of messages) {
    if (m.role !== "user") continue;
    const line = m.content;
    if (!CHILDREN_PATTERN.test(line)) continue;
    const match = line.match(/\b([A-Z][a-z]+(?:\s+and\s+[A-Z][a-z]+)+)\b/);
    if (match?.[1]) {
      for (const n of match[1].split(/\s+and\s+/i)) {
        const t = n.trim();
        if (t) names.push(t);
      }
    }
    const nameRe = /\b(?:named?|called?)\s+([A-Z][a-z]+)(?:\s+and\s+([A-Z][a-z]+))?/gi;
    let sm: RegExpExecArray | null;
    while ((sm = nameRe.exec(line)) !== null) {
      if (sm[1]) names.push(sm[1]);
      if (sm[2]) names.push(sm[2]);
    }
  }
  return Array.from(new Set(names));
}

export function initialConversationState(
  infoToCollect: string[],
): CallConversationState {
  return {
    intent: "general",
    slots: {},
    extras: {},
    missing: [...infoToCollect],
  };
}

export function updateConversationState(
  messages: CallChatMessage[],
  infoToCollect: string[],
  collected: CollectedInfoMap,
  existing?: CallConversationState | null,
): CallConversationState {
  const intent = detectIntent(messages);
  const slots: Record<string, string> = { ...(existing?.slots ?? {}) };

  for (const field of infoToCollect) {
    const value = collected[field]?.trim();
    if (value) slots[field] = value;
  }

  const missing = infoToCollect.filter((f) => !slots[f]?.trim());
  const nextField = getNextCollectField(infoToCollect, collected);

  const children = extractChildrenExtras(messages);
  const extras: Record<string, string[]> = { ...(existing?.extras ?? {}) };
  if (children.length > 0) {
    extras.children = children;
  }

  return {
    intent,
    slots,
    extras,
    missing: nextField
      ? missing.length > 0
        ? missing
        : []
      : [],
  };
}

export function formatConversationStateBlock(
  state: CallConversationState | null | undefined,
): string {
  if (!state) return "";

  const lines: string[] = ["CONVERSATION STATE (use to stay coherent on this call):"];

  lines.push(`Intent: ${state.intent.replace(/_/g, " ")}`);

  const slotEntries = Object.entries(state.slots);
  if (slotEntries.length > 0) {
    lines.push("Collected slots:");
    for (const [k, v] of slotEntries) {
      lines.push(`- ${k}: ${v}`);
    }
  }

  for (const [key, values] of Object.entries(state.extras)) {
    if (values.length > 0) {
      lines.push(`${key}: ${values.join(", ")}`);
    }
  }

  if (state.missing.length > 0) {
    lines.push(
      `Missing (ask when caller is not mid-question): ${state.missing.join(", ")}`,
    );
    lines.push(
      "Answer the caller's direct question first, then naturally ask for the highest-priority missing item.",
    );
  }

  return lines.join("\n");
}

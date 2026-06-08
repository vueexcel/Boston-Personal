import { z } from "zod";
import { getOpenAIClient } from "@/lib/integrations/openai";
import { getServerEnv } from "@/lib/env/server";
import type { CallChatMessage } from "@/lib/services/twilio-call-agent";

export type CollectedInfoStatus = "collected" | "missing" | "corrected";

export type CollectedInfoItem = {
  field: string;
  value: string | null;
  status: CollectedInfoStatus;
};

export type CollectedInfoMap = Record<string, string | null>;

const collectedInfoItemSchema = z.object({
  field: z.string(),
  value: z.string().nullable(),
  status: z.enum(["collected", "missing", "corrected"]),
});

const extractionResponseSchema = z.object({
  items: z.array(collectedInfoItemSchema),
});

function emptyCollectedMap(fields: string[]): CollectedInfoMap {
  const map: CollectedInfoMap = {};
  for (const field of fields) {
    map[field] = null;
  }
  return map;
}

function normalizeFieldKey(field: string): string {
  return field.trim().toLowerCase();
}

/** First COLLECT field without a value, in configured order. */
export function getNextCollectField(
  infoToCollect: string[],
  collected: CollectedInfoMap,
): string | null {
  for (const field of infoToCollect) {
    if (!collected[field]?.trim()) return field;
  }
  return null;
}

/** Build prompt block injected each LLM turn. */
export function formatCollectedInfoBlock(
  infoToCollect: string[],
  collected: CollectedInfoMap,
): string {
  if (infoToCollect.length === 0) return "";
  const lines = infoToCollect.map((field) => {
    const value = collected[field]?.trim();
    return value ? `- ${field}: ${value}` : `- ${field}: (not yet collected)`;
  });
  const parts = [
    "COLLECTED SO FAR (caller may correct any value — always use the latest):",
    ...lines,
  ];
  const next = getNextCollectField(infoToCollect, collected);
  if (next) {
    parts.push(
      "",
      `NEXT COLLECT (ask naturally when appropriate): ${next}`,
    );
  }
  return parts.join("\n");
}

/**
 * Heuristic in-call update from transcript messages (no extra API call).
 */
export function updateCollectedInfoFromMessages(
  messages: CallChatMessage[],
  infoToCollect: string[],
  collected: CollectedInfoMap,
): CollectedInfoMap {
  if (infoToCollect.length === 0) return collected;

  const next: CollectedInfoMap = { ...collected };
  for (const field of infoToCollect) {
    if (!(field in next)) next[field] = null;
  }

  const userLines = messages
    .filter((m) => m.role === "user")
    .map((m) => m.content.trim())
    .filter(Boolean);

  for (const field of infoToCollect) {
    for (let i = userLines.length - 1; i >= 0; i--) {
      const line = userLines[i];
      for (const re of extractionPatternsForField(field)) {
        const match = line.match(re);
        if (match?.[1]?.trim()) {
          const value = cleanExtractedValue(match[1]);
          if (value) {
            next[field] = value;
            break;
          }
        }
      }
      if (next[field]) break;
    }
  }

  return next;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractionPatternsForField(field: string): RegExp[] {
  const key = normalizeFieldKey(field);
  const patterns = [
    new RegExp(`(?:my\\s+)?${escapeRegex(key)}\\s+is\\s+(.+)`, "i"),
    new RegExp(`${escapeRegex(key)}\\s*[:\\-]\\s*(.+)`, "i"),
  ];

  if (key.includes("name")) {
    patterns.push(/(?:my\s+)?name\s+is\s+(.+)/i);
    patterns.push(/call\s+me\s+(.+)/i);
  }
  if (key.includes("company")) {
    patterns.push(/(?:my\s+)?company(?:\s+name)?\s+is\s+(.+)/i);
    patterns.push(/company\s+name\s+is\s+(.+)/i);
  }
  if (key.includes("budget")) {
    patterns.push(/(?:my\s+)?budget\s+is\s+(.+)/i);
    patterns.push(/budget\s+of\s+(.+)/i);
  }

  return patterns;
}

const REJECTED_COLLECT_VALUES =
  /^(looking\s+for|nothing|not\s+sure|no\s+idea|don't\s+know|dont\s+know|n\/?a|none|uh|um|no|yes|okay|ok)$/i;

function cleanExtractedValue(raw: string): string | null {
  let v = raw.trim();
  v = v.replace(/[.!?]+$/, "").trim();
  if (v.length < 1 || v.length > 200) return null;
  if (REJECTED_COLLECT_VALUES.test(v)) return null;
  if (/^looking\s+for\b/i.test(v)) return null;
  return v;
}

const EXTRACT_SYSTEM = `You extract structured caller information from a phone call transcript.
Return JSON only: { "items": [ { "field": string, "value": string|null, "status": "collected"|"missing"|"corrected" } ] }
- field must match the requested labels exactly
- use "corrected" when the caller changed a previously stated value
- use "missing" when not mentioned
- value null when missing`;

/**
 * Post-call extraction for call history (OpenAI JSON mode).
 */
export async function extractCallCollectedInfo(
  transcript: string,
  infoToCollect: string[],
): Promise<CollectedInfoItem[]> {
  if (infoToCollect.length === 0) return [];

  const trimmed = transcript.trim();
  if (!trimmed) {
    return infoToCollect.map((field) => ({
      field,
      value: null,
      status: "missing" as const,
    }));
  }

  const env = getServerEnv();
  if (!env.OPENAI_API_KEY?.trim()) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const client = getOpenAIClient();
  const model = env.OPENAI_MODEL?.trim() || "gpt-4o-mini";

  const completion = await client.chat.completions.create({
    model,
    temperature: 0.1,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: EXTRACT_SYSTEM },
      {
        role: "user",
        content: `Fields to extract:\n${infoToCollect.map((f) => `- ${f}`).join("\n")}\n\nTranscript:\n${trimmed}`,
      },
    ],
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) {
    throw new Error("OpenAI returned empty collected-info extraction");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new Error("Collected-info extraction was not valid JSON");
  }

  const result = extractionResponseSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(
      `Collected-info extraction failed validation: ${result.error.message}`,
    );
  }

  const byField = new Map(
    result.data.items.map((item) => [item.field, item] as const),
  );

  return infoToCollect.map((field) => {
    const item = byField.get(field);
    if (item) return item;
    return { field, value: null, status: "missing" as const };
  });
}

export function collectedMapFromItems(
  items: CollectedInfoItem[],
): CollectedInfoMap {
  const map: CollectedInfoMap = {};
  for (const item of items) {
    map[item.field] = item.value;
  }
  return map;
}

export function initialCollectedMap(fields: string[]): CollectedInfoMap {
  return emptyCollectedMap(fields);
}

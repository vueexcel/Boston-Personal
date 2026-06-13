import { z } from "zod";
import { getOpenAIClient } from "@/lib/integrations/openai";
import { getServerEnv } from "@/lib/env/server";

const MAX_SOURCE_CHARS = 80_000;

const extractedDocumentSchema = z.object({
  section: z.string().trim().min(1),
  content: z.string().trim().min(1),
  sortOrder: z.number().int().nonnegative(),
});

const extractionResponseSchema = z.object({
  suggestedName: z.string().trim().min(1).nullable().optional(),
  suggestedDescription: z.string().trim().min(1).nullable().optional(),
  documents: z.array(extractedDocumentSchema),
});

export type ExtractedKnowledgeDocument = z.infer<typeof extractedDocumentSchema>;

export type KnowledgeFileExtractionResult = {
  suggestedName: string | null;
  suggestedDescription: string | null;
  documents: ExtractedKnowledgeDocument[];
};

export class KnowledgeFileExtractionError extends Error {
  readonly code = "EXTRACTION_FAILED" as const;

  constructor(message: string) {
    super(message);
    this.name = "KnowledgeFileExtractionError";
  }
}

const EXTRACTION_SYSTEM = `You are a business knowledge extractor preparing reference material for voice AI phone agents.

Your job is to read the provided source document and extract ONLY information explicitly stated in the source. Never invent, assume, or hallucinate facts.

Return JSON only with this shape:
{
  "suggestedName": string | null,
  "suggestedDescription": string | null,
  "documents": [
    { "section": string, "content": string, "sortOrder": number }
  ]
}

SECTIONS — create one document per non-empty section (skip sections with no source evidence):
1. "Company Overview" (sortOrder 1) — company name, mission/vision, history, industries served, locations, business hours, languages supported
2. "Contact Information" (sortOrder 2) — phone numbers, email addresses, WhatsApp numbers, office addresses
3. "Products and Services" (sortOrder 3) — products, services, pricing only if explicitly stated
4. "Business Policies" (sortOrder 4) — refund, cancellation, shipping, return, warranty, privacy policy, terms of service
5. "Voice AI Boundaries" (sortOrder 5) — REQUIRED. List what the voice agent must NOT promise or guarantee. Include explicit limitations from policies AND gaps (e.g. "Refund policy not specified — do not offer refunds"). This section helps the agent know exactly what it can and cannot promise.
6. "FAQs" (sortOrder 6) — question/answer pairs found in the source
7. "Appointment and Booking" (sortOrder 7) — available services, time slots, booking rules, rescheduling policy, cancellation policy for bookings
8. "Location Information" (sortOrder 8) — branch locations, directions, parking, service areas, delivery areas

FORMATTING RULES for each document "content":
- Use concise markdown: bullet lists and short sentences suitable for a phone agent
- For CSV sources: preserve key column headers and row data as structured bullets
- Do not include section titles inside content (the section field is the title)
- Omit empty sections entirely — do not create placeholder documents

STRICT RULES:
- suggestedName: best company/business name from source, or null
- suggestedDescription: one-sentence summary of the business, or null
- Never fabricate contact details, policies, hours, or prices
- Voice AI Boundaries must always be included (even if only listing unknowns)`;

function truncateSourceText(text: string): string {
  if (text.length <= MAX_SOURCE_CHARS) return text;
  return `${text.slice(0, MAX_SOURCE_CHARS)}\n\n[Document truncated for extraction]`;
}

/**
 * Use OpenAI to extract structured knowledge-base documents from plain text.
 */
export async function extractKnowledgeFromSourceText(
  text: string,
  sourceLabel: string,
): Promise<KnowledgeFileExtractionResult> {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new KnowledgeFileExtractionError("Source text is empty");
  }

  const env = getServerEnv();
  if (!env.OPENAI_API_KEY?.trim()) {
    throw new KnowledgeFileExtractionError("OPENAI_API_KEY is not configured");
  }

  const client = getOpenAIClient();
  const model = env.OPENAI_MODEL?.trim() || "gpt-4o-mini";

  let completion;
  try {
    completion = await client.chat.completions.create({
      model,
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: EXTRACTION_SYSTEM },
        {
          role: "user",
          content: `Source: ${sourceLabel}\n\n---\n\n${truncateSourceText(trimmed)}`,
        },
      ],
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "OpenAI request failed";
    throw new KnowledgeFileExtractionError(message);
  }

  const raw = completion.choices[0]?.message?.content;
  if (!raw) {
    throw new KnowledgeFileExtractionError("OpenAI returned empty extraction");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new KnowledgeFileExtractionError("Extraction response was not valid JSON");
  }

  const result = extractionResponseSchema.safeParse(parsed);
  if (!result.success) {
    throw new KnowledgeFileExtractionError(
      `Extraction validation failed: ${result.error.message}`,
    );
  }

  const documents = result.data.documents
    .filter((doc) => doc.content.trim().length > 0)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  if (documents.length === 0) {
    throw new KnowledgeFileExtractionError(
      "No usable business information found in this file",
    );
  }

  return {
    suggestedName: result.data.suggestedName?.trim() || null,
    suggestedDescription: result.data.suggestedDescription?.trim() || null,
    documents,
  };
}

/** @deprecated Use {@link extractKnowledgeFromSourceText} */
export async function extractKnowledgeFromFileText(
  text: string,
  fileName: string,
): Promise<KnowledgeFileExtractionResult> {
  return extractKnowledgeFromSourceText(text, fileName);
}

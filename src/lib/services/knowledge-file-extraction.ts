import { z } from "zod";
import { getOpenAIClient } from "@/lib/integrations/openai";
import { getServerEnv } from "@/lib/env/server";

const MAX_SOURCE_CHARS = 120_000;

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

const EXTRACTION_SYSTEM = `You are a business knowledge extractor preparing comprehensive reference material for voice AI phone agents.

Your job is to read the provided source document and extract all relevant business information explicitly stated in the source. Capture deeper detail, not just high-level summaries. Never invent, assume, or hallucinate facts.

Return JSON only with this shape:
{
  "suggestedName": string | null,
  "suggestedDescription": string | null,
  "documents": [
    { "section": string, "content": string, "sortOrder": number }
  ]
}

SECTIONS — create one document per distinct business topic or section of useful content. Use as many sections as necessary to preserve explicit detail and context from the source. Skip sections with no source evidence.
1. "Company Overview" (sortOrder 1) — company name, mission/vision, history, industries served, headquarters, business hours, languages supported, team or brand positioning
2. "Contact Information" (sortOrder 2) — phone numbers, email addresses, WhatsApp numbers, office addresses, support channels, response expectations
3. "Products and Services" (sortOrder 3) — product and service descriptions, key features, service categories, eligibility rules, delivery options, memberships, add-ons
4. "Pricing and Fees" (sortOrder 4) — explicit prices, fees, payment options, deposits, installment rules, refunds tied to pricing, and any costs mentioned
5. "Business Policies" (sortOrder 5) — refund, cancellation, shipping, returns, warranty, privacy, terms, guarantees, legal disclaimers, data handling policies
6. "Appointment and Booking" (sortOrder 6) — available services, booking process, availability, time slots, rescheduling rules, cancellation policy for appointments and bookings
7. "Location and Service Areas" (sortOrder 7) — branch locations, directions, parking, service area coverage, delivery areas, regional restrictions
8. "FAQs" (sortOrder 8) — question/answer pairs found in the source
9. "Technical or Operational Details" (sortOrder 9) — process steps, system requirements, product specifications, installation details, support workflows
10. "Legal and Compliance" (sortOrder 10) — terms of service, privacy and security, regulatory disclosures, licensing, age restrictions, licensing restrictions
11. "Voice AI Boundaries" (sortOrder 11) — REQUIRED. List what the voice agent must NOT promise or guarantee. Include explicit limitations from policies AND gaps (e.g. "Refund policy not specified — do not offer refunds"). This section helps the agent know exactly what it can and cannot promise.
12. "Additional Information" (sortOrder 12) — any other useful business facts not covered above, including promotions, customer testimonials, lead capture instructions, or operational notes

FORMATTING RULES for each document "content":
- Use concise markdown: bullet lists and short sentences suitable for a phone agent
- Preserve explicit detail and context from the source; do not over-compress content into a single sentence unless the source is already brief
- For CSV sources: preserve key column headers and row data as structured bullets
- Do not include section titles inside content (the section field is the title)
- Omit empty sections entirely — do not create placeholder documents
- Use bullets for lists, short descriptive sentences for facts, and group related items clearly

STRICT RULES:
- suggestedName: best company/business name from source, or null
- suggestedDescription: one-sentence summary of the business, or null
- Never fabricate contact details, policies, hours, or prices
- Voice AI Boundaries must always be included (even if only listing unknowns)
- If a topic is explicitly described in the source but does not fit an existing category, place it under "Additional Information" rather than dropping it.`;

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

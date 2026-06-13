import { createServerSupabase } from "@/lib/db/supabase-server";
import { extractKnowledgeFromSourceText } from "@/lib/services/knowledge-file-extraction";
import { parseKnowledgeFile } from "@/lib/services/knowledge-file-parser";
import {
  crawlWebsite,
  parseWebsiteUrl,
  scrapedPagesToPlainText,
} from "@/lib/services/website-scraper";
import { createKnowledgeDocumentWithMeta } from "@/lib/services/knowledge-documents";
import { ContentSafetyViolationError } from "@/lib/services/prompt-content-safety";
import { assertContentSafeForKnowledgeDocument } from "@/lib/services/prompt-content-safety";
import type {
  CreateKnowledgeBaseBody,
  UpdateKnowledgeBaseBody,
} from "@/lib/validation/knowledge-bases";

export type KnowledgeBaseSummary = {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  documentCount: number;
  updatedAt: string;
  createdAt: string;
};

export type KnowledgeBaseDetail = KnowledgeBaseSummary;

function mapKbRow(
  row: Record<string, unknown>,
  documentCount: number,
): KnowledgeBaseSummary | null {
  const id = row.id;
  const tenantId = row.tenant_id;
  const name = row.name;
  if (typeof id !== "string" || typeof tenantId !== "string" || typeof name !== "string") {
    return null;
  }
  const updatedAt = row.updated_at;
  const createdAt = row.created_at;
  return {
    id,
    tenantId,
    name,
    description:
      typeof row.description === "string" ? row.description : null,
    documentCount,
    updatedAt:
      typeof updatedAt === "string"
        ? updatedAt
        : new Date(updatedAt as string).toISOString(),
    createdAt:
      typeof createdAt === "string"
        ? createdAt
        : new Date(createdAt as string).toISOString(),
  };
}

async function countDocumentsForBases(
  tenantId: string,
  baseIds: string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (baseIds.length === 0) return counts;

  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("knowledge_documents")
    .select("knowledge_base_id")
    .eq("tenant_id", tenantId)
    .in("knowledge_base_id", baseIds)
    .is("deleted_at", null);

  if (error) {
    throw new Error(`Failed to count documents: ${error.message}`);
  }

  for (const id of baseIds) {
    counts.set(id, 0);
  }
  for (const row of data ?? []) {
    const kbId = row.knowledge_base_id;
    if (typeof kbId === "string") {
      counts.set(kbId, (counts.get(kbId) ?? 0) + 1);
    }
  }
  return counts;
}

export async function listKnowledgeBases(
  tenantId: string,
): Promise<KnowledgeBaseSummary[]> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("knowledge_bases")
    .select("id, tenant_id, name, description, created_at, updated_at")
    .eq("tenant_id", tenantId)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to list knowledge bases: ${error.message}`);
  }

  const rows = data ?? [];
  const ids = rows
    .map((r) => (typeof r.id === "string" ? r.id : null))
    .filter((id): id is string => id != null);
  const docCounts = await countDocumentsForBases(tenantId, ids);

  const result: KnowledgeBaseSummary[] = [];
  for (const row of rows) {
    const mapped = mapKbRow(
      row as Record<string, unknown>,
      docCounts.get(String(row.id)) ?? 0,
    );
    if (mapped) result.push(mapped);
  }
  return result;
}

export async function getKnowledgeBase(
  tenantId: string,
  kbId: string,
): Promise<KnowledgeBaseDetail | null> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("knowledge_bases")
    .select("id, tenant_id, name, description, created_at, updated_at")
    .eq("tenant_id", tenantId)
    .eq("id", kbId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load knowledge base: ${error.message}`);
  }
  if (!data) return null;

  const docCounts = await countDocumentsForBases(tenantId, [kbId]);
  return mapKbRow(data as Record<string, unknown>, docCounts.get(kbId) ?? 0);
}

export async function createKnowledgeBase(
  tenantId: string,
  body: CreateKnowledgeBaseBody,
): Promise<KnowledgeBaseDetail> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("knowledge_bases")
    .insert({
      tenant_id: tenantId,
      name: body.name.trim(),
      description: body.description?.trim() || null,
    })
    .select("id, tenant_id, name, description, created_at, updated_at")
    .single();

  if (error || !data) {
    throw new Error(
      `Failed to create knowledge base: ${error?.message ?? "unknown"}`,
    );
  }

  const kbId = String(data.id);
  if (body.initialContent?.trim()) {
    await assertContentSafeForKnowledgeDocument(body.initialContent);
    const { error: docError } = await supabase.from("knowledge_documents").insert({
      tenant_id: tenantId,
      knowledge_base_id: kbId,
      content: body.initialContent.trim(),
      source_type: "text",
    });
    if (docError) {
      throw new Error(
        `Knowledge base created but initial document failed: ${docError.message}`,
      );
    }
  }

  const created = await getKnowledgeBase(tenantId, kbId);
  if (!created) {
    throw new Error("Knowledge base created but could not be loaded");
  }
  return created;
}

export async function updateKnowledgeBase(
  tenantId: string,
  kbId: string,
  body: UpdateKnowledgeBaseBody,
): Promise<KnowledgeBaseDetail> {
  const patch: Record<string, unknown> = {};
  if (body.name !== undefined) patch.name = body.name.trim();
  if (body.description !== undefined) {
    patch.description = body.description?.trim() || null;
  }

  if (Object.keys(patch).length === 0) {
    const existing = await getKnowledgeBase(tenantId, kbId);
    if (!existing) throw new Error("Knowledge base not found");
    return existing;
  }

  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("knowledge_bases")
    .update(patch)
    .eq("tenant_id", tenantId)
    .eq("id", kbId)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to update knowledge base: ${error.message}`);
  }
  if (!data) {
    throw new Error("Knowledge base not found");
  }

  const updated = await getKnowledgeBase(tenantId, kbId);
  if (!updated) throw new Error("Knowledge base not found");
  return updated;
}

function fileNameStem(fileName: string): string {
  const base = fileName.replace(/\\/g, "/").split("/").pop() ?? fileName;
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(0, dot) : base;
}

export type CreateKnowledgeBaseFromFileParams = {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
  name?: string | null;
};

export async function createKnowledgeBaseFromFile(
  tenantId: string,
  params: CreateKnowledgeBaseFromFileParams,
): Promise<KnowledgeBaseDetail> {
  const parsed = await parseKnowledgeFile({
    buffer: params.buffer,
    fileName: params.fileName,
    mimeType: params.mimeType,
  });

  const extraction = await extractKnowledgeFromSourceText(
    parsed.text,
    parsed.fileName,
  );

  const kbName =
    params.name?.trim() ||
    extraction.suggestedName?.trim() ||
    fileNameStem(parsed.fileName).trim() ||
    "Imported knowledge base";

  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("knowledge_bases")
    .insert({
      tenant_id: tenantId,
      name: kbName,
      description: extraction.suggestedDescription?.trim() || null,
    })
    .select("id, tenant_id, name, description, created_at, updated_at")
    .single();

  if (error || !data) {
    throw new Error(
      `Failed to create knowledge base: ${error?.message ?? "unknown"}`,
    );
  }

  const kbId = String(data.id);

  try {
    for (const doc of extraction.documents) {
      await createKnowledgeDocumentWithMeta(tenantId, kbId, {
        content: doc.content,
        sourceType: "file",
        sourceMeta: {
          section: doc.section,
          originalFileName: parsed.fileName,
          sortOrder: doc.sortOrder,
        },
      });
    }
  } catch (e) {
    await softDeleteKnowledgeBase(tenantId, kbId);
    if (e instanceof ContentSafetyViolationError) throw e;
    const message = e instanceof Error ? e.message : "Document creation failed";
    throw new Error(message);
  }

  const created = await getKnowledgeBase(tenantId, kbId);
  if (!created) {
    throw new Error("Knowledge base created but could not be loaded");
  }
  return created;
}

function hostnameFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Imported website";
  }
}

export type CreateKnowledgeBaseFromWebsiteParams = {
  url: string;
  name?: string | null;
};

export async function createKnowledgeBaseFromWebsite(
  tenantId: string,
  params: CreateKnowledgeBaseFromWebsiteParams,
): Promise<KnowledgeBaseDetail> {
  const siteUrl = parseWebsiteUrl(params.url);
  const pages = await crawlWebsite(siteUrl);
  const text = scrapedPagesToPlainText(pages);

  const extraction = await extractKnowledgeFromSourceText(text, siteUrl);

  const kbName =
    params.name?.trim() ||
    extraction.suggestedName?.trim() ||
    hostnameFromUrl(siteUrl) ||
    "Imported knowledge base";

  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("knowledge_bases")
    .insert({
      tenant_id: tenantId,
      name: kbName,
      description: extraction.suggestedDescription?.trim() || null,
    })
    .select("id, tenant_id, name, description, created_at, updated_at")
    .single();

  if (error || !data) {
    throw new Error(
      `Failed to create knowledge base: ${error?.message ?? "unknown"}`,
    );
  }

  const kbId = String(data.id);

  try {
    for (const doc of extraction.documents) {
      await createKnowledgeDocumentWithMeta(tenantId, kbId, {
        content: doc.content,
        sourceType: "website",
        sourceMeta: {
          section: doc.section,
          sourceUrl: siteUrl,
          sortOrder: doc.sortOrder,
        },
      });
    }
  } catch (e) {
    await softDeleteKnowledgeBase(tenantId, kbId);
    if (e instanceof ContentSafetyViolationError) throw e;
    const message = e instanceof Error ? e.message : "Document creation failed";
    throw new Error(message);
  }

  const created = await getKnowledgeBase(tenantId, kbId);
  if (!created) {
    throw new Error("Knowledge base created but could not be loaded");
  }
  return created;
}

export async function softDeleteKnowledgeBase(
  tenantId: string,
  kbId: string,
): Promise<void> {
  const supabase = createServerSupabase();
  const now = new Date().toISOString();

  const { data: kb, error: kbError } = await supabase
    .from("knowledge_bases")
    .update({ deleted_at: now })
    .eq("tenant_id", tenantId)
    .eq("id", kbId)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();

  if (kbError) {
    throw new Error(`Failed to delete knowledge base: ${kbError.message}`);
  }
  if (!kb) {
    throw new Error("Knowledge base not found");
  }

  const { error: docError } = await supabase
    .from("knowledge_documents")
    .update({ deleted_at: now })
    .eq("tenant_id", tenantId)
    .eq("knowledge_base_id", kbId)
    .is("deleted_at", null);

  if (docError) {
    throw new Error(`Failed to delete knowledge documents: ${docError.message}`);
  }
}

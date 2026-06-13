import { createServerSupabase } from "@/lib/db/supabase-server";
import type {
  CreateKnowledgeDocumentBody,
  UpdateKnowledgeDocumentBody,
} from "@/lib/validation/knowledge-bases";
import { getKnowledgeBase } from "@/lib/services/knowledge-bases";
import {
  assertContentSafeForKnowledgeDocument,
  type SafetyIssue,
} from "@/lib/services/prompt-content-safety";

export type {
  KnowledgeDocument,
  KnowledgeDocumentSourceMeta,
} from "@/lib/services/knowledge-documents.shared";
export { documentContentSnippet } from "@/lib/services/knowledge-documents.shared";
import type {
  KnowledgeDocument,
  KnowledgeDocumentSourceMeta,
} from "@/lib/services/knowledge-documents.shared";

const DOC_SELECT =
  "id, tenant_id, knowledge_base_id, content, source_type, source_meta, created_at, updated_at";

function mapSourceMeta(raw: unknown): KnowledgeDocumentSourceMeta | null {
  if (raw == null || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const meta: KnowledgeDocumentSourceMeta = {};
  if (typeof obj.section === "string") meta.section = obj.section;
  if (typeof obj.originalFileName === "string") {
    meta.originalFileName = obj.originalFileName;
  }
  if (typeof obj.sourceUrl === "string") meta.sourceUrl = obj.sourceUrl;
  if (typeof obj.sortOrder === "number") meta.sortOrder = obj.sortOrder;
  return Object.keys(meta).length > 0 ? meta : null;
}

function mapDocRow(row: Record<string, unknown>): KnowledgeDocument | null {
  const id = row.id;
  const tenantId = row.tenant_id;
  const knowledgeBaseId = row.knowledge_base_id;
  const content = row.content;
  if (
    typeof id !== "string" ||
    typeof tenantId !== "string" ||
    typeof knowledgeBaseId !== "string" ||
    typeof content !== "string"
  ) {
    return null;
  }
  const updatedAt = row.updated_at;
  const createdAt = row.created_at;
  return {
    id,
    tenantId,
    knowledgeBaseId,
    content,
    sourceType:
      typeof row.source_type === "string" ? row.source_type : "text",
    sourceMeta: mapSourceMeta(row.source_meta),
    createdAt:
      typeof createdAt === "string"
        ? createdAt
        : new Date(createdAt as string).toISOString(),
    updatedAt:
      typeof updatedAt === "string"
        ? updatedAt
        : new Date(updatedAt as string).toISOString(),
  };
}

async function assertKnowledgeBaseExists(
  tenantId: string,
  kbId: string,
): Promise<void> {
  const kb = await getKnowledgeBase(tenantId, kbId);
  if (!kb) {
    throw new Error("Knowledge base not found");
  }
}

export async function listKnowledgeDocuments(
  tenantId: string,
  kbId: string,
): Promise<KnowledgeDocument[]> {
  await assertKnowledgeBaseExists(tenantId, kbId);

  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("knowledge_documents")
    .select(DOC_SELECT)
    .eq("tenant_id", tenantId)
    .eq("knowledge_base_id", kbId)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to list documents: ${error.message}`);
  }

  const result: KnowledgeDocument[] = [];
  for (const row of data ?? []) {
    const mapped = mapDocRow(row as Record<string, unknown>);
    if (mapped) result.push(mapped);
  }
  return result;
}

export async function getKnowledgeDocument(
  tenantId: string,
  kbId: string,
  docId: string,
): Promise<KnowledgeDocument | null> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("knowledge_documents")
    .select(DOC_SELECT)
    .eq("tenant_id", tenantId)
    .eq("knowledge_base_id", kbId)
    .eq("id", docId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load document: ${error.message}`);
  }
  if (!data) return null;
  return mapDocRow(data as Record<string, unknown>);
}

export type KnowledgeDocumentMutationResult = {
  document: KnowledgeDocument;
  warnings: SafetyIssue[];
};

export async function createKnowledgeDocumentForBase(
  tenantId: string,
  kbId: string,
  body: CreateKnowledgeDocumentBody,
): Promise<KnowledgeDocumentMutationResult> {
  return createKnowledgeDocumentWithMeta(tenantId, kbId, {
    content: body.content,
    sourceType: "text",
    sourceMeta: null,
  });
}

export async function createKnowledgeDocumentWithMeta(
  tenantId: string,
  kbId: string,
  params: {
    content: string;
    sourceType: "text" | "file" | "website";
    sourceMeta: KnowledgeDocumentSourceMeta | null;
  },
): Promise<KnowledgeDocumentMutationResult> {
  await assertKnowledgeBaseExists(tenantId, kbId);

  const safety = await assertContentSafeForKnowledgeDocument(params.content);
  const warnings = safety.issues.filter((i) => i.severity === "warning");

  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("knowledge_documents")
    .insert({
      tenant_id: tenantId,
      knowledge_base_id: kbId,
      content: params.content.trim(),
      source_type: params.sourceType,
      source_meta: params.sourceMeta,
    })
    .select(DOC_SELECT)
    .single();

  if (error || !data) {
    throw new Error(
      `Failed to create document: ${error?.message ?? "unknown"}`,
    );
  }

  const mapped = mapDocRow(data as Record<string, unknown>);
  if (!mapped) throw new Error("Invalid document row returned");
  return { document: mapped, warnings };
}

export async function updateKnowledgeDocument(
  tenantId: string,
  kbId: string,
  docId: string,
  body: UpdateKnowledgeDocumentBody,
): Promise<KnowledgeDocumentMutationResult> {
  const safety = await assertContentSafeForKnowledgeDocument(body.content);
  const warnings = safety.issues.filter((i) => i.severity === "warning");

  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("knowledge_documents")
    .update({ content: body.content.trim() })
    .eq("tenant_id", tenantId)
    .eq("knowledge_base_id", kbId)
    .eq("id", docId)
    .is("deleted_at", null)
    .select(DOC_SELECT)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to update document: ${error.message}`);
  }
  if (!data) {
    throw new Error("Document not found");
  }

  const mapped = mapDocRow(data as Record<string, unknown>);
  if (!mapped) throw new Error("Invalid document row returned");
  return { document: mapped, warnings };
}

export async function softDeleteKnowledgeDocument(
  tenantId: string,
  kbId: string,
  docId: string,
): Promise<void> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("knowledge_documents")
    .update({ deleted_at: new Date().toISOString() })
    .eq("tenant_id", tenantId)
    .eq("knowledge_base_id", kbId)
    .eq("id", docId)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to delete document: ${error.message}`);
  }
  if (!data) {
    throw new Error("Document not found");
  }
}

export type KnowledgeBaseDocumentForPrompt = {
  knowledgeBaseName: string;
  documents: KnowledgeDocument[];
};

/** Loads all active documents for a KB (for system prompt assembly). */
export async function loadKnowledgeBaseDocumentsForPrompt(
  tenantId: string,
  knowledgeBaseId: string,
): Promise<KnowledgeBaseDocumentForPrompt | null> {
  const kb = await getKnowledgeBase(tenantId, knowledgeBaseId);
  if (!kb) return null;
  const documents = await listKnowledgeDocuments(tenantId, knowledgeBaseId);
  return {
    knowledgeBaseName: kb.name,
    documents,
  };
}

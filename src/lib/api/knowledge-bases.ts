import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api/http";
import type {
  KnowledgeBaseDetail,
  KnowledgeBaseSummary,
} from "@/lib/services/knowledge-bases";
import type { KnowledgeDocument } from "@/lib/services/knowledge-documents";
import type {
  CreateKnowledgeBaseBody,
  CreateKnowledgeDocumentBody,
  UpdateKnowledgeBaseBody,
  UpdateKnowledgeDocumentBody,
} from "@/lib/validation/knowledge-bases";

function kbPath(tenantId: string): string {
  return `/api/v1/tenants/${tenantId}/knowledge-bases`;
}

export async function listKnowledgeBases(
  tenantId: string,
): Promise<KnowledgeBaseSummary[]> {
  const data = await apiGet<{ knowledgeBases: KnowledgeBaseSummary[] }>(
    kbPath(tenantId),
  );
  return data.knowledgeBases;
}

export async function getKnowledgeBase(
  tenantId: string,
  kbId: string,
): Promise<KnowledgeBaseDetail> {
  const data = await apiGet<{ knowledgeBase: KnowledgeBaseDetail }>(
    `${kbPath(tenantId)}/${kbId}`,
  );
  return data.knowledgeBase;
}

export async function createKnowledgeBase(
  tenantId: string,
  body: CreateKnowledgeBaseBody,
): Promise<KnowledgeBaseDetail> {
  const data = await apiPost<{ knowledgeBase: KnowledgeBaseDetail }>(
    kbPath(tenantId),
    body,
  );
  return data.knowledgeBase;
}

export async function updateKnowledgeBase(
  tenantId: string,
  kbId: string,
  body: UpdateKnowledgeBaseBody,
): Promise<KnowledgeBaseDetail> {
  const data = await apiPatch<{ knowledgeBase: KnowledgeBaseDetail }>(
    `${kbPath(tenantId)}/${kbId}`,
    body,
  );
  return data.knowledgeBase;
}

export async function deleteKnowledgeBase(
  tenantId: string,
  kbId: string,
): Promise<void> {
  await apiDelete<{ deleted: boolean }>(`${kbPath(tenantId)}/${kbId}`);
}

export async function listKnowledgeDocuments(
  tenantId: string,
  kbId: string,
): Promise<KnowledgeDocument[]> {
  const data = await apiGet<{ documents: KnowledgeDocument[] }>(
    `${kbPath(tenantId)}/${kbId}/documents`,
  );
  return data.documents;
}

export async function createKnowledgeDocument(
  tenantId: string,
  kbId: string,
  body: CreateKnowledgeDocumentBody,
): Promise<KnowledgeDocument> {
  const data = await apiPost<{ document: KnowledgeDocument }>(
    `${kbPath(tenantId)}/${kbId}/documents`,
    body,
  );
  return data.document;
}

export async function updateKnowledgeDocument(
  tenantId: string,
  kbId: string,
  docId: string,
  body: UpdateKnowledgeDocumentBody,
): Promise<KnowledgeDocument> {
  const data = await apiPatch<{ document: KnowledgeDocument }>(
    `${kbPath(tenantId)}/${kbId}/documents/${docId}`,
    body,
  );
  return data.document;
}

export async function deleteKnowledgeDocument(
  tenantId: string,
  kbId: string,
  docId: string,
): Promise<void> {
  await apiDelete<{ deleted: boolean }>(
    `${kbPath(tenantId)}/${kbId}/documents/${docId}`,
  );
}

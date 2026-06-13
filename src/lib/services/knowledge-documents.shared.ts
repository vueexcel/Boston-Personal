export type KnowledgeDocumentSourceMeta = {
  section?: string;
  originalFileName?: string;
  sourceUrl?: string;
  sortOrder?: number;
};

export type KnowledgeDocument = {
  id: string;
  tenantId: string;
  knowledgeBaseId: string;
  content: string;
  sourceType: string;
  sourceMeta: KnowledgeDocumentSourceMeta | null;
  createdAt: string;
  updatedAt: string;
};

export function documentContentSnippet(content: string, maxLen = 120): string {
  const oneLine = content.replace(/\s+/g, " ").trim();
  if (oneLine.length <= maxLen) return oneLine;
  return `${oneLine.slice(0, maxLen)}…`;
}

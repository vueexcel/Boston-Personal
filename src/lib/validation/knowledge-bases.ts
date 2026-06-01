import { z } from "zod";

export const createKnowledgeBaseBodySchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  description: z.string().trim().max(5000).optional().nullable(),
  /** When set, creates the first text document with this content. */
  initialContent: z.string().trim().min(1).max(500_000).optional(),
});

export type CreateKnowledgeBaseBody = z.infer<
  typeof createKnowledgeBaseBodySchema
>;

export const updateKnowledgeBaseBodySchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(5000).optional().nullable(),
});

export type UpdateKnowledgeBaseBody = z.infer<
  typeof updateKnowledgeBaseBodySchema
>;

export const createKnowledgeDocumentBodySchema = z.object({
  content: z.string().trim().min(1, "Content is required").max(500_000),
});

export type CreateKnowledgeDocumentBody = z.infer<
  typeof createKnowledgeDocumentBodySchema
>;

export const updateKnowledgeDocumentBodySchema = z.object({
  content: z.string().trim().min(1).max(500_000),
});

export type UpdateKnowledgeDocumentBody = z.infer<
  typeof updateKnowledgeDocumentBodySchema
>;

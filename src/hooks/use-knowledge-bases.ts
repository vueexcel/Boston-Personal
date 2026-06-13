"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  createKnowledgeBase,
  createKnowledgeBaseFromFile,
  createKnowledgeBaseFromWebsite,
  createKnowledgeDocument,
  deleteKnowledgeBase,
  deleteKnowledgeDocument,
  getKnowledgeBase,
  listKnowledgeBases,
  listKnowledgeDocuments,
  updateKnowledgeBase,
  updateKnowledgeDocument,
} from "@/lib/api/knowledge-bases";
import { queryKeys } from "@/lib/api/query-keys";
import type {
  CreateKnowledgeBaseBody,
  CreateKnowledgeDocumentBody,
  UpdateKnowledgeBaseBody,
  UpdateKnowledgeDocumentBody,
} from "@/lib/validation/knowledge-bases";

export function useKnowledgeBases(tenantId: string) {
  return useQuery({
    queryKey: queryKeys.knowledgeBases.all(tenantId),
    queryFn: () => listKnowledgeBases(tenantId),
    enabled: Boolean(tenantId),
    staleTime: 30_000,
  });
}

export function useKnowledgeBase(tenantId: string, kbId: string) {
  return useQuery({
    queryKey: queryKeys.knowledgeBases.detail(tenantId, kbId),
    queryFn: () => getKnowledgeBase(tenantId, kbId),
    enabled: Boolean(tenantId) && Boolean(kbId),
  });
}

export function useKnowledgeDocuments(tenantId: string, kbId: string) {
  return useQuery({
    queryKey: queryKeys.knowledgeBases.documents(tenantId, kbId),
    queryFn: () => listKnowledgeDocuments(tenantId, kbId),
    enabled: Boolean(tenantId) && Boolean(kbId),
  });
}

export function useCreateKnowledgeBase(tenantId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateKnowledgeBaseBody) =>
      createKnowledgeBase(tenantId, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.knowledgeBases.all(tenantId),
      });
    },
  });
}

export function useCreateKnowledgeBaseFromFile(tenantId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { file: File; name?: string }) =>
      createKnowledgeBaseFromFile(tenantId, params),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.knowledgeBases.all(tenantId),
      });
    },
  });
}

export function useCreateKnowledgeBaseFromWebsite(tenantId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { url: string; name?: string }) =>
      createKnowledgeBaseFromWebsite(tenantId, params),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.knowledgeBases.all(tenantId),
      });
    },
  });
}

export function useUpdateKnowledgeBase(tenantId: string, kbId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateKnowledgeBaseBody) =>
      updateKnowledgeBase(tenantId, kbId, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.knowledgeBases.all(tenantId),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.knowledgeBases.detail(tenantId, kbId),
      });
    },
  });
}

export function useDeleteKnowledgeBase(tenantId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (kbId: string) => deleteKnowledgeBase(tenantId, kbId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.knowledgeBases.all(tenantId),
      });
    },
  });
}

export function useCreateKnowledgeDocument(tenantId: string, kbId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateKnowledgeDocumentBody) =>
      createKnowledgeDocument(tenantId, kbId, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.knowledgeBases.all(tenantId),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.knowledgeBases.detail(tenantId, kbId),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.knowledgeBases.documents(tenantId, kbId),
      });
    },
  });
}

export function useUpdateKnowledgeDocument(tenantId: string, kbId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      docId,
      body,
    }: {
      docId: string;
      body: UpdateKnowledgeDocumentBody;
    }) => updateKnowledgeDocument(tenantId, kbId, docId, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.knowledgeBases.documents(tenantId, kbId),
      });
    },
  });
}

export function useDeleteKnowledgeDocument(tenantId: string, kbId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (docId: string) =>
      deleteKnowledgeDocument(tenantId, kbId, docId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.knowledgeBases.all(tenantId),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.knowledgeBases.detail(tenantId, kbId),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.knowledgeBases.documents(tenantId, kbId),
      });
    },
  });
}

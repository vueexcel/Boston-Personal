"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import {
  getAgentTestSignedUrl,
  postAgentTestChat,
  postAgentTestSync,
  type AgentTestChatResult,
  type AgentTestSignedUrlResult,
  type AgentTestSyncResult,
} from "@/lib/api/agent-test";
import { queryKeys } from "@/lib/api/query-keys";
import type {
  AgentTestChatBody,
  AgentTestDraft,
  AgentTestSyncBody,
} from "@/lib/validation/agent-test";

export function useAgentTestChat(tenantId: string, agentId: string) {
  return useMutation({
    mutationFn: (body: AgentTestChatBody) =>
      postAgentTestChat(tenantId, agentId, body),
  });
}

export function useAgentTestSync(tenantId: string, agentId: string) {
  return useMutation({
    mutationFn: (body: AgentTestSyncBody = {}) =>
      postAgentTestSync(tenantId, agentId, body),
  });
}

export function useAgentTestSignedUrl(
  tenantId: string,
  agentId: string,
  options: { enabled?: boolean; draft?: AgentTestDraft },
) {
  return useQuery({
    queryKey: [
      ...queryKeys.agents.testSignedUrl(tenantId, agentId),
      options.draft ? "draft" : "saved",
    ],
    queryFn: () => getAgentTestSignedUrl(tenantId, agentId, options.draft),
    enabled:
      Boolean(tenantId) &&
      Boolean(agentId) &&
      (options.enabled ?? false),
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
}

export type {
  AgentTestChatResult,
  AgentTestSignedUrlResult,
  AgentTestSyncResult,
};

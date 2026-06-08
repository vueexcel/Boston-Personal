"use client";

import { useMutation } from "@tanstack/react-query";
import {
  postAgentTestChat,
  postAgentTestVoiceSession,
  type AgentTestChatResult,
  type AgentTestVoiceSessionResult,
} from "@/lib/api/agent-test";
import type {
  AgentTestChatBody,
  AgentTestSyncBody,
} from "@/lib/validation/agent-test";

export function useAgentTestChat(tenantId: string, agentId: string) {
  return useMutation({
    mutationFn: (body: AgentTestChatBody) =>
      postAgentTestChat(tenantId, agentId, body),
  });
}

export function useAgentTestVoiceSession(tenantId: string, agentId: string) {
  return useMutation({
    mutationFn: (body: AgentTestSyncBody = {}) =>
      postAgentTestVoiceSession(tenantId, agentId, body),
  });
}

export type { AgentTestChatResult, AgentTestVoiceSessionResult };

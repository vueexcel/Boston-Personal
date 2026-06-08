import { apiPost } from "@/lib/api/http";
import type { ScribeClientConnectConfig } from "@/lib/voice/scribe-client-config";
import type {
  AgentTestChatBody,
  AgentTestDraft,
  AgentTestSyncBody,
} from "@/lib/validation/agent-test";

function agentTestPath(tenantId: string, agentId: string): string {
  return `/api/v1/tenants/${tenantId}/agents/${agentId}/test`;
}

export type AgentTestChatResult = {
  reply: string;
  model: string;
  greetingUsed: string | null;
};

export async function postAgentTestChat(
  tenantId: string,
  agentId: string,
  body: AgentTestChatBody,
): Promise<AgentTestChatResult> {
  return apiPost<AgentTestChatResult>(
    `${agentTestPath(tenantId, agentId)}/chat`,
    body,
  );
}

export type AgentTestVoiceSessionResult = {
  sessionId: string;
  token: string;
  wsUrl: string;
  expiresAt: string;
  resolvedVoiceId: string | null;
  voiceWarning: string | null;
  sttClientConfig: ScribeClientConnectConfig;
};

export type AgentTestScribeTokenBody = {
  sessionId: string;
  sessionToken: string;
};

export type AgentTestScribeTokenResult = {
  token: string;
};

export async function postAgentTestVoiceSession(
  tenantId: string,
  agentId: string,
  body: AgentTestSyncBody = {},
): Promise<AgentTestVoiceSessionResult> {
  return apiPost<AgentTestVoiceSessionResult>(
    `${agentTestPath(tenantId, agentId)}/voice/session`,
    body,
  );
}

export async function postAgentTestScribeToken(
  tenantId: string,
  agentId: string,
  body: AgentTestScribeTokenBody,
): Promise<AgentTestScribeTokenResult> {
  return apiPost<AgentTestScribeTokenResult>(
    `${agentTestPath(tenantId, agentId)}/voice/scribe-token`,
    body,
  );
}

export type { AgentTestDraft, ScribeClientConnectConfig };

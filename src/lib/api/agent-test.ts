import { apiGet, apiPost } from "@/lib/api/http";
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

export type AgentTestSyncResult = {
  elevenLabsAgentId: string;
  synced: boolean;
  resolvedVoiceId: string | null;
  voiceWarning: string | null;
};

export async function postAgentTestSync(
  tenantId: string,
  agentId: string,
  body: AgentTestSyncBody = {},
): Promise<AgentTestSyncResult> {
  return apiPost<AgentTestSyncResult>(
    `${agentTestPath(tenantId, agentId)}/sync`,
    body,
  );
}

export type AgentTestSignedUrlResult = {
  elevenLabsAgentId: string;
  signedUrl: string;
  resolvedVoiceId?: string | null;
  voiceWarning?: string | null;
};

function encodeDraftQueryParam(draft: AgentTestDraft): string {
  const json = JSON.stringify(draft);
  if (typeof Buffer !== "undefined") {
    return Buffer.from(json, "utf8").toString("base64url");
  }
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function getAgentTestSignedUrl(
  tenantId: string,
  agentId: string,
  draft?: AgentTestDraft,
): Promise<AgentTestSignedUrlResult> {
  const base = `${agentTestPath(tenantId, agentId)}/signed-url`;
  if (!draft) {
    return apiGet<AgentTestSignedUrlResult>(base);
  }
  const encoded = encodeDraftQueryParam(draft);
  return apiGet<AgentTestSignedUrlResult>(
    `${base}?draft=${encodeURIComponent(encoded)}`,
  );
}

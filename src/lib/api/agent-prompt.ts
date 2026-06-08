import { apiPost } from "@/lib/api/http";
import type { SafetyIssue } from "@/lib/prompt-content-safety-patterns";
import type { AgentTestDraft } from "@/lib/validation/agent-test";

export type AgentPromptPreviewResponse = {
  prompt: string;
  warnings?: SafetyIssue[];
};

export async function fetchAgentPromptPreview(
  tenantId: string,
  agentId: string,
  draft: AgentTestDraft,
): Promise<AgentPromptPreviewResponse> {
  return apiPost<AgentPromptPreviewResponse>(
    `/api/v1/tenants/${tenantId}/agents/${agentId}/prompt-preview`,
    draft,
  );
}

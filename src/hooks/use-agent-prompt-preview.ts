"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchAgentPromptPreview } from "@/lib/api/agent-prompt";
import { queryKeys } from "@/lib/api/query-keys";
import type { AgentTestDraft } from "@/lib/validation/agent-test";

export function useAgentPromptPreview(
  tenantId: string,
  agentId: string,
  draft: AgentTestDraft | null,
  enabled: boolean,
) {
  return useQuery({
    queryKey: queryKeys.agents.promptPreview(tenantId, agentId, draft),
    queryFn: () => {
      if (!draft) throw new Error("Draft required");
      return fetchAgentPromptPreview(tenantId, agentId, draft);
    },
    enabled: Boolean(tenantId) && Boolean(agentId) && Boolean(draft) && enabled,
    staleTime: 0,
  });
}

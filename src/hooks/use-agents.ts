"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  createAgent,
  deleteAgent,
  getAgent,
  listAgents,
  updateAgent,
} from "@/lib/api/agents";
import { queryKeys } from "@/lib/api/query-keys";
import type { CreateAgentBody } from "@/lib/validation/agents-create";
import type { UpdateAgentBody } from "@/lib/validation/agents-update";

export function useAgents(tenantId: string) {
  return useQuery({
    queryKey: queryKeys.agents.all(tenantId),
    queryFn: () => listAgents(tenantId),
    enabled: Boolean(tenantId),
  });
}

export function useAgent(tenantId: string, agentId: string) {
  return useQuery({
    queryKey: queryKeys.agents.detail(tenantId, agentId),
    queryFn: () => getAgent(tenantId, agentId),
    enabled: Boolean(tenantId) && Boolean(agentId),
  });
}

export function useCreateAgent(tenantId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateAgentBody) => createAgent(tenantId, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.agents.all(tenantId),
      });
    },
  });
}

export function useUpdateAgent(tenantId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      agentId,
      body,
    }: {
      agentId: string;
      body: UpdateAgentBody;
    }) => updateAgent(tenantId, agentId, body),
    onSuccess: (_data, { agentId }) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.agents.all(tenantId),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.agents.detail(tenantId, agentId),
      });
    },
  });
}

export function useDeleteAgent(tenantId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (agentId: string) => deleteAgent(tenantId, agentId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.agents.all(tenantId),
      });
    },
  });
}

"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  createElevenLabsCustomVoice,
  listElevenLabsVoices,
  previewElevenLabsVoice,
} from "@/lib/api/elevenlabs";
import { queryKeys } from "@/lib/api/query-keys";
import { updateAgent } from "@/lib/api/agents";
import type { UpdateAgentBody } from "@/lib/validation/agents-update";

export function useElevenLabsVoices(tenantId: string) {
  return useQuery({
    queryKey: queryKeys.elevenlabs.voices(tenantId),
    queryFn: () => listElevenLabsVoices(tenantId),
    enabled: Boolean(tenantId),
    staleTime: 60_000,
  });
}

export function usePreviewVoice(tenantId: string) {
  return useMutation({
    mutationFn: (voiceId: string) =>
      previewElevenLabsVoice(tenantId, voiceId),
  });
}

export function useCreateCustomVoice(tenantId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { name: string; sample: File }) =>
      createElevenLabsCustomVoice(tenantId, params),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.elevenlabs.voices(tenantId),
      });
    },
  });
}

/**
 * Creates a custom ElevenLabs voice and applies it to an agent in one flow.
 */
export function useCreateCustomVoiceAndApplyAgent(tenantId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      name: string;
      sample: File;
      agentId: string;
      agentPatch: UpdateAgentBody;
    }) => {
      const created = await createElevenLabsCustomVoice(tenantId, {
        name: params.name,
        sample: params.sample,
      });
      const agent = await updateAgent(tenantId, params.agentId, {
        ...params.agentPatch,
        voiceId: created.voiceId,
        voiceProviderId: "elevenlabs",
      });
      return { created, agent };
    },
    onSuccess: (_data, { agentId }) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.elevenlabs.voices(tenantId),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.agents.all(tenantId),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.agents.detail(tenantId, agentId),
      });
    },
  });
}

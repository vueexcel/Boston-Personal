"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getCall,
  listCalls,
  type ListCallsParams,
} from "@/lib/api/calls";
import { queryKeys } from "@/lib/api/query-keys";

export function useCalls(
  tenantId: string,
  params?: ListCallsParams & { enabled?: boolean },
) {
  const { enabled = true, ...listParams } = params ?? {};
  return useQuery({
    queryKey: queryKeys.calls.list(tenantId, {
      agentId: listParams.agentId,
      from: listParams.from,
      to: listParams.to,
      cursor: listParams.cursor,
    }),
    queryFn: () => listCalls(tenantId, listParams),
    enabled: Boolean(tenantId) && enabled,
  });
}

export function useCall(tenantId: string, callId: string | null) {
  return useQuery({
    queryKey: queryKeys.calls.detail(tenantId, callId ?? ""),
    queryFn: () => getCall(tenantId, callId!),
    enabled: Boolean(tenantId) && Boolean(callId),
  });
}

export function useInvalidateCalls(tenantId: string) {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({
      queryKey: ["calls", tenantId],
    });
  };
}

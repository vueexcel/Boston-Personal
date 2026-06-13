"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getRoutingSettings,
  updateRoutingSettings,
} from "@/lib/api/routing";
import { queryKeys } from "@/lib/api/query-keys";
import type { UpdateRoutingSettingsRequest } from "@/lib/validation/routing-settings";

export function useRoutingSettings(tenantId: string) {
  return useQuery({
    queryKey: queryKeys.routing.settings(tenantId),
    queryFn: () => getRoutingSettings(tenantId),
    enabled: Boolean(tenantId),
    staleTime: 30_000,
  });
}

export function useUpdateRoutingSettings(tenantId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateRoutingSettingsRequest) =>
      updateRoutingSettings(tenantId, body),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.routing.settings(tenantId), data);
    },
  });
}

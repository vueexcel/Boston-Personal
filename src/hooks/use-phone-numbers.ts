"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listPhoneNumbers,
  provisionPhoneNumber,
  releasePhoneNumber,
  searchAvailablePhoneNumbers,
  updatePhoneNumber,
} from "@/lib/api/phone-numbers";
import { queryKeys } from "@/lib/api/query-keys";
import type {
  ProvisionPhoneNumberBody,
  UpdatePhoneNumberBody,
} from "@/lib/validation/phone-numbers";

export function usePhoneNumbers(tenantId: string) {
  return useQuery({
    queryKey: queryKeys.phoneNumbers.all(tenantId),
    queryFn: () => listPhoneNumbers(tenantId),
    enabled: Boolean(tenantId),
  });
}

export function useAvailablePhoneNumbers(
  tenantId: string,
  params: { country: string; areaCode: string },
  enabled: boolean,
) {
  return useQuery({
    queryKey: queryKeys.phoneNumbers.available(tenantId, params),
    queryFn: () =>
      searchAvailablePhoneNumbers(tenantId, {
        country: params.country,
        areaCode: params.areaCode || undefined,
      }),
    enabled: Boolean(tenantId) && enabled,
    staleTime: 0,
  });
}

export function useUpdatePhoneNumber(tenantId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      phoneId,
      body,
    }: {
      phoneId: string;
      body: UpdatePhoneNumberBody;
    }) => updatePhoneNumber(tenantId, phoneId, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.phoneNumbers.all(tenantId),
      });
    },
  });
}

export function useProvisionPhoneNumber(tenantId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ProvisionPhoneNumberBody) =>
      provisionPhoneNumber(tenantId, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.phoneNumbers.all(tenantId),
      });
    },
  });
}

export function useReleasePhoneNumber(tenantId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (phoneId: string) => releasePhoneNumber(tenantId, phoneId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.phoneNumbers.all(tenantId),
      });
    },
  });
}

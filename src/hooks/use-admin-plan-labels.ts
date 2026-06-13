"use client";

import { useQuery } from "@tanstack/react-query";
import {
  planLabel,
  tenantPlanOptions,
  type TenantPlanOption,
} from "@/lib/db/tenant-plans";
import type { CostingSettings } from "@/lib/db/costing-settings";
import type { ApiEnvelope } from "@/types/api";

type CostingSettingsResponse = CostingSettings & {
  createdAt: string;
  updatedAt: string;
};

async function fetchCostingSettings(): Promise<CostingSettingsResponse> {
  const res = await fetch("/api/admin/costing", { credentials: "same-origin" });
  const body = (await res.json()) as ApiEnvelope<CostingSettingsResponse>;
  if (!body.success) {
    throw new Error(body.error?.message ?? "Failed to load pricing settings");
  }
  return body.data;
}

export function useAdminPlanLabels() {
  const query = useQuery({
    queryKey: ["admin-costing"],
    queryFn: fetchCostingSettings,
    staleTime: 60_000,
  });

  const costing = query.data;
  const options: TenantPlanOption[] = tenantPlanOptions(costing);
  const labelFor = (code: string) => planLabel(code, costing);

  return {
    ...query,
    options,
    labelFor,
  };
}

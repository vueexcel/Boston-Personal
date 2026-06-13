import { apiFetch, apiGet } from "@/lib/api/http";
import type { TenantRoutingPayload } from "@/lib/services/tenant-routing";
import type { UpdateRoutingSettingsRequest } from "@/lib/validation/routing-settings";

function routingPath(tenantId: string): string {
  return `/api/v1/tenants/${tenantId}/routing`;
}

export async function getRoutingSettings(
  tenantId: string,
): Promise<TenantRoutingPayload> {
  return apiGet<TenantRoutingPayload>(routingPath(tenantId));
}

export async function updateRoutingSettings(
  tenantId: string,
  body: UpdateRoutingSettingsRequest,
): Promise<TenantRoutingPayload> {
  return apiFetch<TenantRoutingPayload>(routingPath(tenantId), {
    method: "PUT",
    body,
  });
}

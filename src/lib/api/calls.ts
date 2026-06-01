import { apiGet } from "@/lib/api/http";
import type { CallLogDetail, CallLogListItem } from "@/lib/services/calls";

function tenantCallsPath(tenantId: string): string {
  return `/api/v1/tenants/${tenantId}/calls`;
}

export type ListCallsParams = {
  limit?: number;
  cursor?: string;
  agentId?: string;
  from?: string;
  to?: string;
};

export async function listCalls(
  tenantId: string,
  params?: ListCallsParams,
): Promise<{ calls: CallLogListItem[]; nextCursor: string | null }> {
  const search = new URLSearchParams();
  if (params?.limit) search.set("limit", String(params.limit));
  if (params?.cursor) search.set("cursor", params.cursor);
  if (params?.agentId) search.set("agentId", params.agentId);
  if (params?.from) search.set("from", params.from);
  if (params?.to) search.set("to", params.to);
  const qs = search.toString();
  const path = qs
    ? `${tenantCallsPath(tenantId)}?${qs}`
    : tenantCallsPath(tenantId);
  return apiGet<{ calls: CallLogListItem[]; nextCursor: string | null }>(path);
}

export async function getCall(
  tenantId: string,
  callId: string,
): Promise<CallLogDetail> {
  const data = await apiGet<{ call: CallLogDetail }>(
    `${tenantCallsPath(tenantId)}/${callId}`,
  );
  return data.call;
}

export function callRecordingUrl(tenantId: string, callId: string): string {
  return `${tenantCallsPath(tenantId)}/${callId}/recording`;
}

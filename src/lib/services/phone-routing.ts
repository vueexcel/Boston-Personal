import { createServerSupabase } from "@/lib/db/supabase-server";
import { agentDebugLog } from "@/lib/debug/agent-log";
import { getTenantRoutingSettings } from "@/lib/services/tenant-routing";
import { getTenantMetaCached } from "@/lib/services/tenant";
import type { TenantRoutingSettingsV1 } from "@/lib/tenant-portal/routing-settings-v1";
import { normalizeInboundToE164 } from "@/lib/utils/phone-format";
import { parseTenantRoutingSettings } from "@/lib/services/routing-schedule";

export type InboundCallResolution = {
  tenantId: string;
  agentId: string;
  phoneNumberId: string;
  e164Number: string;
};

export type InboundRoutingContext = {
  routing: TenantRoutingSettingsV1;
  timezone: string;
  tenantStatus: string;
};

export type InboundRouteFailure =
  | "no_phone_row"
  | "no_assigned_agent"
  | "inactive_tenant"
  | "inactive_agent"
  | "db_error";

export type ResolveInboundCallResult =
  | { ok: true; resolution: InboundCallResolution; routing: InboundRoutingContext }
  | {
      ok: false;
      reason: InboundRouteFailure;
      tenantId?: string;
      routing?: InboundRoutingContext;
    };

/**
 * Resolves the owning `tenant_id` for an inbound E.164 number.
 */
export async function resolveTenantIdByInboundPhone(
  toE164: string,
): Promise<string | null> {
  const supabase = createServerSupabase();
  const normalized = normalizeInboundToE164(toE164);
  const { data, error } = await supabase
    .from("phone_numbers")
    .select("tenant_id")
    .eq("e164_number", normalized)
    .eq("status", "ACTIVE")
    .is("deleted_at", null)
    .limit(2);

  if (error || !data || data.length !== 1) return null;
  const tenantId = data[0].tenant_id as string | undefined;
  return typeof tenantId === "string" ? tenantId : null;
}

async function loadActivePhoneRow(
  toE164: string,
): Promise<
  | { ok: true; row: Record<string, unknown> }
  | { ok: false; reason: InboundRouteFailure }
> {
  const supabase = createServerSupabase();
  const normalized = normalizeInboundToE164(toE164);
  const { data, error } = await supabase
    .from("phone_numbers")
    .select("id, tenant_id, e164_number, assigned_agent_id")
    .eq("e164_number", normalized)
    .eq("status", "ACTIVE")
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    return { ok: false, reason: "db_error" };
  }
  if (!data) {
    return { ok: false, reason: "no_phone_row" };
  }
  return { ok: true, row: data as Record<string, unknown> };
}

async function loadInboundRoutingContext(
  tenantId: string,
): Promise<InboundRoutingContext> {
  const [meta, routingPayload] = await Promise.all([
    getTenantMetaCached(tenantId),
    getTenantRoutingSettings(tenantId),
  ]);

  const routing =
    routingPayload?.routing ?? parseTenantRoutingSettings(undefined);
  const timezone =
    routingPayload?.timezone ?? meta?.timezone ?? "America/New_York";
  const tenantStatus = meta?.status ?? "INACTIVE";

  return { routing, timezone, tenantStatus };
}

/**
 * Resolves tenant, assigned agent, and phone row for an inbound Twilio call.
 */
export async function resolveInboundCallDetailed(
  toE164: string,
  fromE164: string,
): Promise<ResolveInboundCallResult> {
  const normalized = normalizeInboundToE164(toE164);
  const phone = await loadActivePhoneRow(toE164);

  if (!phone.ok) {
    agentDebugLog({
      location: "phone-routing.ts",
      message: "route failed",
      hypothesisId: "H2",
      data: {
        reason: phone.reason,
        toNormalized: normalized.slice(-4),
        toLen: normalized.length,
        fromSuffix: fromE164.slice(-4),
      },
    });
    return { ok: false, reason: phone.reason };
  }

  const data = phone.row;
  const tenantId =
    typeof data.tenant_id === "string" ? data.tenant_id : null;
  const phoneNumberId = typeof data.id === "string" ? data.id : null;
  const agentId =
    typeof data.assigned_agent_id === "string"
      ? data.assigned_agent_id
      : null;
  const e164Number =
    typeof data.e164_number === "string" ? data.e164_number : normalized;

  if (!tenantId || !phoneNumberId) {
    agentDebugLog({
      location: "phone-routing.ts",
      message: "route failed",
      hypothesisId: "H2",
      data: { reason: "db_error", toNormalized: normalized.slice(-4) },
    });
    return { ok: false, reason: "db_error" };
  }

  const routingContext = await loadInboundRoutingContext(tenantId);

  if (routingContext.tenantStatus !== "ACTIVE") {
    agentDebugLog({
      location: "phone-routing.ts",
      message: "route failed",
      hypothesisId: "H2",
      data: {
        reason: "inactive_tenant",
        toNormalized: normalized.slice(-4),
        tenantStatus: routingContext.tenantStatus,
      },
    });
    return {
      ok: false,
      reason: "inactive_tenant",
      tenantId,
      routing: routingContext,
    };
  }

  if (!agentId) {
    agentDebugLog({
      location: "phone-routing.ts",
      message: "route failed",
      hypothesisId: "H2",
      data: { reason: "no_assigned_agent", toNormalized: normalized.slice(-4) },
    });
    return { ok: false, reason: "no_assigned_agent" };
  }

  const supabase = createServerSupabase();
  const { data: agent, error: agentError } = await supabase
    .from("agents")
    .select("id, status")
    .eq("id", agentId)
    .eq("tenant_id", tenantId)
    .is("deleted_at", null)
    .maybeSingle();

  if (agentError) {
    return { ok: false, reason: "db_error" };
  }
  if (!agent || agent.status !== "ACTIVE") {
    agentDebugLog({
      location: "phone-routing.ts",
      message: "route failed",
      hypothesisId: "H2",
      data: {
        reason: "inactive_agent",
        toNormalized: normalized.slice(-4),
        agentStatus:
          typeof agent?.status === "string" ? agent.status : "missing",
      },
    });
    return { ok: false, reason: "inactive_agent" };
  }

  return {
    ok: true,
    resolution: {
      tenantId,
      agentId,
      phoneNumberId,
      e164Number,
    },
    routing: routingContext,
  };
}

/**
 * @deprecated Prefer {@link resolveInboundCallDetailed} when the failure reason matters.
 */
export async function resolveInboundCall(
  toE164: string,
  fromE164: string,
): Promise<InboundCallResolution | null> {
  const result = await resolveInboundCallDetailed(toE164, fromE164);
  return result.ok ? result.resolution : null;
}

export function inboundRouteFailureMessage(
  reason: InboundRouteFailure,
): string {
  switch (reason) {
    case "no_assigned_agent":
      return "No voice agent is assigned to this phone number. Please assign an agent in the portal and try again.";
    case "inactive_agent":
      return "The voice agent assigned to this number is not active. Please activate the agent and try again.";
    case "inactive_tenant":
      return "This account is not active. Please contact support.";
    case "no_phone_row":
      return "This phone number is not registered in Bostel. Add it under Phone Numbers in the portal.";
    case "db_error":
      return "This line is temporarily unavailable. Please try again later.";
  }
}

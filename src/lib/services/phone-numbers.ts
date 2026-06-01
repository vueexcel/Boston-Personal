import { createServerSupabase } from "@/lib/db/supabase-server";
import {
  purchaseTwilioPhoneNumber,
  releaseTwilioPhoneNumber,
} from "@/lib/integrations/twilio-phone-numbers";

export type PhoneNumberRow = {
  id: string;
  tenantId: string;
  e164Number: string;
  twilioSid: string | null;
  assignedAgentId: string | null;
  status: string;
};

function mapRow(row: Record<string, unknown>): PhoneNumberRow | null {
  const id = row.id;
  const tenantId = row.tenant_id;
  const e164 = row.e164_number;
  if (
    typeof id !== "string" ||
    typeof tenantId !== "string" ||
    typeof e164 !== "string"
  ) {
    return null;
  }
  return {
    id,
    tenantId,
    e164Number: e164,
    twilioSid:
      typeof row.twilio_sid === "string" ? row.twilio_sid : null,
    assignedAgentId:
      typeof row.assigned_agent_id === "string"
        ? row.assigned_agent_id
        : null,
    status: typeof row.status === "string" ? row.status : "ACTIVE",
  };
}

export async function listPhoneNumbersForTenant(
  tenantId: string,
): Promise<PhoneNumberRow[]> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("phone_numbers")
    .select(
      "id, tenant_id, e164_number, twilio_sid, assigned_agent_id, status",
    )
    .eq("tenant_id", tenantId)
    .is("deleted_at", null)
    .order("e164_number", { ascending: true });

  if (error) {
    throw new Error(`Failed to list phone numbers: ${error.message}`);
  }

  const result: PhoneNumberRow[] = [];
  for (const row of data ?? []) {
    const mapped = mapRow(row as Record<string, unknown>);
    if (mapped) result.push(mapped);
  }
  return result;
}

export async function updatePhoneNumberAssignment(
  tenantId: string,
  phoneId: string,
  assignedAgentId: string | null,
): Promise<PhoneNumberRow> {
  const supabase = createServerSupabase();

  if (assignedAgentId) {
    const { data: agent, error: agentErr } = await supabase
      .from("agents")
      .select("id")
      .eq("id", assignedAgentId)
      .eq("tenant_id", tenantId)
      .is("deleted_at", null)
      .maybeSingle();

    if (agentErr || !agent) {
      throw new Error("Agent not found for this tenant");
    }
  }

  const { data, error } = await supabase
    .from("phone_numbers")
    .update({ assigned_agent_id: assignedAgentId })
    .eq("id", phoneId)
    .eq("tenant_id", tenantId)
    .is("deleted_at", null)
    .select(
      "id, tenant_id, e164_number, twilio_sid, assigned_agent_id, status",
    )
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to update phone number: ${error.message}`);
  }
  if (!data) {
    throw new Error("Phone number not found");
  }

  const mapped = mapRow(data as Record<string, unknown>);
  if (!mapped) throw new Error("Invalid phone number row");
  return mapped;
}

export async function provisionPhoneNumberForTenant(
  tenantId: string,
  e164Number: string,
  assignedAgentId?: string | null,
): Promise<PhoneNumberRow> {
  const supabase = createServerSupabase();

  const { data: existing } = await supabase
    .from("phone_numbers")
    .select("id")
    .eq("e164_number", e164Number)
    .is("deleted_at", null)
    .maybeSingle();

  if (existing) {
    throw new Error("This phone number is already registered");
  }

  if (assignedAgentId) {
    const { data: agent, error: agentErr } = await supabase
      .from("agents")
      .select("id")
      .eq("id", assignedAgentId)
      .eq("tenant_id", tenantId)
      .is("deleted_at", null)
      .maybeSingle();
    if (agentErr || !agent) {
      throw new Error("Agent not found for this tenant");
    }
  }

  const { sid, phoneNumber } = await purchaseTwilioPhoneNumber(e164Number);

  const { data, error } = await supabase
    .from("phone_numbers")
    .insert({
      tenant_id: tenantId,
      e164_number: phoneNumber,
      twilio_sid: sid,
      assigned_agent_id: assignedAgentId ?? null,
      status: "ACTIVE",
    })
    .select(
      "id, tenant_id, e164_number, twilio_sid, assigned_agent_id, status",
    )
    .single();

  if (error) {
    try {
      await releaseTwilioPhoneNumber(sid);
    } catch {
      // best-effort rollback
    }
    throw new Error(`Failed to save phone number: ${error.message}`);
  }

  const mapped = mapRow(data as Record<string, unknown>);
  if (!mapped) throw new Error("Invalid phone number row");
  return mapped;
}

export async function releasePhoneNumberForTenant(
  tenantId: string,
  phoneId: string,
): Promise<void> {
  const supabase = createServerSupabase();

  const { data: row, error: fetchErr } = await supabase
    .from("phone_numbers")
    .select("id, twilio_sid")
    .eq("id", phoneId)
    .eq("tenant_id", tenantId)
    .is("deleted_at", null)
    .maybeSingle();

  if (fetchErr) {
    throw new Error(`Failed to load phone number: ${fetchErr.message}`);
  }
  if (!row) {
    throw new Error("Phone number not found");
  }

  const twilioSid =
    typeof row.twilio_sid === "string" ? row.twilio_sid : null;

  if (twilioSid) {
    try {
      await releaseTwilioPhoneNumber(twilioSid);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Twilio release failed";
      throw new Error(message);
    }
  }

  const { error } = await supabase
    .from("phone_numbers")
    .update({
      status: "RELEASED",
      assigned_agent_id: null,
      deleted_at: new Date().toISOString(),
    })
    .eq("id", phoneId)
    .eq("tenant_id", tenantId);

  if (error) {
    throw new Error(`Failed to release phone number: ${error.message}`);
  }
}

/** Phones assigned to this agent (active rows only). */
export async function listPhoneNumbersForAgent(
  tenantId: string,
  agentId: string,
): Promise<PhoneNumberRow[]> {
  const all = await listPhoneNumbersForTenant(tenantId);
  return all.filter((p) => p.assignedAgentId === agentId);
}

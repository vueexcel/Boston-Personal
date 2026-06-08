import { unstable_noStore as noStore } from "next/cache";
import { createServerSupabase } from "@/lib/db/supabase-server";
import {
  createAgentBodySchema,
  type WizardTemplateId,
} from "@/lib/validation/agents-create";
import { updateAgentBodySchema } from "@/lib/validation/agents-update";
import {
  assertContentSafeForAgentUpdate,
  type SafetyIssue,
} from "@/lib/services/prompt-content-safety";

const WIZARD_COPY: Record<
  WizardTemplateId,
  { roleDescription: string; greeting: string }
> = {
  appointments: {
    roleDescription:
      "Appointment scheduling assistant: qualify intent, offer available slots, confirm contact details, and arrange callbacks when needed.",
    greeting:
      "Thank you for calling. I can help you book or reschedule an appointment. How may I assist you today?",
  },
  sales_assistant: {
    roleDescription:
      "Sales assistant: answer product questions, capture lead details, and route qualified buyers to the right team member.",
    greeting:
      "Thanks for reaching out. I am here to help with product information and next steps. What are you looking for today?",
  },
  customer_faq: {
    roleDescription:
      "Customer FAQ agent: provide accurate answers from the knowledge base, escalate edge cases, and keep tone helpful and concise.",
    greeting:
      "Hello, and thanks for calling. Ask me anything about our services and I will do my best to help.",
  },
  lead_generation: {
    roleDescription:
      "Lead generation agent: engage visitors, capture structured qualification answers, and summarize intent for follow-up.",
    greeting:
      "Hi there. I would love to learn what brought you in today so we can point you in the right direction.",
  },
};

export type AgentSummary = {
  id: string;
  tenantId: string;
  name: string;
  status: string;
  roleDescription: string | null;
  greeting: string | null;
  createdAt: string;
};

export type AgentDetail = AgentSummary & {
  voiceId: string | null;
  voiceProviderId: string | null;
  language: string | null;
};

/** PostgREST may return `text` as string; json/jsonb columns as object — normalize for the portal. */
function asDbText(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return null;
    }
  }
  return String(value);
}

function mapAgentRow(row: Record<string, unknown>): AgentSummary | null {
  const id = row.id;
  const tenantId = row.tenant_id;
  const name = row.name;
  const status = row.status;
  const createdAt = row.created_at;
  if (
    typeof id !== "string" ||
    typeof tenantId !== "string" ||
    typeof name !== "string" ||
    typeof status !== "string"
  ) {
    return null;
  }
  const created =
    typeof createdAt === "string"
      ? createdAt
      : createdAt != null
        ? new Date(createdAt as string).toISOString()
        : new Date().toISOString();
  return {
    id,
    tenantId,
    name,
    status,
    roleDescription: asDbText(row.role_description),
    greeting: asDbText(row.greeting),
    createdAt: created,
  };
}

function mapAgentDetailRow(
  row: Record<string, unknown>,
): AgentDetail | null {
  const base = mapAgentRow(row);
  if (!base) return null;
  return {
    ...base,
    voiceId: typeof row.voice_id === "string" ? row.voice_id : null,
    voiceProviderId:
      typeof row.voice_provider_id === "string" ? row.voice_provider_id : null,
    language: typeof row.language === "string" ? row.language : null,
  };
}

/**
 * Returns true when the tenant row exists and is not soft-deleted.
 */
export async function tenantExists(tenantId: string): Promise<boolean> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("tenants")
    .select("id")
    .eq("id", tenantId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !data) return false;
  return true;
}

/**
 * Lists non-deleted agents for a tenant, newest first.
 */
export async function listAgentsForTenant(
  tenantId: string,
): Promise<AgentSummary[]> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("agents")
    .select(
      "id, tenant_id, name, status, role_description, greeting, created_at",
    )
    .eq("tenant_id", tenantId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  const out: AgentSummary[] = [];
  for (const raw of data ?? []) {
    const row = raw as Record<string, unknown>;
    const mapped = mapAgentRow(row);
    if (mapped && mapped.tenantId === tenantId) {
      out.push(mapped);
    }
  }
  return out;
}

/**
 * Loads one non-deleted agent for a tenant.
 */
export async function getAgentForTenant(
  tenantId: string,
  agentId: string,
): Promise<AgentDetail | null> {
  noStore();
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("agents")
    .select(
      "id, tenant_id, name, status, role_description, greeting, voice_id, voice_provider_id, language, created_at",
    )
    .eq("tenant_id", tenantId)
    .eq("id", agentId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error || !data) return null;
  return mapAgentDetailRow(data as unknown as Record<string, unknown>);
}

/**
 * Updates an agent row (partial).
 */
export type UpdateAgentResult = {
  agent: AgentDetail;
  warnings: SafetyIssue[];
};

export async function updateAgentForTenant(
  tenantId: string,
  agentId: string,
  input: unknown,
): Promise<UpdateAgentResult> {
  noStore();
  const parsed = updateAgentBodySchema.parse(input);

  const existing = await getAgentForTenant(tenantId, agentId);
  if (!existing) {
    const err = new Error("AGENT_NOT_FOUND");
    (err as Error & { code?: string }).code = "AGENT_NOT_FOUND";
    throw err;
  }

  const nextGreeting =
    parsed.greeting !== undefined ? parsed.greeting : existing.greeting;
  const nextRoleDescription =
    parsed.roleDescription !== undefined
      ? parsed.roleDescription
      : existing.roleDescription;

  let contentWarnings: SafetyIssue[] = [];
  if (
    parsed.greeting !== undefined ||
    parsed.roleDescription !== undefined
  ) {
    const safety = await assertContentSafeForAgentUpdate({
      greeting: nextGreeting,
      roleDescription: nextRoleDescription,
    });
    contentWarnings = safety.issues.filter((i) => i.severity === "warning");
  }

  const patch: Record<string, unknown> = {};
  if (parsed.name !== undefined) patch.name = parsed.name;
  if (parsed.greeting !== undefined) patch.greeting = parsed.greeting;
  if (parsed.roleDescription !== undefined) {
    patch.role_description = parsed.roleDescription;
  }
  if (parsed.voiceId !== undefined) patch.voice_id = parsed.voiceId;
  if (parsed.voiceProviderId !== undefined) {
    patch.voice_provider_id = parsed.voiceProviderId;
  }
  if (parsed.language !== undefined) patch.language = parsed.language;
  if (parsed.status !== undefined) patch.status = parsed.status;

  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("agents")
    .update(patch)
    .eq("id", agentId)
    .eq("tenant_id", tenantId)
    .is("deleted_at", null)
    .select(
      "id, tenant_id, name, status, role_description, greeting, voice_id, voice_provider_id, language, created_at",
    )
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  if (!data) {
    const err = new Error(
      "AGENT_UPDATE_NO_ROWS: No row updated. Confirm this agent id belongs to the tenant id in the URL and exists in Supabase.",
    );
    (err as Error & { code?: string }).code = "AGENT_UPDATE_NO_ROWS";
    throw err;
  }

  const mapped = mapAgentDetailRow(data as unknown as Record<string, unknown>);
  if (!mapped) throw new Error("Failed to parse updated agent");
  return { agent: mapped, warnings: contentWarnings };
}

/**
 * Soft-deletes an agent.
 */
export async function softDeleteAgentForTenant(
  tenantId: string,
  agentId: string,
): Promise<boolean> {
  const supabase = createServerSupabase();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("agents")
    .update({ deleted_at: now })
    .eq("id", agentId)
    .eq("tenant_id", tenantId)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();

  if (error) throw new Error(error.message);
  return !!data;
}

/**
 * Inserts a draft agent; seeds copy when `buildMode` is wizard.
 */
export async function createAgentForTenant(
  tenantId: string,
  input: unknown,
): Promise<AgentSummary> {
  const parsed = createAgentBodySchema.parse(input);

  const exists = await tenantExists(tenantId);
  if (!exists) {
    const err = new Error("TENANT_NOT_FOUND");
    (err as Error & { code?: string }).code = "TENANT_NOT_FOUND";
    throw err;
  }

  let roleDescription: string | null = null;
  let greeting: string | null = null;
  if (parsed.buildMode === "wizard" && parsed.wizardTemplate) {
    const copy = WIZARD_COPY[parsed.wizardTemplate];
    roleDescription = copy.roleDescription;
    greeting = copy.greeting;
  }

  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("agents")
    .insert({
      tenant_id: tenantId,
      name: parsed.name,
      role_description: roleDescription,
      greeting,
      voice_provider_id: null,
      voice_id: null,
      language: "en",
      status: "DRAFT",
      deleted_at: null,
    })
    .select(
      "id, tenant_id, name, status, role_description, greeting, created_at",
    )
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Insert failed");
  }

  const mapped = mapAgentRow(data as unknown as Record<string, unknown>);
  if (!mapped) {
    throw new Error("Failed to parse created agent");
  }
  return mapped;
}

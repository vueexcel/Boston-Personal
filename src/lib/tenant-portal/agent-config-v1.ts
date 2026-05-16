/**
 * Versioned JSON stored in `agents.role_description` so Behavior / Knowledge
 * fields persist without a new DB column (until you add `config jsonb`).
 */
export const AGENT_CONFIG_VERSION = 1 as const;

export const AGENT_RESPONSIBILITY_IDS = [
  "virtual_receptionist",
  "booking_appointments",
  "capture_leads",
  "after_hours",
  "customer_support",
  "orders_payments",
] as const;

export type AgentResponsibilityId =
  (typeof AGENT_RESPONSIBILITY_IDS)[number];

export const AGENT_RESPONSIBILITY_LABELS: Record<
  AgentResponsibilityId,
  string
> = {
  virtual_receptionist: "Virtual Receptionist",
  booking_appointments: "Booking & appointments",
  capture_leads: "Capture new leads",
  after_hours: "After hours answering",
  customer_support: "Customer support",
  orders_payments: "Take orders/Payments",
};

export type AgentPortalConfigV1 = {
  version: typeof AGENT_CONFIG_VERSION;
  agentResponsibility: AgentResponsibilityId;
  infoToCollect: string[];
  qualifyingQuestions: string;
  knowledgeProducts?: string;
  knowledgeFaqs?: string;
  knowledgeBaseMode?: string;
};

export const INFO_COLLECT_SUGGESTIONS = [
  "Caller's Name",
  "Phone Number",
  "Email Address",
  "Company Name",
  "Budget",
  "Timeline",
] as const;

export const KNOWLEDGE_FACT_SUGGESTIONS = [
  "Business Hours",
  "Service Area",
  "Contact Info",
  "Pricing & Fees",
  "Accepted Payments",
  "Response Time",
  "Cancellation Policy",
  "Current Promotions",
] as const;

export function defaultAgentPortalConfig(): AgentPortalConfigV1 {
  return {
    version: AGENT_CONFIG_VERSION,
    agentResponsibility: "virtual_receptionist",
    infoToCollect: [],
    qualifyingQuestions: "",
    knowledgeProducts: "",
    knowledgeFaqs: "",
    knowledgeBaseMode: "none",
  };
}

export function parseAgentPortalConfig(
  roleDescription: string | null,
): { config: AgentPortalConfigV1; legacyNotes: string | null } {
  if (!roleDescription || !roleDescription.trim()) {
    return { config: defaultAgentPortalConfig(), legacyNotes: null };
  }
  const trimmed = roleDescription.trim();
  if (!trimmed.startsWith("{")) {
    return {
      config: {
        ...defaultAgentPortalConfig(),
        qualifyingQuestions: trimmed,
      },
      legacyNotes: trimmed,
    };
  }
  try {
    const raw = JSON.parse(trimmed) as Partial<AgentPortalConfigV1>;
    if (raw.version !== AGENT_CONFIG_VERSION) {
      return {
        config: {
          ...defaultAgentPortalConfig(),
          qualifyingQuestions: trimmed,
        },
        legacyNotes: trimmed,
      };
    }
    const id = raw.agentResponsibility;
    const responsibility: AgentResponsibilityId =
      id && AGENT_RESPONSIBILITY_IDS.includes(id as AgentResponsibilityId)
        ? (id as AgentResponsibilityId)
        : "virtual_receptionist";
    return {
      config: {
        version: AGENT_CONFIG_VERSION,
        agentResponsibility: responsibility,
        infoToCollect: Array.isArray(raw.infoToCollect)
          ? raw.infoToCollect.filter((s) => typeof s === "string")
          : [],
        qualifyingQuestions:
          typeof raw.qualifyingQuestions === "string"
            ? raw.qualifyingQuestions
            : "",
        knowledgeProducts:
          typeof raw.knowledgeProducts === "string"
            ? raw.knowledgeProducts
            : "",
        knowledgeFaqs:
          typeof raw.knowledgeFaqs === "string" ? raw.knowledgeFaqs : "",
        knowledgeBaseMode:
          typeof raw.knowledgeBaseMode === "string"
            ? raw.knowledgeBaseMode
            : "none",
      },
      legacyNotes: null,
    };
  } catch {
    return {
      config: {
        ...defaultAgentPortalConfig(),
        qualifyingQuestions: trimmed,
      },
      legacyNotes: trimmed,
    };
  }
}

export function serializeAgentPortalConfig(
  config: AgentPortalConfigV1,
): string {
  return JSON.stringify(config);
}

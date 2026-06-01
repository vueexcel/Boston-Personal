export const queryKeys = {
  agents: {
    all: (tenantId: string) => ["agents", tenantId] as const,
    detail: (tenantId: string, agentId: string) =>
      ["agents", tenantId, agentId] as const,
    testSignedUrl: (tenantId: string, agentId: string) =>
      ["agents", tenantId, agentId, "test-signed-url"] as const,
  },
  elevenlabs: {
    voices: (tenantId: string) => ["elevenlabs", "voices", tenantId] as const,
  },
  phoneNumbers: {
    all: (tenantId: string) => ["phoneNumbers", tenantId] as const,
    available: (
      tenantId: string,
      params: { country: string; areaCode: string },
    ) => ["phoneNumbers", tenantId, "available", params] as const,
  },
  knowledgeBases: {
    all: (tenantId: string) => ["knowledgeBases", tenantId] as const,
    detail: (tenantId: string, kbId: string) =>
      ["knowledgeBases", tenantId, kbId] as const,
    documents: (tenantId: string, kbId: string) =>
      ["knowledgeBases", tenantId, kbId, "documents"] as const,
  },
  calls: {
    list: (
      tenantId: string,
      filters: {
        agentId?: string;
        from?: string;
        to?: string;
        cursor?: string;
      },
    ) => ["calls", tenantId, "list", filters] as const,
    detail: (tenantId: string, callId: string) =>
      ["calls", tenantId, callId] as const,
  },
} as const;

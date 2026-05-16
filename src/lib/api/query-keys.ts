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
} as const;

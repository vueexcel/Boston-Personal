import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api/http";
import type { AgentDetail, AgentSummary } from "@/lib/services/agents";
import type { CreateAgentBody } from "@/lib/validation/agents-create";
import type { UpdateAgentBody } from "@/lib/validation/agents-update";

function tenantAgentsPath(tenantId: string): string {
  return `/api/v1/tenants/${tenantId}/agents`;
}

export type CreatedAgentSummary = {
  id: string;
  name: string;
  status: string;
};

export async function listAgents(tenantId: string): Promise<AgentSummary[]> {
  const data = await apiGet<{ agents: AgentSummary[] }>(
    tenantAgentsPath(tenantId),
  );
  return data.agents;
}

export async function getAgent(
  tenantId: string,
  agentId: string,
): Promise<AgentDetail> {
  const data = await apiGet<{ agent: AgentDetail }>(
    `${tenantAgentsPath(tenantId)}/${agentId}`,
  );
  return data.agent;
}

export async function createAgent(
  tenantId: string,
  body: CreateAgentBody,
): Promise<CreatedAgentSummary> {
  const data = await apiPost<{ agent: CreatedAgentSummary }>(
    tenantAgentsPath(tenantId),
    body,
  );
  return data.agent;
}

export async function updateAgent(
  tenantId: string,
  agentId: string,
  body: UpdateAgentBody,
): Promise<AgentDetail> {
  const data = await apiPatch<{ agent: AgentDetail }>(
    `${tenantAgentsPath(tenantId)}/${agentId}`,
    body,
  );
  return data.agent;
}

export async function deleteAgent(
  tenantId: string,
  agentId: string,
): Promise<void> {
  await apiDelete<{ ok: boolean }>(
    `${tenantAgentsPath(tenantId)}/${agentId}`,
  );
}

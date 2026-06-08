import { z } from "zod";
import { createServerSupabase } from "@/lib/db/supabase-server";
import { queryOne } from "@/lib/db/postgres";
import {
  callLogItemSchema,
  e164Schema,
  uuidSchema,
  type CallLogItem,
} from "@/lib/db/schema";
import {
  buildTranscriptPlainText,
  creditsDisplay,
  dispositionLabel,
  getMetadataActionItems,
  getMetadataCollectedInfo,
  getMetadataSentiment,
  getMetadataString,
  parseTranscriptTurns,
  type TranscriptTurn,
} from "@/lib/services/call-metadata";
import type { CollectedInfoItem } from "@/lib/services/call-collected-info";
import { refreshTenantMetaCacheAfterWrite } from "@/lib/services/tenant";
import type { CallSentiment } from "@/lib/services/openai-agent";
import { fetchTwilioCallInsights } from "@/lib/integrations/twilio-call-logs";
import type { TwilioCallInsights } from "@/lib/types/twilio-call-insights";
import {
  twilioDisplayFields,
  twilioInsightsFromMetadata,
} from "@/lib/utils/twilio-call-display";
import type { TwilioCallDisplayFields } from "@/lib/utils/twilio-call-display";

function encodeCallCursor(startedAt: string, id: string): string {
  return Buffer.from(JSON.stringify({ startedAt, id }), "utf8").toString(
    "base64url",
  );
}

function decodeCallCursor(
  cursor: string | null | undefined,
): { startedAt: string; id: string } | null {
  if (!cursor) return null;
  try {
    const json = Buffer.from(cursor, "base64url").toString("utf8");
    const o = JSON.parse(json) as { startedAt?: string; id?: string };
    if (
      typeof o.startedAt === "string" &&
      o.startedAt.length > 0 &&
      typeof o.id === "string" &&
      o.id.length > 0
    ) {
      return { startedAt: o.startedAt, id: o.id };
    }
    return null;
  } catch {
    return null;
  }
}

function mapCallLogRow(row: Record<string, unknown>): CallLogItem | null {
  const started =
    typeof row.started_at === "string"
      ? row.started_at
      : new Date(row.started_at as string).toISOString();
  const ended =
    row.ended_at == null
      ? null
      : typeof row.ended_at === "string"
        ? row.ended_at
        : new Date(row.ended_at as string).toISOString();
  const created =
    typeof row.created_at === "string"
      ? row.created_at
      : new Date(row.created_at as string).toISOString();

  const parsed = callLogItemSchema.safeParse({
    callId: row.id,
    tenantId: row.tenant_id,
    providerCallId: row.provider_call_id,
    callerNumber: row.caller_number,
    dialedNumber: row.dialed_number,
    agentId: row.agent_id ?? null,
    status: row.status,
    duration: row.duration,
    disposition: row.disposition,
    summary: row.summary,
    transcriptUrl: row.transcript_url,
    recordingUrl: row.recording_url,
    callMinutes: row.call_minutes,
    metadata: row.metadata,
    startedAt: started,
    endedAt: ended,
    createdAt: created,
  });
  return parsed.success ? parsed.data : null;
}

function agentNameFromRow(row: Record<string, unknown>): string | null {
  const agents = row.agents;
  if (agents && typeof agents === "object" && "name" in agents) {
    const name = (agents as { name?: unknown }).name;
    return typeof name === "string" ? name : null;
  }
  return null;
}

export type CallLogListItem = CallLogItem & {
  agentName: string | null;
  credits: string;
  dispositionLabel: string;
  twilio: TwilioCallInsights | null;
  twilioDisplay: TwilioCallDisplayFields | null;
};

export type CallLogDetail = CallLogListItem & {
  transcriptTurns: TranscriptTurn[];
  sentiment: CallSentiment | null;
  actionItems: string[];
  collectedInfo: CollectedInfoItem[];
  turnCount: number;
};

async function resolveTwilioInsightsForCall(
  providerCallId: string,
  metadata: Record<string, unknown> | null,
  options?: { fetchLive?: boolean },
): Promise<TwilioCallInsights | null> {
  const cached = twilioInsightsFromMetadata(metadata);
  if (cached && !options?.fetchLive) return cached;
  const live = await fetchTwilioCallInsights(providerCallId);
  return live ?? cached;
}

function attachTwilioFields(
  mapped: CallLogItem,
  agentName: string | null,
  twilio: TwilioCallInsights | null,
): CallLogListItem {
  const meta =
    mapped.metadata && typeof mapped.metadata === "object"
      ? (mapped.metadata as Record<string, unknown>)
      : null;
  return {
    ...mapped,
    agentName,
    credits: creditsDisplay(meta, mapped.duration),
    dispositionLabel: dispositionLabel(mapped.status, mapped.disposition),
    twilio,
    twilioDisplay: twilioDisplayFields(twilio),
  };
}

export type ListCallsFilters = {
  agentId?: string | null;
  from?: string | null;
  to?: string | null;
};

/**
 * Lists call logs for a tenant (keyset pagination, optional filters).
 */
export async function listCallsForTenant(
  tenantId: string,
  limit: number,
  cursor?: string | null,
  filters?: ListCallsFilters,
): Promise<{
  calls: CallLogListItem[];
  nextCursor: string | null;
}> {
  const supabase = createServerSupabase();
  const decoded = decodeCallCursor(cursor ?? null);

  const rpcArgs: Record<string, unknown> = {
    p_tenant_id: tenantId,
    p_limit: limit + 1,
  };
  if (decoded) {
    rpcArgs.p_cursor_started_at = decoded.startedAt;
    rpcArgs.p_cursor_id = decoded.id;
  }
  if (filters?.agentId) {
    rpcArgs.p_agent_id = filters.agentId;
  }
  if (filters?.from) {
    rpcArgs.p_from = filters.from;
  }
  if (filters?.to) {
    rpcArgs.p_to = filters.to;
  }

  const { data, error } = await supabase.rpc("list_calls_keyset", rpcArgs);

  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []) as Record<string, unknown>[];
  const agentIds = Array.from(
    new Set(
      rows
        .map((r) => r.agent_id)
        .filter((id): id is string => typeof id === "string"),
    ),
  );

  const agentNameById = new Map<string, string>();
  if (agentIds.length > 0) {
    const { data: agents } = await supabase
      .from("agents")
      .select("id, name")
      .in("id", agentIds);
    for (const a of agents ?? []) {
      if (a.id && a.name) agentNameById.set(String(a.id), String(a.name));
    }
  }

  const mappedRows: { mapped: CallLogItem; meta: Record<string, unknown> | null }[] =
    [];
  for (const raw of rows) {
    const mapped = mapCallLogRow(raw);
    if (!mapped || mapped.tenantId !== tenantId) continue;
    const meta =
      mapped.metadata && typeof mapped.metadata === "object"
        ? (mapped.metadata as Record<string, unknown>)
        : null;
    mappedRows.push({ mapped, meta });
  }

  const twilioBySid = await Promise.all(
    mappedRows.map(async ({ mapped, meta }) => {
      const cached = twilioInsightsFromMetadata(meta);
      if (cached) return cached;
      return fetchTwilioCallInsights(mapped.providerCallId);
    }),
  );

  const calls: CallLogListItem[] = mappedRows.map(({ mapped }, i) =>
    attachTwilioFields(
      mapped,
      mapped.agentId ? (agentNameById.get(mapped.agentId) ?? null) : null,
      twilioBySid[i] ?? null,
    ),
  );

  const hasMore = calls.length > limit;
  const page = hasMore ? calls.slice(0, limit) : calls;
  const last = page[page.length - 1];
  const nextCursor =
    hasMore && last
      ? encodeCallCursor(last.startedAt, last.callId)
      : null;

  return { calls: page, nextCursor };
}

export async function getCallLogByProviderId(
  providerCallId: string,
): Promise<CallLogItem | null> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("call_logs")
    .select("*")
    .eq("provider_call_id", providerCallId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;
  return mapCallLogRow(data as Record<string, unknown>);
}

export async function getCallDetailForTenant(
  tenantId: string,
  callId: string,
): Promise<CallLogDetail | null> {
  const joined = await queryOne<Record<string, unknown>>(
    `SELECT c.*, a.name AS agent_name
     FROM public.call_logs c
     LEFT JOIN public.agents a ON a.id = c.agent_id
     WHERE c.tenant_id = $1 AND c.id = $2 AND c.deleted_at IS NULL`,
    [tenantId, callId],
  );
  if (!joined) return null;

  const raw = {
    ...joined,
    agents: joined.agent_name != null ? { name: joined.agent_name } : null,
  } as Record<string, unknown>;
  const mapped = mapCallLogRow(raw);
  if (!mapped) return null;

  const meta =
    mapped.metadata && typeof mapped.metadata === "object"
      ? (mapped.metadata as Record<string, unknown>)
      : {};

  let transcriptTurns = parseTranscriptTurns(meta);
  if (transcriptTurns.length === 0) {
    const plain = getMetadataString(meta, "transcript");
    if (plain) {
      transcriptTurns = plain
        .split("\n")
        .map((line) => {
          const idx = line.indexOf(": ");
          if (idx < 0) return null;
          const role = line.slice(0, idx).trim();
          const content = line.slice(idx + 2).trim();
          if (role !== "user" && role !== "assistant") return null;
          return { role, content } as TranscriptTurn;
        })
        .filter((t): t is TranscriptTurn => t != null);
    }
  }

  const turnCount =
    typeof meta.turnCount === "number"
      ? meta.turnCount
      : transcriptTurns.length;

  const twilio = await resolveTwilioInsightsForCall(
    mapped.providerCallId,
    meta,
    { fetchLive: true },
  );

  return {
    ...attachTwilioFields(mapped, agentNameFromRow(raw), twilio),
    transcriptTurns,
    sentiment: getMetadataSentiment(meta),
    actionItems: getMetadataActionItems(meta),
    collectedInfo: getMetadataCollectedInfo(meta),
    turnCount,
  };
}

const createCallInputSchema = z.object({
  tenantId: uuidSchema,
  callId: uuidSchema,
  providerCallId: z.string().min(1).max(128),
  callerNumber: z.string().min(3).max(32),
  dialedNumber: e164Schema,
  agentId: uuidSchema.optional().nullable(),
  startedAt: z.iso.datetime().optional(),
});

export type CreateCallInput = z.infer<typeof createCallInputSchema>;

export type CreateCallRecordResult = {
  created: boolean;
  duplicate: boolean;
};

export async function createCallRecordTransact(
  input: CreateCallInput,
): Promise<CreateCallRecordResult> {
  const parsed = createCallInputSchema.parse(input);
  const {
    tenantId,
    callId,
    providerCallId,
    callerNumber,
    dialedNumber,
    agentId,
    startedAt,
  } = parsed;
  const supabase = createServerSupabase();
  const now = new Date().toISOString();
  const started = startedAt ?? now;

  const { error } = await supabase.from("call_logs").insert({
    id: callId,
    tenant_id: tenantId,
    provider_call_id: providerCallId,
    caller_number: callerNumber,
    dialed_number: dialedNumber,
    agent_id: agentId ?? null,
    status: "INITIATED",
    duration: null,
    disposition: null,
    summary: null,
    transcript_url: null,
    recording_url: null,
    call_minutes: null,
    metadata: null,
    started_at: started,
    ended_at: null,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  });

  if (error) {
    if (error.code === "23505") {
      return { created: false, duplicate: true };
    }
    throw new Error(error.message);
  }

  await refreshTenantMetaCacheAfterWrite(tenantId);
  return { created: true, duplicate: false };
}

async function getCallLogMetadataById(
  callId: string,
): Promise<Record<string, unknown>> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("call_logs")
    .select("metadata")
    .eq("id", callId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.metadata || typeof data.metadata !== "object") return {};
  return data.metadata as Record<string, unknown>;
}

export type CallLogPatch = {
  status?: "INITIATED" | "IN_PROGRESS" | "COMPLETED" | "FAILED" | "MISSED";
  endedAt?: string | null;
  duration?: number | null;
  metadata?: Record<string, unknown> | null;
  metadataMerge?: boolean;
  summary?: string | null;
  disposition?: string | null;
  recordingUrl?: string | null;
  callMinutes?: number | null;
};

async function applyCallLogPatch(
  filter: { column: "id" | "provider_call_id"; value: string },
  patch: CallLogPatch,
  loadMetadata?: () => Promise<Record<string, unknown>>,
): Promise<void> {
  const supabase = createServerSupabase();

  let metadataToWrite = patch.metadata;
  if (patch.metadata !== undefined && patch.metadataMerge && loadMetadata) {
    const prev = await loadMetadata();
    metadataToWrite = { ...prev, ...patch.metadata };
  }

  const row: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (patch.status) row.status = patch.status;
  if (patch.endedAt !== undefined) row.ended_at = patch.endedAt;
  if (patch.duration !== undefined) row.duration = patch.duration;
  if (metadataToWrite !== undefined) row.metadata = metadataToWrite;
  if (patch.summary !== undefined) row.summary = patch.summary;
  if (patch.disposition !== undefined) row.disposition = patch.disposition;
  if (patch.recordingUrl !== undefined) row.recording_url = patch.recordingUrl;
  if (patch.callMinutes !== undefined) row.call_minutes = patch.callMinutes;

  const { error } = await supabase
    .from("call_logs")
    .update(row)
    .eq(filter.column, filter.value)
    .is("deleted_at", null);

  if (error) {
    throw new Error(error.message);
  }
}

export async function updateCallLogById(
  callId: string,
  patch: CallLogPatch,
): Promise<void> {
  await applyCallLogPatch(
    { column: "id", value: callId },
    patch,
    patch.metadata !== undefined && patch.metadataMerge
      ? () => getCallLogMetadataById(callId)
      : undefined,
  );
}

export async function updateCallLogByProviderId(
  providerCallId: string,
  patch: CallLogPatch,
): Promise<void> {
  await applyCallLogPatch(
    { column: "provider_call_id", value: providerCallId },
    patch,
    patch.metadata !== undefined && patch.metadataMerge
      ? async () => {
          const existing = await getCallLogByProviderId(providerCallId);
          return existing?.metadata && typeof existing.metadata === "object"
            ? (existing.metadata as Record<string, unknown>)
            : {};
        }
      : undefined,
  );
}

export { buildTranscriptPlainText };

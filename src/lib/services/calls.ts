import { z } from "zod";
import { createServerSupabase } from "@/lib/db/supabase-server";
import {
  callLogItemSchema,
  e164Schema,
  uuidSchema,
  type CallLogItem,
} from "@/lib/db/schema";
import { refreshTenantMetaCacheAfterWrite } from "@/lib/services/tenant";

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

/**
 * Lists call logs for a tenant (keyset pagination on `started_at DESC`, `id DESC`).
 *
 * @param tenantId - Authenticated tenant UUID.
 * @param limit - Page size (1–100).
 * @param cursor - Opaque cursor from a previous page.
 */
export async function listCallsForTenant(
  tenantId: string,
  limit: number,
  cursor?: string | null,
): Promise<{
  calls: CallLogItem[];
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

  const { data, error } = await supabase.rpc("list_calls_keyset", rpcArgs);

  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []) as Record<string, unknown>[];
  const calls: CallLogItem[] = [];
  for (const raw of rows) {
    const mapped = mapCallLogRow(raw);
    if (mapped && mapped.tenantId === tenantId) {
      calls.push(mapped);
    }
  }

  const hasMore = calls.length > limit;
  const page = hasMore ? calls.slice(0, limit) : calls;
  const last = page[page.length - 1];
  const nextCursor =
    hasMore && last
      ? encodeCallCursor(last.startedAt, last.callId)
      : null;

  return { calls: page, nextCursor };
}

const createCallInputSchema = z.object({
  tenantId: uuidSchema,
  callId: uuidSchema,
  providerCallId: z.string().min(1).max(128),
  callerNumber: z.string().min(3).max(32),
  dialedNumber: e164Schema,
  startedAt: z.iso.datetime().optional(),
});

export type CreateCallInput = z.infer<typeof createCallInputSchema>;

/**
 * Inserts a call log row; duplicate `provider_call_id` is ignored (idempotent).
 *
 * @param input - Call identifiers and tenant scope (must match auth context).
 */
export async function createCallRecordTransact(
  input: CreateCallInput,
): Promise<void> {
  const parsed = createCallInputSchema.parse(input);
  const {
    tenantId,
    callId,
    providerCallId,
    callerNumber,
    dialedNumber,
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
    agent_id: null,
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
      return;
    }
    throw new Error(error.message);
  }

  await refreshTenantMetaCacheAfterWrite(tenantId);
}

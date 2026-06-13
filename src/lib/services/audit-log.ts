import { query } from "@/lib/db/postgres";

export async function writeAuditLog(input: {
  tenantId?: string | null;
  userId?: string | null;
  entityType: string;
  entityId: string;
  action: string;
  oldValue?: unknown;
  newValue?: unknown;
  ipAddress?: string | null;
}): Promise<void> {
  await query(
    `INSERT INTO public.audit_logs (
       tenant_id, user_id, audited_entity_type, audited_entity_id,
       action, old_value, new_value, ip_address
     ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8)`,
    [
      input.tenantId ?? null,
      input.userId ?? null,
      input.entityType,
      input.entityId,
      input.action,
      input.oldValue != null ? JSON.stringify(input.oldValue) : null,
      input.newValue != null ? JSON.stringify(input.newValue) : null,
      input.ipAddress ?? null,
    ],
  );
}

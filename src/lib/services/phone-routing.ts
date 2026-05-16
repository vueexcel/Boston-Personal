import { createServerSupabase } from "@/lib/db/supabase-server";

/**
 * Resolves the owning `tenant_id` for an inbound E.164 number.
 *
 * @param toE164 - Dialed number in E.164 (e.g. +15551234567).
 * @returns Tenant UUID when exactly one active row exists.
 */
export async function resolveTenantIdByInboundPhone(
  toE164: string,
): Promise<string | null> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("phone_numbers")
    .select("tenant_id")
    .eq("e164_number", toE164)
    .eq("status", "ACTIVE")
    .is("deleted_at", null)
    .limit(2);

  if (error || !data || data.length !== 1) return null;
  const tenantId = data[0].tenant_id as string | undefined;
  return typeof tenantId === "string" ? tenantId : null;
}

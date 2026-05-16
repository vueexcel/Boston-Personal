/**
 * Demo tenant display context for the Customer Tenant Portal shell.
 * Replace with session / tenant resolution when auth is wired.
 */
export type TenantPortalAccountStatus = "ACTIVE" | "INACTIVE";

export const DEMO_TENANT_DISPLAY_ID = "TEN-10025";

export const DEMO_ACCOUNT_STATUS: TenantPortalAccountStatus = "ACTIVE";

/**
 * Resolves the tenant label shown in the portal header (server-only env override).
 */
export function getPortalTenantDisplayId(): string {
  return process.env.PORTAL_TENANT_DISPLAY_ID ?? DEMO_TENANT_DISPLAY_ID;
}

/**
 * Resolves account status badge for the portal header (server-only env override).
 */
export function getPortalAccountStatus(): TenantPortalAccountStatus {
  const raw = process.env.PORTAL_ACCOUNT_STATUS;
  if (raw === "INACTIVE") return "INACTIVE";
  return "ACTIVE";
}

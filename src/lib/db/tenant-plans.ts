import type { CostingSettings } from "@/lib/db/costing-settings";

export const TENANT_PLAN_CODES = ["PACKAGE_1", "PACKAGE_2", "PAYG"] as const;

export type TenantPlanCode = (typeof TENANT_PLAN_CODES)[number];

const LEGACY_PLAN_MAP: Record<string, TenantPlanCode> = {
  VOICE_AI_STARTER: "PACKAGE_1",
  VOICE_AI_PRO: "PACKAGE_2",
};

const DEFAULT_LABELS: Record<TenantPlanCode, string> = {
  PACKAGE_1: "Package 1",
  PACKAGE_2: "Package 2",
  PAYG: "Pay-as-you-go",
};

export function isTenantPlanCode(value: string): value is TenantPlanCode {
  return (TENANT_PLAN_CODES as readonly string[]).includes(value);
}

/**
 * Maps legacy plan codes to canonical PACKAGE_1 / PACKAGE_2 / PAYG values.
 */
export function normalizeTenantPlanCode(raw: string): TenantPlanCode {
  const trimmed = raw.trim();
  if (isTenantPlanCode(trimmed)) return trimmed;
  return LEGACY_PLAN_MAP[trimmed] ?? "PACKAGE_1";
}

export function planLabel(
  code: string,
  costing?: Pick<CostingSettings, "package1Name" | "package2Name">,
): string {
  const normalized = normalizeTenantPlanCode(code);
  if (normalized === "PACKAGE_1") {
    return costing?.package1Name?.trim() || DEFAULT_LABELS.PACKAGE_1;
  }
  if (normalized === "PACKAGE_2") {
    return costing?.package2Name?.trim() || DEFAULT_LABELS.PACKAGE_2;
  }
  return DEFAULT_LABELS.PAYG;
}

export type TenantPlanOption = {
  value: TenantPlanCode;
  label: string;
};

export function tenantPlanOptions(
  costing?: Pick<CostingSettings, "package1Name" | "package2Name">,
): TenantPlanOption[] {
  return TENANT_PLAN_CODES.map((value) => ({
    value,
    label: planLabel(value, costing),
  }));
}

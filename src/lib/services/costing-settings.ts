import {
  costingSettingsSchema,
  DEFAULT_COSTING_SETTINGS,
  type CostingSettings,
} from "@/lib/db/costing-settings";
import { queryOne } from "@/lib/db/postgres";

type CostingSettingsRow = {
  hourly_rate: string | number;
  package_1_name: string;
  package_1_hours: string | number;
  package_1_price: string | number;
  package_2_name: string;
  package_2_hours: string | number;
  package_2_price: string | number;
  payg_rate: string | number;
  created_at: Date | string;
  updated_at: Date | string;
};

function toNumber(value: string | number): number {
  return typeof value === "number" ? value : Number.parseFloat(value);
}

function mapRow(row: CostingSettingsRow): CostingSettings & {
  createdAt: string;
  updatedAt: string;
} {
  return {
    hourlyRate: toNumber(row.hourly_rate),
    package1Name: row.package_1_name,
    package1Hours: toNumber(row.package_1_hours),
    package1Price: toNumber(row.package_1_price),
    package2Name: row.package_2_name,
    package2Hours: toNumber(row.package_2_hours),
    package2Price: toNumber(row.package_2_price),
    paygRate: toNumber(row.payg_rate),
    createdAt:
      typeof row.created_at === "string"
        ? row.created_at
        : row.created_at.toISOString(),
    updatedAt:
      typeof row.updated_at === "string"
        ? row.updated_at
        : row.updated_at.toISOString(),
  };
}

/**
 * Platform pricing configuration (singleton row).
 *
 * Business rules (enforced by tenant billing service):
 * - Package hours are consumed first per billing period.
 * - After package exhaustion, up to 30h postpaid PAYG is tracked and invoiced
 *   on the next cycle for hours actually used at paygRate.
 */
export async function getCostingSettings(): Promise<
  CostingSettings & { createdAt: string; updatedAt: string }
> {
  const row = await queryOne<CostingSettingsRow>(
    `SELECT
       hourly_rate, package_1_name, package_1_hours, package_1_price,
       package_2_name, package_2_hours, package_2_price, payg_rate,
       created_at, updated_at
     FROM public.costing_settings
     WHERE id = 1`,
  );

  if (!row) {
    const now = new Date().toISOString();
    return { ...DEFAULT_COSTING_SETTINGS, createdAt: now, updatedAt: now };
  }

  return mapRow(row);
}

export async function updateCostingSettings(
  input: CostingSettings,
): Promise<CostingSettings & { createdAt: string; updatedAt: string }> {
  const parsed = costingSettingsSchema.parse(input);

  const row = await queryOne<CostingSettingsRow>(
    `UPDATE public.costing_settings
     SET
       hourly_rate = $1,
       package_1_name = $2,
       package_1_hours = $3,
       package_1_price = $4,
       package_2_name = $5,
       package_2_hours = $6,
       package_2_price = $7,
       payg_rate = $8
     WHERE id = 1
     RETURNING
       hourly_rate, package_1_name, package_1_hours, package_1_price,
       package_2_name, package_2_hours, package_2_price, payg_rate,
       created_at, updated_at`,
    [
      parsed.hourlyRate,
      parsed.package1Name,
      parsed.package1Hours,
      parsed.package1Price,
      parsed.package2Name,
      parsed.package2Hours,
      parsed.package2Price,
      parsed.paygRate,
    ],
  );

  if (!row) {
    throw new Error("Failed to update costing settings");
  }

  return mapRow(row);
}

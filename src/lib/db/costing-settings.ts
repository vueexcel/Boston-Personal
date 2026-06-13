import { z } from "zod";

export const costingSettingsSchema = z.object({
  hourlyRate: z.number().positive(),
  package1Name: z.string().trim().min(1).max(120),
  package1Hours: z.number().positive(),
  package1Price: z.number().positive(),
  package2Name: z.string().trim().min(1).max(120),
  package2Hours: z.number().positive(),
  package2Price: z.number().positive(),
  paygRate: z.number().positive(),
});

export type CostingSettings = z.infer<typeof costingSettingsSchema>;

export const DEFAULT_COSTING_SETTINGS: CostingSettings = {
  hourlyRate: 5,
  package1Name: "30 Hours Package",
  package1Hours: 30,
  package1Price: 150,
  package2Name: "90 Hours Package",
  package2Hours: 90,
  package2Price: 450,
  paygRate: 5,
};

/** Reference cost: hours × hourly rate (safe for client and server). */
export function computePackageCost(
  hours: number,
  hourlyRate: number,
): number {
  return hours * hourlyRate;
}

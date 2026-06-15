import { z } from "zod";
import { TENANT_PLAN_CODES } from "@/lib/db/tenant-plans";

export const billingPeriodStatusSchema = z.enum([
  "OPEN",
  "CLOSED",
  "INVOICED",
]);

export type BillingPeriodStatus = z.infer<typeof billingPeriodStatusSchema>;

export const billingUsageSummarySchema = z.object({
  periodId: z.string().uuid(),
  periodStart: z.string(),
  periodEnd: z.string(),
  planCode: z.enum(TENANT_PLAN_CODES),
  packageSecondsLimit: z.number().int().nonnegative(),
  packageSecondsUsed: z.number().int().nonnegative(),
  postpaidSecondsLimit: z.number().int().nonnegative(),
  postpaidSecondsUsed: z.number().int().nonnegative(),
  estimatedBillCents: z.number().int().nonnegative(),
  paygRatePerHour: z.number().positive(),
  lastInvoice: z
    .object({
      amountCents: z.number().int().nonnegative(),
      postpaidSecondsBilled: z.number().int().nonnegative(),
      createdAt: z.string(),
      lineDescription: z.string(),
    })
    .nullable(),
});

export type BillingUsageSummary = z.infer<typeof billingUsageSummarySchema>;

export const POSTPAID_HOURS_LIMIT = 30;
export const POSTPAID_SECONDS_LIMIT = POSTPAID_HOURS_LIMIT * 3600;

export function secondsToHours(seconds: number): number {
  return seconds / 3600;
}

export function formatBillingHours(seconds: number): string {
  const hours = secondsToHours(seconds);
  if (hours < 0.01 && seconds > 0) return "<0.01h";
  return `${hours.toFixed(2)}h`;
}

export function formatUsdFromCents(cents: number): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

export function computePostpaidInvoiceCents(
  postpaidSecondsUsed: number,
  paygRatePerHour: number,
): number {
  const hours = postpaidSecondsUsed / 3600;
  return Math.round(hours * paygRatePerHour * 100);
}

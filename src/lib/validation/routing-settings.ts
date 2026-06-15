import { z } from "zod";
import { e164Schema } from "@/lib/db/primitives";
import {
  defaultRoutingHolidays,
  ROUTING_SETTINGS_VERSION,
  type TenantRoutingSettingsV1,
} from "@/lib/tenant-portal/routing-settings-v1";
import {
  FEDERAL_HOLIDAY_IDS,
  isFederalHolidayId,
} from "@/lib/tenant-portal/us-federal-holidays";

const timeHmSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Expected HH:mm (24-hour)");

const fallbackTypeSchema = z.enum([
  "MESSAGE",
  "PHONE_FORWARD",
  "BOSTEL_SUPPORT",
  "VOICEMAIL",
]);

const fallbackMessageSchema = z.string().trim().min(10).max(500);

const routingFallbackSchema = z
  .object({
    type: fallbackTypeSchema,
    message: z.string().trim().max(500).optional(),
    forwardTo: z.string().trim().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.type === "PHONE_FORWARD") {
      const parsed = e164Schema.safeParse(val.forwardTo ?? "");
      if (!parsed.success) {
        ctx.addIssue({
          code: "custom",
          message: "A valid E.164 phone number is required for phone forward",
          path: ["forwardTo"],
        });
      }
      return;
    }
    const msg = val.message?.trim() ?? "";
    if (msg.length < 10) {
      ctx.addIssue({
        code: "custom",
        message: "Message is required (at least 10 characters)",
        path: ["message"],
      });
    }
  });

const monthDaySchema = z
  .string()
  .regex(/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, "Expected MM-DD");

const onceDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD")
  .refine((val) => {
    const [y, m, d] = val.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    return (
      dt.getUTCFullYear() === y &&
      dt.getUTCMonth() === m - 1 &&
      dt.getUTCDate() === d
    );
  }, "Invalid calendar date");

export const federalHolidayIdSchema = z.enum(FEDERAL_HOLIDAY_IDS);

const customHolidaySchema = z.discriminatedUnion("kind", [
  z.object({
    id: z.string().trim().min(1).max(64),
    name: z.string().trim().min(2).max(80),
    kind: z.literal("annual"),
    monthDay: monthDaySchema,
    enabled: z.boolean(),
  }),
  z.object({
    id: z.string().trim().min(1).max(64),
    name: z.string().trim().min(2).max(80),
    kind: z.literal("once"),
    date: onceDateSchema,
    enabled: z.boolean(),
  }),
]);

const routingHolidaysSchema = z
  .object({
    federalEnabled: z.boolean(),
    federal: z.record(z.string(), z.boolean()).default({}),
    custom: z.array(customHolidaySchema).max(50),
  })
  .transform((val) => {
    const defaults = defaultRoutingHolidays();
    const federal = { ...defaults.federal };
    for (const [key, enabled] of Object.entries(val.federal)) {
      if (isFederalHolidayId(key)) {
        federal[key] = enabled;
      }
    }
    const ids = new Set<string>();
    const custom = val.custom.filter((entry) => {
      if (ids.has(entry.id)) return false;
      ids.add(entry.id);
      return true;
    });
    return {
      federalEnabled: val.federalEnabled,
      federal,
      custom,
    };
  });

export const tenantRoutingSettingsBodySchema = z
  .object({
    businessHours: z.object({
      enabled: z.boolean(),
      weekdayStart: timeHmSchema,
      weekdayEnd: timeHmSchema,
    }),
    holidays: routingHolidaysSchema.default(defaultRoutingHolidays()),
    afterHoursFallback: routingFallbackSchema,
    inactiveFallback: routingFallbackSchema,
  })
  .superRefine((val, ctx) => {
    if (val.businessHours.enabled) {
      const start = val.businessHours.weekdayStart;
      const end = val.businessHours.weekdayEnd;
      if (start >= end) {
        ctx.addIssue({
          code: "custom",
          message: "Weekday end must be after weekday start",
          path: ["businessHours", "weekdayEnd"],
        });
      }
    }
  });

export type TenantRoutingSettingsBody = z.infer<
  typeof tenantRoutingSettingsBodySchema
>;

export const tenantTimezoneBodySchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .refine((tz) => {
    try {
      Intl.DateTimeFormat(undefined, { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, "Invalid IANA timezone");

export const updateRoutingSettingsRequestSchema = z.object({
  routing: tenantRoutingSettingsBodySchema,
  timezone: tenantTimezoneBodySchema.optional(),
});

export type UpdateRoutingSettingsRequest = z.infer<
  typeof updateRoutingSettingsRequestSchema
>;

export function toTenantRoutingSettingsV1(
  body: TenantRoutingSettingsBody,
): TenantRoutingSettingsV1 {
  return {
    version: ROUTING_SETTINGS_VERSION,
    businessHours: body.businessHours,
    holidays: body.holidays,
    afterHoursFallback: body.afterHoursFallback,
    inactiveFallback: body.inactiveFallback,
  };
}

export function routingSettingsBodyFromV1(
  settings: TenantRoutingSettingsV1,
): TenantRoutingSettingsBody {
  return {
    businessHours: settings.businessHours,
    holidays: settings.holidays,
    afterHoursFallback: settings.afterHoursFallback,
    inactiveFallback: settings.inactiveFallback,
  };
}

export { fallbackMessageSchema, customHolidaySchema };

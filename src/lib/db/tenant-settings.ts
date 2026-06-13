import { z } from "zod";

export const tenantCompanySettingsSchema = z.object({
  name: z.string().optional().default(""),
  website: z.string().optional().default(""),
});

export const tenantContactSettingsSchema = z.object({
  name: z.string().optional().default(""),
  email: z.string().optional().default(""),
  phone: z.string().optional().default(""),
});

export const tenantBillingSettingsSchema = z.object({
  address: z.string().optional().default(""),
  taxId: z.string().optional().default(""),
  notes: z.string().optional().default(""),
});

export const tenantProfileSettingsSchema = z.object({
  company: tenantCompanySettingsSchema.optional().default({ name: "", website: "" }),
  contact: tenantContactSettingsSchema.optional().default({
    name: "",
    email: "",
    phone: "",
  }),
  billing: tenantBillingSettingsSchema.optional().default({
    address: "",
    taxId: "",
    notes: "",
  }),
  timezone: z.string().optional(),
});

export type TenantProfileSettings = z.infer<typeof tenantProfileSettingsSchema>;

export function parseTenantProfileSettings(
  raw: unknown,
): TenantProfileSettings {
  const base =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const parsed = tenantProfileSettingsSchema.safeParse(base);
  if (parsed.success) return parsed.data;
  return tenantProfileSettingsSchema.parse({});
}

export function mergeTenantSettings(
  existing: unknown,
  patch: Partial<TenantProfileSettings>,
): Record<string, unknown> {
  const current = parseTenantProfileSettings(existing);
  const merged = {
    ...current,
    ...patch,
    company: { ...current.company, ...patch.company },
    contact: { ...current.contact, ...patch.contact },
    billing: { ...current.billing, ...patch.billing },
  };
  return merged as Record<string, unknown>;
}

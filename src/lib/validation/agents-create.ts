import { z } from "zod";

export const wizardTemplateIdSchema = z.enum([
  "appointments",
  "sales_assistant",
  "customer_faq",
  "lead_generation",
]);

export type WizardTemplateId = z.infer<typeof wizardTemplateIdSchema>;

export const createAgentBodySchema = z
  .object({
    name: z.string().min(1).max(256).trim(),
    buildMode: z.enum(["wizard", "blank"]),
    wizardTemplate: wizardTemplateIdSchema.optional(),
  })
  .superRefine((val, ctx) => {
    if (val.buildMode === "wizard" && !val.wizardTemplate) {
      ctx.addIssue({
        code: "custom",
        message: "wizardTemplate is required when buildMode is wizard",
        path: ["wizardTemplate"],
      });
    }
  });

export type CreateAgentBody = z.infer<typeof createAgentBodySchema>;

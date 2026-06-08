import { z } from "zod";
import {
  ELEVEN_FLASH_V25_LANGUAGE_CODES,
  toElevenLabsTtsLanguageCode,
} from "@/lib/integrations/elevenlabs-flash-v25-languages";

/**
 * Portal / API language field normalized to an `eleven_flash_v2_5` ISO 639-1 code.
 */
export const agentLanguageSchema = z
  .union([z.string().min(2).max(64), z.null()])
  .optional()
  .transform((value, ctx) => {
    if (value === undefined) return undefined;
    if (value === null) return null;
    const code = toElevenLabsTtsLanguageCode(value);
    if (!ELEVEN_FLASH_V25_LANGUAGE_CODES.has(code)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Unsupported language for ElevenLabs Flash v2.5",
      });
      return z.NEVER;
    }
    return code;
  });

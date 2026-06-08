import { buildPhoneConversationStyleBlock } from "@/lib/services/prompt-assembler";

/**
 * PSTN + browser voice/text test style layer (built from prompt-assembler).
 * @deprecated Prefer buildPhoneConversationStyleBlock() directly.
 */
export const PHONE_CONVERSATION_STYLE = buildPhoneConversationStyleBlock();

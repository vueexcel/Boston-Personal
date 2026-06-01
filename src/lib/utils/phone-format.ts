/**
 * Normalizes Twilio `To` / `From` values to E.164 for database lookup.
 */
export function normalizeInboundToE164(raw: string): string {
  const digits = raw.trim().replace(/\D/g, "");
  if (!digits) return raw.trim();
  return `+${digits}`;
}

/**
 * Formats E.164 US numbers as +1 (XXX) XXX-XXXX; returns input unchanged when not US-shaped.
 */
export function formatPhoneNumberDisplay(e164: string): string {  const digits = e164.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    const area = digits.slice(1, 4);
    const prefix = digits.slice(4, 7);
    const line = digits.slice(7, 11);
    return `+1 (${area}) ${prefix}-${line}`;
  }
  if (digits.length === 10) {
    return `+1 (${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return e164;
}

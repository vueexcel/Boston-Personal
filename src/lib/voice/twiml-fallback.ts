/**
 * Escapes text for safe inclusion inside Twilio TwiML `<Say>` elements.
 *
 * @param text - Raw user- or system-generated phrase.
 */
export function escapeForTwiMLSay(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * TwiML returned when a tenant is **inactive** or cannot be routed to live agents.
 * Inactive tenants must always receive fallback — never live agent handoff.
 *
 * @param message - Optional override spoken to the caller.
 */
export function inactiveTenantTwiML(message?: string): string {
  const phrase = escapeForTwiMLSay(
    message ??
      "This line is not accepting calls right now. Please try again later.",
  );
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Joanna">${phrase}</Say><Hangup/></Response>`;
}

/**
 * TwiML stub for an **active** tenant on the happy path (replace with `<Dial>` / media streams).
 *
 * @param tenantId - Tenant receiving the call (for logging / future routing).
 */
export function activeTenantStubTwiML(tenantId: string): string {
  const safe = escapeForTwiMLSay(`Tenant ${tenantId} is active. Connecting.`);
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Joanna">${safe}</Say><Pause length="1"/><Hangup/></Response>`;
}

export type AgentDebugPayload = {
  location: string;
  message: string;
  hypothesisId: string;
  data?: Record<string, unknown>;
  runId?: string;
};

function isVoiceDebugEnabled(): boolean {
  return process.env.DEBUG_VOICE === "1";
}

/** Optional voice pipeline debug logs (set DEBUG_VOICE=1). No secrets / PII. */
export function agentDebugLog(payload: AgentDebugPayload): void {
  if (!isVoiceDebugEnabled()) return;

  console.log(
    "[bostel-voice]",
    payload.location,
    payload.message,
    payload.hypothesisId,
    payload.data ?? {},
  );
}

export function wssHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "invalid-url";
  }
}

export function isLocalOrPrivateWss(url: string): boolean {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    return (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host.startsWith("192.168.") ||
      host.startsWith("10.")
    );
  } catch {
    return true;
  }
}

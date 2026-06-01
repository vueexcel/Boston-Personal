const DEBUG_ENDPOINT =
  "http://127.0.0.1:7522/ingest/6ccd5abb-3acd-4321-b624-ee504b3cedee";
const DEBUG_SESSION_ID = "33b5f3";

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

  // #region agent log
  console.log(
    "[bostel-voice]",
    payload.location,
    payload.message,
    payload.hypothesisId,
    payload.data ?? {},
  );
  fetch(DEBUG_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": DEBUG_SESSION_ID,
    },
    body: JSON.stringify({
      sessionId: DEBUG_SESSION_ID,
      timestamp: Date.now(),
      ...payload,
    }),
  }).catch(() => {});
  // #endregion
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

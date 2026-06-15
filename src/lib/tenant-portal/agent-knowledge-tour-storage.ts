const PENDING_KEY = "bostel_agent_kb_tour";

function storageAvailable(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const probe = "__bostel_probe__";
    window.sessionStorage.setItem(probe, "1");
    window.sessionStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

export function setPendingAgentKnowledgeTour(agentId: string): void {
  if (!storageAvailable()) return;
  window.sessionStorage.setItem(PENDING_KEY, agentId);
}

/** Read pending tour agent id without removing it (safe across Strict Mode remounts). */
export function getPendingAgentKnowledgeTourAgentId(): string | null {
  if (!storageAvailable()) return null;
  return window.sessionStorage.getItem(PENDING_KEY);
}

export function consumePendingAgentKnowledgeTour(agentId: string): boolean {
  if (!storageAvailable()) return false;
  const stored = window.sessionStorage.getItem(PENDING_KEY);
  if (stored !== agentId) return false;
  window.sessionStorage.removeItem(PENDING_KEY);
  return true;
}

export function clearPendingAgentKnowledgeTour(): void {
  if (!storageAvailable()) return;
  window.sessionStorage.removeItem(PENDING_KEY);
}

const COMPLETED_KEY = "bostel_portal_tour_v1_completed";
const SESSION_KEY = "bostel_portal_tour_v1_active";
const STEP_KEY = "bostel_portal_tour_v1_step";

function storageAvailable(type: "local" | "session"): boolean {
  if (typeof window === "undefined") return false;
  try {
    const store = type === "local" ? window.localStorage : window.sessionStorage;
    const probe = "__bostel_probe__";
    store.setItem(probe, "1");
    store.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

export function isTourCompleted(): boolean {
  if (!storageAvailable("local")) return false;
  return window.localStorage.getItem(COMPLETED_KEY) === "1";
}

export function markTourCompleted(): void {
  if (!storageAvailable("local")) return;
  window.localStorage.setItem(COMPLETED_KEY, "1");
}

export function isTourSessionActive(): boolean {
  if (!storageAvailable("session")) return false;
  return window.sessionStorage.getItem(SESSION_KEY) === "1";
}

export function setTourSessionActive(active: boolean): void {
  if (!storageAvailable("session")) return;
  if (active) {
    window.sessionStorage.setItem(SESSION_KEY, "1");
  } else {
    window.sessionStorage.removeItem(SESSION_KEY);
  }
}

export function getActiveTourStepIndex(): number | null {
  if (!storageAvailable("session")) return null;
  const raw = window.sessionStorage.getItem(STEP_KEY);
  if (raw == null) return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function setActiveTourStepIndex(index: number): void {
  if (!storageAvailable("session")) return;
  window.sessionStorage.setItem(STEP_KEY, String(index));
}

export function clearTourSession(): void {
  setTourSessionActive(false);
  if (!storageAvailable("session")) return;
  window.sessionStorage.removeItem(STEP_KEY);
}

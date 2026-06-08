/** Normalize text for echo / overlap comparison (shared browser + server). */
export function normalizeForEchoCompare(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeForEcho(text: string): string[] {
  return normalizeForEchoCompare(text).split(" ").filter((w) => w.length > 0);
}

export type EchoFilterOptions = {
  /** During agent playback, very short utterances are usually tail echo. */
  minUserCharsDuringPlayback?: number;
};

/**
 * Returns true when STT text is likely acoustic echo of agent TTS (not real user speech).
 */
export function isLikelyAgentEcho(
  userText: string,
  agentContext: string,
  options?: EchoFilterOptions,
): boolean {
  const user = normalizeForEchoCompare(userText);
  const agent = normalizeForEchoCompare(agentContext);
  if (!user) return true;
  if (!agent) return false;

  const minDuringPlayback = options?.minUserCharsDuringPlayback ?? 4;
  if (user.length < minDuringPlayback) return true;

  if (agent.includes(user)) return true;

  const userWords = tokenizeForEcho(userText);
  if (userWords.length === 0) return true;

  const agentWordList = tokenizeForEcho(agentContext);
  const agentWordSet = new Set(agentWordList);
  const matched = userWords.filter((w) => agentWordSet.has(w)).length;
  const overlap = matched / userWords.length;

  if (userWords.length >= 2 && overlap >= 0.8) return true;

  const agentTail = agent.slice(-Math.max(user.length * 3, 120));
  if (user.length >= 6 && agentTail.includes(user)) return true;

  if (userWords.length >= 3) {
    const tailWords = agentWordList.slice(-userWords.length * 2);
    const tailSet = new Set(tailWords);
    const tailMatched = userWords.filter((w) => tailSet.has(w)).length;
    if (tailMatched / userWords.length >= 0.85) return true;
  }

  return false;
}

export function appendAgentEchoContext(
  existing: string,
  sentence: string,
  maxChars = 600,
): string {
  const next = existing ? `${existing} ${sentence.trim()}` : sentence.trim();
  if (next.length <= maxChars) return next;
  return next.slice(-maxChars);
}

import { getRedis } from "@/lib/cache/redis";

export type CallerUtteranceMessage = {
  text: string;
  timestamp: string;
  final: boolean;
  stability?: number;
};

function utteranceChannel(callSid: string): string {
  return `call:twilio:${callSid}:utterance`;
}

/**
 * Publishes caller speech (partial or final) from Twilio RTT to the media worker.
 */
export async function publishCallerUtterance(
  callSid: string,
  text: string,
  options?: { final?: boolean; stability?: number },
): Promise<void> {
  const redis = getRedis();
  const payload: CallerUtteranceMessage = {
    text: text.trim(),
    timestamp: new Date().toISOString(),
    final: options?.final ?? true,
    stability: options?.stability,
  };
  await redis.publish(utteranceChannel(callSid), JSON.stringify(payload));
}

/**
 * Subscribes to caller utterances for a call. Returns cleanup (unsubscribe + disconnect).
 */
export async function subscribeCallerUtterances(
  callSid: string,
  onUtterance: (message: CallerUtteranceMessage) => void,
): Promise<() => Promise<void>> {
  const channel = utteranceChannel(callSid);
  const sub = getRedis().duplicate();

  sub.on("message", (ch, message) => {
    if (ch !== channel) return;
    try {
      const parsed = JSON.parse(message) as CallerUtteranceMessage;
      const text = parsed.text?.trim();
      if (!text) return;
      onUtterance({
        text,
        timestamp: parsed.timestamp ?? new Date().toISOString(),
        final: parsed.final ?? true,
        stability: parsed.stability,
      });
    } catch {
      // ignore malformed payloads
    }
  });

  await sub.subscribe(channel);

  return async () => {
    try {
      await sub.unsubscribe(channel);
    } catch {
      // ignore
    }
    sub.disconnect();
  };
}

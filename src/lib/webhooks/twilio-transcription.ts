export type TwilioTranscriptionWebhook = {
  callSid: string | undefined;
  transcriptionEvent: string | undefined;
  final: boolean;
  track: string | undefined;
  transcriptionDataRaw: string | undefined;
};

/**
 * Parses Twilio Real-Time Transcription status callback form fields.
 */
export function parseTwilioTranscriptionWebhook(
  params: Record<string, string>,
): TwilioTranscriptionWebhook {
  const finalRaw = params.Final?.toLowerCase();
  return {
    callSid: params.CallSid ?? params.ParentCallSid,
    transcriptionEvent: params.TranscriptionEvent,
    final: finalRaw === "true" || finalRaw === "1",
    track: params.Track,
    transcriptionDataRaw: params.TranscriptionData,
  };
}

export function parseTranscriptionData(
  raw: string | undefined,
): {
  transcript: string;
  confidence?: number;
  stability?: number;
} | null {
  if (!raw?.trim()) return null;
  try {
    const data = JSON.parse(raw) as {
      transcript?: string;
      confidence?: number;
      stability?: number;
      Stability?: number;
    };
    const transcript =
      typeof data.transcript === "string" ? data.transcript.trim() : "";
    if (!transcript) return null;
    const stabilityRaw = data.stability ?? data.Stability;
    return {
      transcript,
      confidence:
        typeof data.confidence === "number" ? data.confidence : undefined,
      stability:
        typeof stabilityRaw === "number" ? stabilityRaw : undefined,
    };
  } catch {
    return null;
  }
}

const MIN_TRANSCRIPT_LENGTH = 2;

export function isActionableCallerTranscript(transcript: string): boolean {
  return transcript.trim().length >= MIN_TRANSCRIPT_LENGTH;
}

import { escapeForTwiMLSay } from "@/lib/voice/twiml-fallback";

function escapeXmlAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type InboundMediaStreamTwiMLOptions = {
  streamUrl: string;
  recordingCallbackUrl: string;
};

/**
 * Inbound call TwiML: dual-channel recording + Media Stream (STT runs on stream via ElevenLabs Scribe).
 */
export function inboundMediaStreamTwiML(
  options: InboundMediaStreamTwiMLOptions,
): string {
  const streamUrl = escapeXmlAttr(options.streamUrl);
  const recordingUrl = escapeXmlAttr(options.recordingCallbackUrl);

  return `<?xml version="1.0" encoding="UTF-8"?><Response><Start><Recording recordingStatusCallback="${recordingUrl}" recordingStatusCallbackMethod="POST" recordingChannels="dual" trim="trim-silence"/></Start><Connect><Stream url="${streamUrl}"/></Connect></Response>`;
}

/** @deprecated Use {@link inboundMediaStreamTwiML} for inbound voice. */
export function mediaStreamConnectTwiML(streamUrl: string): string {
  const safeUrl = escapeXmlAttr(streamUrl);
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Connect><Stream url="${safeUrl}"/></Connect></Response>`;
}

export function spokenMessageTwiML(message: string): string {
  const phrase = escapeForTwiMLSay(message);
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Joanna">${phrase}</Say><Hangup/></Response>`;
}

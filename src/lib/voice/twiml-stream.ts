import { escapeForTwiMLSay } from "@/lib/voice/twiml-fallback";
import { getTwilioTranscriptionConfig } from "@/lib/env/server";

function escapeXmlAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type InboundMediaStreamTwiMLOptions = {
  streamUrl: string;
  transcriptionCallbackUrl: string;
  recordingCallbackUrl: string;
  languageCode: string;
  transcriptionName?: string;
};

/**
 * Inbound call TwiML: Twilio Real-Time Transcription (caller audio) + Media Stream for TTS playback.
 */
export function inboundMediaStreamTwiML(
  options: InboundMediaStreamTwiMLOptions,
): string {
  const { engine, speechModel } = getTwilioTranscriptionConfig();
  const streamUrl = escapeXmlAttr(options.streamUrl);
  const transcriptionUrl = escapeXmlAttr(options.transcriptionCallbackUrl);
  const recordingUrl = escapeXmlAttr(options.recordingCallbackUrl);
  const languageCode = escapeXmlAttr(options.languageCode);
  const name = escapeXmlAttr(options.transcriptionName ?? "bostel-inbound");
  const transcriptionEngine = escapeXmlAttr(engine);
  const speechModelAttr = escapeXmlAttr(speechModel);

  return `<?xml version="1.0" encoding="UTF-8"?><Response><Start><Recording recordingStatusCallback="${recordingUrl}" recordingStatusCallbackMethod="POST" recordingChannels="dual" trim="trim-silence"/><Transcription name="${name}" statusCallbackUrl="${transcriptionUrl}" track="inbound_track" partialResults="true" languageCode="${languageCode}" transcriptionEngine="${transcriptionEngine}" speechModel="${speechModelAttr}" enableAutomaticPunctuation="true"/></Start><Connect><Stream url="${streamUrl}"/></Connect></Response>`;
}

/** @deprecated Use {@link inboundMediaStreamTwiML} for inbound voice with RTT. */
export function mediaStreamConnectTwiML(streamUrl: string): string {
  const safeUrl = escapeXmlAttr(streamUrl);
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Connect><Stream url="${safeUrl}"/></Connect></Response>`;
}

export function spokenMessageTwiML(message: string): string {
  const phrase = escapeForTwiMLSay(message);
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Joanna">${phrase}</Say><Hangup/></Response>`;
}

import WebSocket from "ws";
import {
  appendTestCallMessages,
  deleteTestCallSession,
  getTestCallSession,
  saveTestCallSession,
  toVoiceConversationSession,
  type TestCallSession,
} from "@/lib/voice/test-call-session";
import {
  VoiceConversationEngine,
  type TtsMediaPayloadMeta,
  type VoiceConversationSession,
  type VoiceSessionStore,
} from "@/lib/voice/voice-conversation-engine";

type TestMediaMessage = {
  event?: string;
  streamSid?: string;
  start?: { callSid?: string; streamSid?: string };
  media?: { payload?: string; track?: string };
  speech?: {
    text?: string;
    final?: boolean;
    stability?: number;
    bargeIn?: boolean;
  };
};

function toVoiceSession(session: TestCallSession): VoiceConversationSession {
  return toVoiceConversationSession(session);
}

const testSessionStore: VoiceSessionStore = {
  async getSession(sessionId) {
    const session = await getTestCallSession(sessionId);
    return session ? toVoiceSession(session) : null;
  },
  async saveSession(session) {
    const existing = await getTestCallSession(session.sessionId);
    if (!existing) return;
    const updated: TestCallSession = {
      ...existing,
      messages: session.messages,
      turnCount: session.turnCount,
      greetingPlayed: session.greetingPlayed,
      collectedInfo: session.collectedInfo,
      extraInformation: session.extraInformation,
      conversationState: session.conversationState,
    };
    await saveTestCallSession(updated);
  },
  async appendMessages(sessionId, userText, assistantText) {
    const updated = await appendTestCallMessages(
      sessionId,
      userText,
      assistantText,
    );
    return updated ? toVoiceSession(updated) : null;
  },
};

export class AgentTestMediaStreamHandler {
  private ws: WebSocket;
  private streamSid: string | null = null;
  private engine: VoiceConversationEngine | null = null;
  private readonly sessionId: string;

  constructor(ws: WebSocket, sessionId: string) {
    this.ws = ws;
    this.sessionId = sessionId;

    this.ws.on("message", (data) => {
      void this.onMessage(data.toString());
    });
    this.ws.on("close", () => {
      void this.engine?.stop("test-ws-close");
    });
  }

  private async onMessage(raw: string): Promise<void> {
    let msg: TestMediaMessage;
    try {
      msg = JSON.parse(raw) as TestMediaMessage;
    } catch {
      return;
    }

    switch (msg.event) {
      case "connected":
        break;
      case "start":
        await this.onStart(msg);
        break;
      case "media":
        break;
      case "barge_in":
        this.engine?.signalBargeIn();
        break;
      case "caller_speech": {
        const text = msg.speech?.text?.trim();
        if (!this.engine || !text) break;
        this.engine.ingestCallerSpeech({
          text,
          final: msg.speech?.final === true,
          stability: msg.speech?.stability,
          bargeIn: msg.speech?.bargeIn === true,
        });
        break;
      }
      case "stop":
        await this.engine?.stop("test-stop-event");
        break;
      default:
        break;
    }
  }

  private async onStart(msg: TestMediaMessage): Promise<void> {
    const streamSid = msg.start?.streamSid ?? msg.streamSid ?? "test-stream";
    const sessionId = msg.start?.callSid ?? this.sessionId;

    const session = await getTestCallSession(sessionId);
    if (!session) {
      console.error("[agent-test-stream] No session for", sessionId);
      this.ws.close();
      return;
    }

    this.streamSid = streamSid;

    this.engine = new VoiceConversationEngine({
      transport: {
        sendMedia: (base64Payload, meta) =>
          this.sendMedia(base64Payload, meta),
        sendClear: () => this.sendClear(),
        sendSpeakStart: (text) => this.sendSpeakStart(text),
        sendTranscript: (payload) => this.sendTranscript(payload),
        sendCallEnded: (reason) => this.sendCallEnded(reason),
        close: () => this.ws.close(),
      },
      store: testSessionStore,
      streamSid,
      sttMode: "client",
      finalizeMode: "test",
      onFinalize: async (id) => {
        await deleteTestCallSession(id);
      },
      logPrefix: "agent-test-stream",
    });

    await this.engine.start(sessionId);
  }

  private sendSpeakStart(text: string): void {
    if (!this.streamSid || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(
      JSON.stringify({
        event: "speak_start",
        streamSid: this.streamSid,
        speak: { text },
      }),
    );
  }

  private sendTranscript(payload: {
    role: "user" | "assistant";
    text: string;
    final?: boolean;
  }): void {
    if (this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(
      JSON.stringify({
        event: "transcript",
        streamSid: this.streamSid,
        transcript: payload,
      }),
    );
  }

  private sendCallEnded(reason: string): void {
    if (this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(
      JSON.stringify({
        event: "call_ended",
        streamSid: this.streamSid,
        reason,
      }),
    );
  }

  private sendClear(): void {
    if (!this.streamSid || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(
      JSON.stringify({
        event: "clear",
        streamSid: this.streamSid,
      }),
    );
  }

  private sendMedia(base64Payload: string, meta?: TtsMediaPayloadMeta): void {
    if (!this.streamSid || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(
      JSON.stringify({
        event: "media",
        streamSid: this.streamSid,
        media: {
          payload: base64Payload,
          ...(meta?.format ? { format: meta.format } : {}),
        },
      }),
    );
  }
}

import WebSocket from "ws";
import {
  appendCallMessages,
  getCallSession,
  saveCallSession,
  type TwilioCallSession,
} from "@/lib/voice/call-session";
import { agentDebugLog } from "@/lib/debug/agent-log";
import { finalizeInboundCall } from "@/lib/voice/finalize-call";
import { initialCollectedMap } from "@/lib/services/call-collected-info";
import {
  VoiceConversationEngine,
  type VoiceConversationSession,
  type VoiceSessionStore,
} from "@/lib/voice/voice-conversation-engine";

type TwilioMediaMessage = {
  event?: string;
  streamSid?: string;
  start?: { callSid?: string; streamSid?: string };
  media?: { payload?: string; track?: string };
  sequenceNumber?: string;
};

function toVoiceSession(session: TwilioCallSession): VoiceConversationSession {
  return {
    sessionId: session.callSid,
    tenantId: session.tenantId,
    agentId: session.agentId,
    messages: session.messages,
    turnCount: session.turnCount,
    startedAt: session.startedAt,
    agentSnapshot: session.agentSnapshot,
    greetingPlayed: session.greetingPlayed,
    collectedInfo:
      session.collectedInfo ??
      initialCollectedMap(session.agentSnapshot.infoToCollect),
    extraInformation: session.extraInformation ?? [],
    conversationState: session.conversationState,
  };
}

const twilioSessionStore: VoiceSessionStore = {
  async getSession(sessionId) {
    const session = await getCallSession(sessionId);
    return session ? toVoiceSession(session) : null;
  },
  async saveSession(session) {
    const existing = await getCallSession(session.sessionId);
    if (!existing) return;
    const updated: TwilioCallSession = {
      ...existing,
      messages: session.messages,
      turnCount: session.turnCount,
      greetingPlayed: session.greetingPlayed,
      collectedInfo: session.collectedInfo,
      extraInformation: session.extraInformation,
      conversationState: session.conversationState,
    };
    await saveCallSession(updated);
  },
  async appendMessages(sessionId, userText, assistantText) {
    const updated = await appendCallMessages(
      sessionId,
      userText,
      assistantText,
    );
    return updated ? toVoiceSession(updated) : null;
  },
};

export class TwilioMediaStreamHandler {
  private ws: WebSocket;
  private streamSid: string | null = null;
  private engine: VoiceConversationEngine | null = null;

  constructor(ws: WebSocket) {
    this.ws = ws;
    this.ws.on("message", (data) => {
      void this.onMessage(data.toString());
    });
    this.ws.on("close", () => {
      void this.engine?.stop("twilio-ws-close");
    });
  }

  private async onMessage(raw: string): Promise<void> {
    let msg: TwilioMediaMessage;
    try {
      msg = JSON.parse(raw) as TwilioMediaMessage;
    } catch {
      return;
    }

    switch (msg.event) {
      case "connected":
        agentDebugLog({
          location: "twilio-media-stream-handler.ts:connected",
          message: "twilio ws connected event",
          hypothesisId: "H3",
          data: {},
        });
        break;
      case "start":
        await this.onStart(msg);
        break;
      case "media": {
        const track = msg.media?.track;
        const payload = msg.media?.payload;
        if (
          this.engine &&
          payload &&
          (track === "inbound" || track === "inbound_track" || !track)
        ) {
          this.engine.ingestInboundAudio(payload);
        }
        break;
      }
      case "stop":
        await this.engine?.stop("twilio-stop-event");
        break;
      default:
        break;
    }
  }

  private async onStart(msg: TwilioMediaMessage): Promise<void> {
    const callSid = msg.start?.callSid;
    const streamSid = msg.start?.streamSid ?? msg.streamSid;
    if (!callSid || !streamSid) return;

    this.streamSid = streamSid;

    const session = await getCallSession(callSid);
    if (!session) {
      agentDebugLog({
        location: "twilio-media-stream-handler.ts:onStart",
        message: "no redis session — closing ws",
        hypothesisId: "H5",
        data: { callSidPrefix: callSid.slice(0, 10) },
      });
      console.error("[media-stream] No session for", callSid);
      this.ws.close();
      return;
    }

    this.engine = new VoiceConversationEngine({
      transport: {
        sendMedia: (base64Payload) => this.sendMedia(base64Payload),
        sendClear: () => this.sendClear(),
        close: () => this.ws.close(),
      },
      store: twilioSessionStore,
      streamSid,
      finalizeMode: "twilio",
      onFinalize: async (sessionId) => {
        await finalizeInboundCall({
          providerCallId: sessionId,
          status: "COMPLETED",
          deleteSession: true,
        });
      },
      logPrefix: "media-stream",
    });

    await this.engine.start(callSid);
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

  private sendMedia(base64Payload: string): void {
    if (!this.streamSid || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(
      JSON.stringify({
        event: "media",
        streamSid: this.streamSid,
        media: { payload: base64Payload },
      }),
    );
  }
}

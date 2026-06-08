import type http from "http";
import httpLib from "http";
import { URL } from "url";
import { WebSocketServer } from "ws";
import {
  getVoiceMediaStreamPath,
  getVoiceMediaStreamPort,
  getVoiceTestStreamPath,
} from "@/lib/env/server";
import { AgentTestMediaStreamHandler } from "@/lib/voice/agent-test-media-stream-handler";
import { validateTestCallSessionToken } from "@/lib/voice/test-call-session";
import { TwilioMediaStreamHandler } from "@/lib/voice/twilio-media-stream-handler";
import { agentDebugLog } from "@/lib/debug/agent-log";

/**
 * Attaches Twilio Media Streams and portal agent-test WebSocket upgrade handling.
 */
export function attachTwilioMediaStreamUpgrade(server: http.Server): void {
  const twilioPath = getVoiceMediaStreamPath();
  const testPath = getVoiceTestStreamPath();
  const twilioWss = new WebSocketServer({ noServer: true });
  const testWss = new WebSocketServer({ noServer: true });

  twilioWss.on("connection", (ws) => {
    new TwilioMediaStreamHandler(ws);
  });

  testWss.on("connection", (ws, request) => {
    const url = new URL(request.url ?? "/", `http://${request.headers.host}`);
    const sessionId = url.searchParams.get("sessionId")?.trim();
    const token = url.searchParams.get("token")?.trim();
    if (!sessionId || !token) {
      console.error("[agent-test-stream] Missing sessionId or token");
      ws.close();
      return;
    }
    void validateTestCallSessionToken(sessionId, token).then((session) => {
      if (!session) {
        console.error("[agent-test-stream] Invalid session or token");
        ws.close();
        return;
      }
      new AgentTestMediaStreamHandler(ws, sessionId);
    });
  });

  server.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url ?? "/", `http://${request.headers.host}`);
    const reqPath = url.pathname;

    if (reqPath === twilioPath) {
      agentDebugLog({
        location: "twilio-media-stream-server.ts:upgrade",
        message: "ws upgrade accepted",
        hypothesisId: "H3",
        data: { reqPath },
      });
      twilioWss.handleUpgrade(request, socket, head, (ws) => {
        twilioWss.emit("connection", ws, request);
      });
      return;
    }

    if (reqPath === testPath) {
      agentDebugLog({
        location: "twilio-media-stream-server.ts:upgrade",
        message: "agent test ws upgrade accepted",
        hypothesisId: "H3",
        data: { reqPath },
      });
      testWss.handleUpgrade(request, socket, head, (ws) => {
        testWss.emit("connection", ws, request);
      });
      return;
    }

    if (reqPath.startsWith("/_next")) {
      return;
    }

    agentDebugLog({
      location: "twilio-media-stream-server.ts:upgrade",
      message: "ws upgrade path rejected",
      hypothesisId: "H3",
      data: { reqPath, twilioPath, testPath },
    });
    socket.destroy();
  });
}

/**
 * Starts a dedicated Twilio Media Streams WebSocket server (run from `npm run worker`).
 */
export function startTwilioMediaStreamServer(): http.Server {
  const port = getVoiceMediaStreamPort();
  const twilioPath = getVoiceMediaStreamPath();
  const testPath = getVoiceTestStreamPath();

  const server = httpLib.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("Twilio media stream worker");
  });

  attachTwilioMediaStreamUpgrade(server);

  server.listen(port, () => {
    console.info(
      `[media-stream] WebSocket listening on port ${port} paths ${twilioPath} ${testPath}`,
    );
  });

  return server;
}

export function isMediaStreamProxiedViaApp(): boolean {
  return process.env.VOICE_MEDIA_STREAM_PROXY_VIA_APP === "1";
}

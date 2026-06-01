import type http from "http";
import httpLib from "http";
import { WebSocketServer } from "ws";
import {
  getVoiceMediaStreamPath,
  getVoiceMediaStreamPort,
} from "@/lib/env/server";
import { TwilioMediaStreamHandler } from "@/lib/voice/twilio-media-stream-handler";
import { agentDebugLog } from "@/lib/debug/agent-log";

/**
 * Attaches Twilio Media Streams WebSocket upgrade handling to an existing HTTP server.
 */
export function attachTwilioMediaStreamUpgrade(server: http.Server): void {
  const path = getVoiceMediaStreamPath();
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url ?? "/", `http://${request.headers.host}`);
    const reqPath = url.pathname;
    if (reqPath !== path) {
      // Next dev HMR uses /_next/webpack-hmr — never destroy; ignore silently.
      if (reqPath.startsWith("/_next")) {
        return;
      }
      // #region agent log
      agentDebugLog({
        location: "twilio-media-stream-server.ts:upgrade",
        message: "ws upgrade path rejected",
        hypothesisId: "H3",
        data: { reqPath, expectedPath: path },
      });
      // #endregion
      socket.destroy();
      return;
    }

    // #region agent log
    agentDebugLog({
      location: "twilio-media-stream-server.ts:upgrade",
      message: "ws upgrade accepted",
      hypothesisId: "H3",
      data: { reqPath: url.pathname },
    });
    // #endregion

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  });

  wss.on("connection", (ws) => {
    new TwilioMediaStreamHandler(ws);
  });
}

/**
 * Starts a dedicated Twilio Media Streams WebSocket server (run from `npm run worker`).
 */
export function startTwilioMediaStreamServer(): http.Server {
  const port = getVoiceMediaStreamPort();
  const path = getVoiceMediaStreamPath();

  const server = httpLib.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("Twilio media stream worker");
  });

  attachTwilioMediaStreamUpgrade(server);

  server.listen(port, () => {
    console.info(
      `[media-stream] WebSocket listening on port ${port} path ${path}`,
    );
  });

  return server;
}

export function isMediaStreamProxiedViaApp(): boolean {
  return process.env.VOICE_MEDIA_STREAM_PROXY_VIA_APP === "1";
}

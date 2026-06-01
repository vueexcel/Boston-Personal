/**
 * Optional unified HTTP + Twilio Media Stream WSS on one port (3000).
 *
 * Run via `npm run dev:unified` (NOT the default `npm run dev`).
 *
 * Warning: Next.js 14 App Router + custom dev server + tsx often breaks pages
 * (AsyncLocalStorage) and HMR. Prefer `npm run dev` + `npm run worker` locally.
 *
 * Production: use after `next build` with NODE_ENV=production, or attach
 * attachTwilioMediaStreamUpgrade to your load balancer target.
 */
import { createServer } from "http";
import { parse } from "url";
import next from "next";
import {
  attachTwilioMediaStreamUpgrade,
  isMediaStreamProxiedViaApp,
} from "@/lib/voice/twilio-media-stream-server";
import { getVoiceMediaStreamPath } from "@/lib/env/server";

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME ?? "localhost";
const port = Number.parseInt(process.env.PORT ?? "3000", 10);

if (dev) {
  console.warn(
    "[bostel-voice] dev:unified is experimental — use `npm run dev` if you see AsyncLocalStorage errors",
  );
}

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

void app.prepare().then(() => {
  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url ?? "/", true);
    void handle(req, res, parsedUrl).catch((err: unknown) => {
      console.error("[server.dev] request error", req.url, err);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.end("Internal Server Error");
      }
    });
  });

  if (isMediaStreamProxiedViaApp()) {
    attachTwilioMediaStreamUpgrade(server);
    console.info(
      `[bostel-voice] Media Stream WSS on http://${hostname}:${port}${getVoiceMediaStreamPath()}`,
    );
  }

  server.listen(port, () => {
    console.info(`> Next.js ready on http://${hostname}:${port}`);
  });
});

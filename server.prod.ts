/**
 * Production entry: Next standalone (internal port) + optional public front server
 * with Twilio Media Stream WSS on PORT (single ngrok tunnel).
 *
 * Do NOT use `next({ dev })` here — it breaks App Router (AsyncLocalStorage).
 *
 *   npm run build && npm run start:prod
 */
import { spawn, type ChildProcess } from "child_process";
import http from "http";
import path from "path";
import {
  attachTwilioMediaStreamUpgrade,
  isMediaStreamProxiedViaApp,
} from "@/lib/voice/twilio-media-stream-server";
import { getVoiceMediaStreamPath } from "@/lib/env/server";
import { getTtsConfigForProfile } from "@/lib/voice/tts-config";

const hostname = process.env.HOSTNAME ?? "0.0.0.0";
const publicPort = Number.parseInt(process.env.PORT ?? "3000", 10);
const internalPort = Number.parseInt(
  process.env.NEXT_INTERNAL_PORT ?? "3002",
  10,
);
const standaloneDir = path.join(process.cwd(), ".next", "standalone");
const proxyMode = isMediaStreamProxiedViaApp();

function firstHeader(
  value: string | string[] | undefined,
): string | undefined {
  if (value === undefined) return undefined;
  return Array.isArray(value) ? value[0] : value;
}

/** Preserve public host/proto for Next (middleware redirects) when proxying internally. */
function buildProxyHeaders(
  req: http.IncomingMessage,
): http.OutgoingHttpHeaders {
  const publicHost =
    firstHeader(req.headers["x-forwarded-host"]) ??
    firstHeader(req.headers.host);
  const publicProto =
    firstHeader(req.headers["x-forwarded-proto"]) ??
    ((req.socket as { encrypted?: boolean }).encrypted ? "https" : "http");

  const headers: http.OutgoingHttpHeaders = {
    ...req.headers,
    host: `127.0.0.1:${internalPort}`,
  };

  if (publicHost && !publicHost.startsWith("127.0.0.1")) {
    headers["x-forwarded-host"] = publicHost;
  }
  if (publicProto) {
    headers["x-forwarded-proto"] = publicProto;
  }
  const forwardedFor = firstHeader(req.headers["x-forwarded-for"]);
  if (forwardedFor) {
    headers["x-forwarded-for"] = forwardedFor;
  } else if (req.socket.remoteAddress) {
    headers["x-forwarded-for"] = req.socket.remoteAddress;
  }

  return headers;
}

function spawnStandalone(port: number, bindHost: string): ChildProcess {
  return spawn("node", ["server.js"], {
    cwd: standaloneDir,
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: String(port),
      HOSTNAME: bindHost,
    },
    stdio: "inherit",
  });
}

function proxyToNext(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): void {
  const targetUrl = new URL(
    req.url ?? "/",
    `http://127.0.0.1:${internalPort}`,
  );

  const headers = buildProxyHeaders(req);

  const proxyReq = http.request(
    {
      hostname: "127.0.0.1",
      port: internalPort,
      path: targetUrl.pathname + targetUrl.search,
      method: req.method,
      headers,
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
      proxyRes.pipe(res);
    },
  );

  proxyReq.on("error", (err) => {
    console.error("[server.prod] proxy error", req.url, err.message);
    if (!res.headersSent) {
      res.statusCode = 502;
      res.end("Bad Gateway");
    }
  });

  req.pipe(proxyReq);
}

async function waitForNextReady(maxMs = 60_000): Promise<void> {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    try {
      const ok = await new Promise<boolean>((resolve) => {
        const req = http.get(
          `http://127.0.0.1:${internalPort}/api/health`,
          (res) => {
            res.resume();
            resolve(res.statusCode === 200 || res.statusCode === 503);
          },
        );
        req.on("error", () => resolve(false));
        req.setTimeout(2000, () => {
          req.destroy();
          resolve(false);
        });
      });
      if (ok) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(
    `Next standalone did not become ready on port ${internalPort} within ${maxMs}ms`,
  );
}

async function main(): Promise<void> {
  const standaloneServer = path.join(standaloneDir, "server.js");
  const fs = await import("fs");
  if (!fs.existsSync(standaloneServer)) {
    console.error(
      "[server.prod] Missing .next/standalone/server.js — run `npm run build` first.",
    );
    process.exit(1);
  }

  if (!proxyMode) {
    console.info(
      `[server.prod] VOICE_MEDIA_STREAM_PROXY_VIA_APP=0 — starting standalone on port ${publicPort}`,
    );
    const child = spawnStandalone(publicPort, hostname);
    child.on("exit", (code) => process.exit(code ?? 0));
    return;
  }

  console.info(
    `[server.prod] Starting Next standalone on 127.0.0.1:${internalPort} (internal)`,
  );
  const child = spawnStandalone(internalPort, "127.0.0.1");

  child.on("exit", (code) => {
    console.error("[server.prod] standalone exited", code);
    process.exit(code ?? 1);
  });

  await waitForNextReady();

  const server = http.createServer(proxyToNext);
  attachTwilioMediaStreamUpgrade(server);

  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      console.error(
        `[server.prod] Port ${publicPort} is already in use. Stop the other process (e.g. old start:prod / next dev) and retry.`,
      );
    } else {
      console.error("[server.prod] front server error", err);
    }
    child.kill("SIGTERM");
    process.exit(1);
  });

  server.listen(publicPort, hostname, () => {
    console.info("[bostel-voice] TTS config", {
      telephony: getTtsConfigForProfile("telephony"),
      browserTest: getTtsConfigForProfile("browser_test"),
    });
    console.info(
      `[bostel-voice] Media Stream WSS on http://${hostname}:${publicPort}${getVoiceMediaStreamPath()}`,
    );
    console.info(
      `> Production server ready on http://${hostname}:${publicPort} (Next proxied from :${internalPort})`,
    );
  });

  const shutdown = (): void => {
    server.close();
    child.kill("SIGTERM");
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

void main().catch((err) => {
  console.error("[server.prod] fatal", err);
  process.exit(1);
});

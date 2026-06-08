"use client";

import * as React from "react";
import { CommitStrategy, useScribe } from "@elevenlabs/react";
import { Loader2, Mic, PhoneOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ApiClientError } from "@/lib/api/http";
import { postAgentTestScribeToken } from "@/lib/api/agent-test";
import type { ScribeClientConnectConfig } from "@/lib/voice/scribe-client-config";
import {
  appendAgentEchoContext,
  isLikelyAgentEcho,
} from "@/lib/voice/echo-filter";
import {
  base64ToMulaw,
  decodeMulawBytes,
  pcm16ToFloat32,
} from "@/lib/voice/mulaw-audio-browser";

const BROWSER_BARGE_MIN_CHARS = 8;
const BARGE_SIGNAL_COOLDOWN_MS = 350;
const PLAYBACK_END_TAIL_MS = 250;

function errorMessage(e: unknown): string {
  if (e instanceof ApiClientError) return e.message;
  if (e instanceof Error) return e.message;
  return "Something went wrong";
}

export type ProductionVoiceCallProps = {
  tenantId: string;
  agentId: string;
  wsUrl: string;
  sessionId: string;
  sessionToken: string;
  sttClientConfig: ScribeClientConnectConfig;
  onEnded?: () => void;
};

type TranscriptLine = {
  id: string;
  role: "user" | "assistant";
  text: string;
};

export function ProductionVoiceCall({
  tenantId,
  agentId,
  wsUrl,
  sessionId,
  sessionToken,
  sttClientConfig,
  onEnded,
}: ProductionVoiceCallProps) {
  const [status, setStatus] = React.useState<string>("disconnected");
  const [error, setError] = React.useState<string | null>(null);
  const [active, setActive] = React.useState(false);
  const [connecting, setConnecting] = React.useState(false);
  const [transcript, setTranscript] = React.useState<TranscriptLine[]>([]);

  const wsRef = React.useRef<WebSocket | null>(null);
  const audioContextRef = React.useRef<AudioContext | null>(null);
  const playbackTimeRef = React.useRef(0);
  const scheduledSourcesRef = React.useRef<AudioBufferSourceNode[]>([]);
  const streamSidRef = React.useRef(`test-${sessionId.slice(0, 8)}`);
  const scribeDisconnectRef = React.useRef<(() => void) | null>(null);

  const agentPlaybackActiveRef = React.useRef(false);
  const agentEchoContextRef = React.useRef("");
  const lastBargeSignalAtRef = React.useRef(0);
  const playbackEndTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const sendBargeInSignal = React.useCallback(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const now = Date.now();
    if (now - lastBargeSignalAtRef.current < BARGE_SIGNAL_COOLDOWN_MS) return;
    lastBargeSignalAtRef.current = now;
    ws.send(
      JSON.stringify({
        event: "barge_in",
        streamSid: streamSidRef.current,
      }),
    );
  }, []);

  const sendCallerSpeech = React.useCallback(
    (text: string, final: boolean, bargeIn = false) => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      const trimmed = text.trim();
      if (!trimmed) return;
      ws.send(
        JSON.stringify({
          event: "caller_speech",
          streamSid: streamSidRef.current,
          speech: { text: trimmed, final, bargeIn },
        }),
      );
    },
    [],
  );

  const markAgentPlaybackActive = React.useCallback(() => {
    agentPlaybackActiveRef.current = true;
    if (playbackEndTimerRef.current) {
      clearTimeout(playbackEndTimerRef.current);
      playbackEndTimerRef.current = null;
    }
  }, []);

  const schedulePlaybackEnded = React.useCallback(() => {
    if (playbackEndTimerRef.current) {
      clearTimeout(playbackEndTimerRef.current);
    }
    playbackEndTimerRef.current = setTimeout(() => {
      playbackEndTimerRef.current = null;
      if (scheduledSourcesRef.current.length === 0) {
        agentPlaybackActiveRef.current = false;
      }
    }, PLAYBACK_END_TAIL_MS);
  }, []);

  const tryBargeInFromStt = React.useCallback(
    (text: string, final: boolean) => {
      if (!agentPlaybackActiveRef.current) {
        if (final) {
          sendCallerSpeech(text, true, false);
        }
        return;
      }

      const echoCtx = agentEchoContextRef.current;
      if (echoCtx && isLikelyAgentEcho(text, echoCtx)) {
        return;
      }

      const minChars = final ? BROWSER_BARGE_MIN_CHARS : BROWSER_BARGE_MIN_CHARS;
      if (text.trim().length < minChars) return;

      sendBargeInSignal();
      stopPlaybackRef.current?.();
      agentPlaybackActiveRef.current = false;
      sendCallerSpeech(text, final, true);
    },
    [sendBargeInSignal, sendCallerSpeech],
  );

  const stopPlaybackRef = React.useRef<(() => void) | null>(null);

  const scribe = useScribe({
    modelId: sttClientConfig.modelId,
    languageCode: sttClientConfig.languageCode,
    commitStrategy: CommitStrategy.VAD,
    vadSilenceThresholdSecs: sttClientConfig.vadSilenceThresholdSecs,
    vadThreshold: sttClientConfig.vadThreshold,
    minSpeechDurationMs: sttClientConfig.minSpeechDurationMs,
    minSilenceDurationMs: sttClientConfig.minSilenceDurationMs,
    onPartialTranscript: (data) => {
      tryBargeInFromStt(data.text, false);
    },
    onCommittedTranscript: (data) => {
      tryBargeInFromStt(data.text, true);
    },
    onError: (err) => {
      const message =
        err instanceof Error ? err.message : "Scribe connection error";
      setError(message);
      setStatus("error");
    },
  });

  scribeDisconnectRef.current = scribe.disconnect;

  const stopPlayback = React.useCallback(() => {
    for (const source of scheduledSourcesRef.current) {
      try {
        source.stop();
      } catch {
        // ignore
      }
    }
    scheduledSourcesRef.current = [];
    if (audioContextRef.current) {
      playbackTimeRef.current = audioContextRef.current.currentTime;
    }
    schedulePlaybackEnded();
  }, [schedulePlaybackEnded]);

  stopPlaybackRef.current = stopPlayback;

  const scheduleMulawPlayback = React.useCallback(
    (base64Payload: string) => {
      const ctx = audioContextRef.current;
      if (!ctx) return;

      markAgentPlaybackActive();

      const mulaw = base64ToMulaw(base64Payload);
      const pcm = decodeMulawBytes(mulaw);
      const floats = pcm16ToFloat32(pcm);

      const buffer = ctx.createBuffer(1, floats.length, 8000);
      buffer.copyToChannel(new Float32Array(floats), 0);

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);

      const startAt = Math.max(ctx.currentTime, playbackTimeRef.current);
      source.start(startAt);
      playbackTimeRef.current = startAt + buffer.duration;
      scheduledSourcesRef.current.push(source);
      source.onended = () => {
        scheduledSourcesRef.current = scheduledSourcesRef.current.filter(
          (s) => s !== source,
        );
        if (scheduledSourcesRef.current.length === 0) {
          schedulePlaybackEnded();
        }
      };
    },
    [markAgentPlaybackActive, schedulePlaybackEnded],
  );

  const teardown = React.useCallback(() => {
    if (playbackEndTimerRef.current) {
      clearTimeout(playbackEndTimerRef.current);
      playbackEndTimerRef.current = null;
    }
    agentPlaybackActiveRef.current = false;
    agentEchoContextRef.current = "";
    scribeDisconnectRef.current?.();
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({ event: "stop", streamSid: streamSidRef.current }),
      );
      wsRef.current.close();
    }
    wsRef.current = null;
    stopPlayback();
    void audioContextRef.current?.close();
    audioContextRef.current = null;
    setActive(false);
    setStatus("disconnected");
    onEnded?.();
  }, [onEnded, stopPlayback]);

  const startCall = async () => {
    if (connecting || active) return;
    setError(null);
    setConnecting(true);
    setTranscript([]);

    try {
      const ctx = new AudioContext();
      audioContextRef.current = ctx;
      playbackTimeRef.current = ctx.currentTime;

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      await new Promise<void>((resolve, reject) => {
        ws.onopen = () => resolve();
        ws.onerror = () =>
          reject(
            new Error(
              "WebSocket connection failed. Ensure the voice worker is running (`npm run worker`).",
            ),
          );
      });

      setStatus("connected");
      ws.send(JSON.stringify({ event: "connected" }));
      ws.send(
        JSON.stringify({
          event: "start",
          start: {
            callSid: sessionId,
            streamSid: streamSidRef.current,
          },
        }),
      );

      ws.onmessage = (event) => {
        let msg: {
          event?: string;
          media?: { payload?: string };
          speak?: { text?: string };
          transcript?: { role: "user" | "assistant"; text: string };
        };
        try {
          msg = JSON.parse(event.data as string) as typeof msg;
        } catch {
          return;
        }

        if (msg.event === "speak_start" && msg.speak?.text) {
          agentEchoContextRef.current = appendAgentEchoContext(
            agentEchoContextRef.current,
            msg.speak.text,
          );
        } else if (msg.event === "media" && msg.media?.payload) {
          scheduleMulawPlayback(msg.media.payload);
        } else if (msg.event === "clear") {
          stopPlayback();
          agentPlaybackActiveRef.current = false;
        } else if (msg.event === "transcript" && msg.transcript?.text) {
          const { role, text } = msg.transcript;
          if (role === "assistant") {
            agentEchoContextRef.current = appendAgentEchoContext(
              agentEchoContextRef.current,
              text,
            );
          }
          setTranscript((prev) => [
            ...prev,
            { id: `${role}-${Date.now()}-${prev.length}`, role, text },
          ]);
        }
      };

      ws.onclose = () => {
        teardown();
      };

      const { token } = await postAgentTestScribeToken(tenantId, agentId, {
        sessionId,
        sessionToken,
      });

      await scribe.connect({
        token,
        microphone: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      setActive(true);
      setStatus("listening");
    } catch (e) {
      const message = errorMessage(e);
      if (
        message.toLowerCase().includes("permission") ||
        message.toLowerCase().includes("notallowed")
      ) {
        setError(
          "Microphone access was denied. Allow microphone permission and try again.",
        );
      } else if (message.includes("not configured")) {
        setError(
          "ElevenLabs is not configured on the server. Set ELEVENLABS_API_KEY and try again.",
        );
      } else {
        setError(message);
      }
      setStatus("error");
      teardown();
    } finally {
      setConnecting(false);
    }
  };

  const endCall = () => {
    teardown();
  };

  React.useEffect(() => {
    return () => {
      teardown();
    };
  }, [teardown]);

  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50/80 p-4 space-y-3">
      <p className="text-xs text-slate-500">
        Connection: <span className="font-medium text-slate-700">{status}</span>
        {scribe.isConnected ? (
          <>
            {" "}
            · Scribe:{" "}
            <span className="font-medium text-slate-700">connected</span>
          </>
        ) : null}
      </p>
      <div className="flex flex-wrap gap-2">
        {!active ? (
          <Button
            type="button"
            className="bg-slate-900 hover:bg-slate-800"
            disabled={connecting}
            onClick={() => void startCall()}
          >
            {connecting ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Mic className="mr-1.5 h-4 w-4" />
            )}
            {connecting ? "Connecting…" : "Start voice test"}
          </Button>
        ) : (
          <Button type="button" variant="destructive" onClick={endCall}>
            <PhoneOff className="mr-1.5 h-4 w-4" />
            End call
          </Button>
        )}
      </div>
      {error ? (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}
      {scribe.partialTranscript ? (
        <p className="text-xs text-indigo-600 italic">
          Listening: {scribe.partialTranscript}
        </p>
      ) : null}
      {transcript.length > 0 ? (
        <div className="max-h-40 overflow-y-auto space-y-1 rounded border border-slate-200 bg-white p-2">
          {transcript.map((line) => (
            <p
              key={line.id}
              className={
                line.role === "user"
                  ? "text-xs text-indigo-700"
                  : "text-xs text-slate-700"
              }
            >
              <span className="font-medium">
                {line.role === "user" ? "You" : "Agent"}:
              </span>{" "}
              {line.text}
            </p>
          ))}
        </div>
      ) : null}
      <p className="text-xs text-slate-500">
        Speak over the agent anytime to interrupt. Echo from your speakers is
        filtered; headphones give the best results.
      </p>
    </div>
  );
}

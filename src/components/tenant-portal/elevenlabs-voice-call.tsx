"use client";

import * as React from "react";
import { useConversation } from "@elevenlabs/react";
import { Loader2, Mic, PhoneOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ApiClientError } from "@/lib/api/http";

function errorMessage(e: unknown): string {
  if (e instanceof ApiClientError) return e.message;
  if (e instanceof Error) return e.message;
  return "Something went wrong";
}

export type ElevenLabsVoiceCallProps = {
  /** Fetches a fresh signed WebSocket URL immediately before connecting. */
  fetchSignedUrl: () => Promise<string>;
};

export function ElevenLabsVoiceCall({
  fetchSignedUrl,
}: ElevenLabsVoiceCallProps) {
  const [status, setStatus] = React.useState<string>("disconnected");
  const [error, setError] = React.useState<string | null>(null);
  const [active, setActive] = React.useState(false);
  const [connecting, setConnecting] = React.useState(false);

  const conversation = useConversation({
    onConnect: () => {
      setStatus("connected");
      setActive(true);
      setError(null);
    },
    onDisconnect: () => {
      setStatus("disconnected");
      setActive(false);
    },
    onError: (message) => {
      setError(
        typeof message === "string" ? message : errorMessage(message),
      );
      setStatus("error");
    },
    onStatusChange: (s) => setStatus(s.status),
  });

  const startCall = async () => {
    if (connecting || active) return;
    setError(null);
    setConnecting(true);
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      const signedUrl = await fetchSignedUrl();
      await conversation.startSession({
        signedUrl,
        connectionType: "websocket",
      });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setConnecting(false);
    }
  };

  const endCall = async () => {
    try {
      await conversation.endSession();
    } catch {
      // ignore
    }
  };

  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50/80 p-4 space-y-3">
      <p className="text-xs text-slate-500">
        Connection: <span className="font-medium text-slate-700">{status}</span>
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
            {connecting ? "Connecting…" : "Start voice call"}
          </Button>
        ) : (
          <Button
            type="button"
            variant="destructive"
            onClick={() => void endCall()}
          >
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
      <p className="text-xs text-slate-500">
        Speak naturally after starting. The agent uses your synced prompt and
        voice settings.
      </p>
    </div>
  );
}

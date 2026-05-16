"use client";

import * as React from "react";
import { useConversation } from "@elevenlabs/react";
import { Mic, PhoneOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ApiClientError } from "@/lib/api/http";

function errorMessage(e: unknown): string {
  if (e instanceof ApiClientError) return e.message;
  if (e instanceof Error) return e.message;
  return "Something went wrong";
}

export function ElevenLabsVoiceCall({ signedUrl }: { signedUrl: string }) {
  const [status, setStatus] = React.useState<string>("disconnected");
  const [error, setError] = React.useState<string | null>(null);
  const [active, setActive] = React.useState(false);

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
    setError(null);
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      await conversation.startSession({
        signedUrl,
        connectionType: "websocket",
      });
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const endCall = async () => {
    try {
      await conversation.endSession();
    } catch {
      // ignore
    }
  };

  React.useEffect(() => {
    return () => {
      void conversation.endSession();
    };
  }, [conversation]);

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
            onClick={() => void startCall()}
          >
            <Mic className="mr-1.5 h-4 w-4" />
            Start voice call
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

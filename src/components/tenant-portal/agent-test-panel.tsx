"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { Loader2, MessageSquare, Mic } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ApiClientError } from "@/lib/api/http";
import {
  useAgentTestChat,
  useAgentTestVoiceSession,
} from "@/hooks/use-agent-test";
import type { ScribeClientConnectConfig } from "@/lib/voice/scribe-client-config";
import type { AgentTestDraft } from "@/lib/validation/agent-test";
import { cn } from "@/lib/utils";

const ProductionVoiceCall = dynamic(
  () =>
    import("@/components/tenant-portal/production-voice-call").then(
      (m) => m.ProductionVoiceCall,
    ),
  {
    ssr: false,
    loading: () => <p className="text-sm text-slate-500">Loading voice…</p>,
  },
);

export type AgentTestPanelProps = {
  tenantId: string;
  agentId: string;
  isDirty: boolean;
  draft: AgentTestDraft | null;
  savedGreeting: string | null;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

type TestMode = "text" | "voice";

function errorMessage(e: unknown): string {
  if (e instanceof ApiClientError) return e.message;
  if (e instanceof Error) return e.message;
  return "Something went wrong";
}

export function AgentTestPanel({
  tenantId,
  agentId,
  isDirty,
  draft,
  savedGreeting,
}: AgentTestPanelProps) {
  const [mode, setMode] = React.useState<TestMode>("text");
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [input, setInput] = React.useState("");
  const [chatError, setChatError] = React.useState<string | null>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  const chatMutation = useAgentTestChat(tenantId, agentId);
  const voiceSessionMutation = useAgentTestVoiceSession(tenantId, agentId);

  const [voiceError, setVoiceError] = React.useState<string | null>(null);
  const [voiceWarning, setVoiceWarning] = React.useState<string | null>(null);
  const [voiceSession, setVoiceSession] = React.useState<{
    sessionId: string;
    sessionToken: string;
    wsUrl: string;
    sttClientConfig: ScribeClientConnectConfig;
  } | null>(null);

  const draftPayload = isDirty && draft ? draft : undefined;

  React.useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  const sendChat = async () => {
    const trimmed = input.trim();
    if (!trimmed || chatMutation.isPending) return;

    setChatError(null);
    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      content: trimmed,
    };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput("");

    try {
      const result = await chatMutation.mutateAsync({
        messages: nextMessages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        draft: draftPayload,
      });
      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: "assistant",
          content: result.reply,
        },
      ]);
    } catch (e) {
      setChatError(errorMessage(e));
      setMessages((prev) => prev.slice(0, -1));
      setInput(trimmed);
    }
  };

  const startTextWithGreeting = async () => {
    if (messages.length > 0) return;
    setChatError(null);
    try {
      const result = await chatMutation.mutateAsync({
        messages: [],
        draft: draftPayload,
      });
      if (result.reply) {
        setMessages([
          {
            id: `g-${Date.now()}`,
            role: "assistant",
            content: result.reply,
          },
        ]);
      }
    } catch (e) {
      setChatError(errorMessage(e));
    }
  };

  const clearChat = () => {
    setMessages([]);
    setInput("");
    setChatError(null);
  };

  const startVoiceTest = async () => {
    setVoiceError(null);
    setVoiceWarning(null);
    setVoiceSession(null);
    try {
      const result = await voiceSessionMutation.mutateAsync({
        draft: draftPayload,
      });
      if (result.voiceWarning) {
        setVoiceWarning(result.voiceWarning);
      }
      if (!result.resolvedVoiceId) {
        setVoiceWarning(
          (prev) =>
            prev ??
            "No ElevenLabs voice is configured for this agent. Pick a voice on the Voice tab, save, and try again.",
        );
      }
      setVoiceSession({
        sessionId: result.sessionId,
        sessionToken: result.token,
        wsUrl: result.wsUrl,
        sttClientConfig: result.sttClientConfig,
      });
    } catch (e) {
      setVoiceError(errorMessage(e));
    }
  };

  const endVoiceTest = () => {
    setVoiceSession(null);
  };

  return (
    <div className="space-y-4">
      {isDirty ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          Testing uses your <strong>current editor values</strong> (unsaved).
          Save changes when you are happy with test results.
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant={mode === "text" ? "default" : "outline"}
          className={mode === "text" ? "bg-indigo-600 hover:bg-indigo-700" : ""}
          onClick={() => setMode("text")}
        >
          <MessageSquare className="mr-1.5 h-3.5 w-3.5" />
          Text chat
        </Button>
        <Button
          type="button"
          size="sm"
          variant={mode === "voice" ? "default" : "outline"}
          className={
            mode === "voice" ? "bg-indigo-600 hover:bg-indigo-700" : ""
          }
          onClick={() => setMode("voice")}
        >
          <Mic className="mr-1.5 h-3.5 w-3.5" />
          Voice
        </Button>
      </div>

      {mode === "text" ? (
        <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-medium text-slate-900">
              Text conversation
            </p>
            <div className="flex gap-2">
              {messages.length === 0 ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={chatMutation.isPending}
                  onClick={() => void startTextWithGreeting()}
                >
                  {chatMutation.isPending ? (
                    <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                  ) : null}
                  Play greeting
                </Button>
              ) : null}
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={clearChat}
                disabled={chatMutation.isPending}
              >
                Clear
              </Button>
            </div>
          </div>

          <div
            ref={scrollRef}
            className="min-h-[280px] max-h-[420px] overflow-y-auto px-4 py-4 space-y-3"
          >
            {messages.length === 0 ? (
              <p className="text-sm text-slate-500">
                Send a message to test how this agent responds.{" "}
                {savedGreeting
                  ? "Or play the configured greeting first."
                  : "No greeting is configured yet."}{" "}
                Replies use the same short phone-call style as live calls.
              </p>
            ) : null}
            {messages.map((m) => (
              <div
                key={m.id}
                className={cn(
                  "flex",
                  m.role === "user" ? "justify-end" : "justify-start",
                )}
              >
                <div
                  className={cn(
                    "max-w-[85%] rounded-2xl px-3 py-2 text-sm",
                    m.role === "user"
                      ? "bg-indigo-600 text-white"
                      : "bg-slate-100 text-slate-900",
                  )}
                >
                  {m.content}
                </div>
              </div>
            ))}
            {chatMutation.isPending ? (
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Agent is thinking…
              </div>
            ) : null}
          </div>

          {chatError ? (
            <p className="px-4 pb-2 text-sm text-red-600" role="alert">
              {chatError}
            </p>
          ) : null}

          <div className="border-t border-slate-100 p-4">
            <div className="flex gap-2">
              <Textarea
                className="min-h-[44px] resize-none border-slate-200"
                placeholder="Type as a caller would…"
                value={input}
                rows={2}
                disabled={chatMutation.isPending}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void sendChat();
                  }
                }}
              />
              <Button
                type="button"
                className="shrink-0 self-end bg-slate-900 hover:bg-slate-800"
                disabled={chatMutation.isPending || !input.trim()}
                onClick={() => void sendChat()}
              >
                Send
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm space-y-4">
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              Voice test
            </h3>
          </div>

          {voiceSession ? (
            <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
              Session ready
            </Badge>
          ) : null}

          {!voiceSession ? (
            <Button
              type="button"
              className="bg-indigo-600 hover:bg-indigo-700"
              disabled={voiceSessionMutation.isPending}
              onClick={() => void startVoiceTest()}
            >
              {voiceSessionMutation.isPending ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Mic className="mr-1.5 h-4 w-4" />
              )}
              {voiceSessionMutation.isPending
                ? "Preparing…"
                : "Prepare voice test"}
            </Button>
          ) : (
            <Button type="button" variant="outline" onClick={endVoiceTest}>
              Reset session
            </Button>
          )}

          {voiceWarning ? (
            <p className="text-sm text-amber-800" role="status">
              {voiceWarning}
            </p>
          ) : null}

          {voiceError ? (
            <p className="text-sm text-red-600" role="alert">
              {voiceError}
            </p>
          ) : null}

          {voiceSession ? (
            <ProductionVoiceCall
              tenantId={tenantId}
              agentId={agentId}
              wsUrl={voiceSession.wsUrl}
              sessionId={voiceSession.sessionId}
              sessionToken={voiceSession.sessionToken}
              sttClientConfig={voiceSession.sttClientConfig}
              onEnded={endVoiceTest}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}

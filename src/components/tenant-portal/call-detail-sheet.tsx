"use client";

import * as React from "react";
import { Bot, Loader2, User, Volume2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { callRecordingUrl } from "@/lib/api/calls";
import { getMetadataString } from "@/lib/services/call-metadata";
import { useCall } from "@/hooks/use-calls";
import { twilioStatusBadgeVariant } from "@/lib/utils/twilio-call-display";
import { cn } from "@/lib/utils";
import { formatPhoneNumberDisplay } from "@/lib/utils/phone-format";

type CallDetailSheetProps = {
  tenantId: string;
  callId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function formatDuration(sec: number | null): string {
  if (sec == null || sec <= 0) return "—";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

function sentimentLabel(
  sentiment: string | null,
): { label: string; variant: "success" | "secondary" | "warning" } {
  switch (sentiment) {
    case "positive":
      return { label: "Positive", variant: "success" };
    case "negative":
      return { label: "Needs attention", variant: "warning" };
    case "mixed":
      return { label: "Mixed", variant: "secondary" };
    default:
      return { label: "Neutral", variant: "secondary" };
  }
}

export function CallDetailSheet({
  tenantId,
  callId,
  open,
  onOpenChange,
}: CallDetailSheetProps) {
  const { data: call, isPending, error } = useCall(tenantId, open ? callId : null);
  const recordingSrc =
    call && callId ? callRecordingUrl(tenantId, callId) : undefined;
  const meta =
    call?.metadata && typeof call.metadata === "object"
      ? (call.metadata as Record<string, unknown>)
      : null;
  const hasRecording = Boolean(
    call?.recordingUrl || getMetadataString(meta, "recordingSid"),
  );

  const sentiment = sentimentLabel(call?.sentiment ?? null);
  const twilio = call?.twilio;
  const twilioDisplay = call?.twilioDisplay;
  const durationSec =
    call?.duration ?? twilio?.durationSeconds ?? null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>Call details</SheetTitle>
          <SheetDescription>
            {call
              ? `${call.agentName ?? "Unassigned agent"} · ${formatDateTime(call.startedAt)}`
              : "Loading call details…"}
          </SheetDescription>
        </SheetHeader>

        {isPending && (
          <div className="flex items-center justify-center py-12 text-slate-500">
            <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
          </div>
        )}

        {error && (
          <p className="text-sm text-rose-600">
            {error instanceof Error ? error.message : "Failed to load call"}
          </p>
        )}

        {call && (
          <div className="mt-6 space-y-6 pb-8">
            <div className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50/80 p-4 text-sm">
              <div className="flex justify-between gap-4">
                <span className="text-slate-500">From</span>
                <span className="font-medium text-slate-800">
                  {formatPhoneNumberDisplay(call.callerNumber)}
                </span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-slate-500">To</span>
                <span className="font-medium text-slate-800">
                  {formatPhoneNumberDisplay(call.dialedNumber)}
                </span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-slate-500">Duration</span>
                <span className="font-mono text-slate-700">
                  {formatDuration(durationSec)}
                </span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-slate-500">App status</span>
                <Badge variant="secondary">{call.dispositionLabel}</Badge>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-slate-500">Credits / cost</span>
                <span className="font-mono text-slate-700">
                  {twilioDisplay?.cost ?? call.credits}
                </span>
              </div>
            </div>

            {twilio && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                  Twilio call log
                </h3>
                <div className="grid gap-2 rounded-lg border border-indigo-100 bg-indigo-50/40 p-4 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-slate-500">Call status</span>
                    <Badge
                      variant={twilioStatusBadgeVariant(twilio.status)}
                    >
                      {twilioDisplay?.twilioStatus ?? twilio.status ?? "—"}
                    </Badge>
                  </div>
                  <DetailRow
                    label="Direction"
                    value={twilioDisplay?.direction}
                  />
                  <DetailRow
                    label="Answered by"
                    value={twilioDisplay?.answeredBy}
                  />
                  <DetailRow
                    label="Caller ID name"
                    value={twilio.callerName}
                  />
                  <DetailRow
                    label="Forwarded from"
                    value={twilio.forwardedFrom}
                  />
                  <DetailRow
                    label="Started (Twilio)"
                    value={formatDateTime(twilio.startTime)}
                  />
                  <DetailRow
                    label="Ended (Twilio)"
                    value={formatDateTime(twilio.endTime)}
                  />
                  <DetailRow
                    label="Queue wait"
                    value={twilioDisplay?.queueTime}
                  />
                  <DetailRow
                    label="Call SID"
                    value={twilio.sid}
                    mono
                  />
                  {twilio.parentCallSid ? (
                    <DetailRow
                      label="Parent call SID"
                      value={twilio.parentCallSid}
                      mono
                    />
                  ) : null}
                  {twilio.phoneNumberSid ? (
                    <DetailRow
                      label="Phone number SID"
                      value={twilio.phoneNumberSid}
                      mono
                    />
                  ) : null}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                AI summary
              </h3>
              <p className="rounded-lg border border-slate-200 bg-white p-4 text-sm leading-relaxed text-slate-700">
                {call.summary?.trim() ||
                  "Summary is being generated. Refresh in a moment."}
              </p>
            </div>

            {call.collectedInfo.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                  Information collected
                </h3>
                <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                        <th className="px-4 py-2">Field</th>
                        <th className="px-4 py-2">Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {call.collectedInfo.map((item) => (
                        <tr
                          key={item.field}
                          className="border-b border-slate-100 last:border-0"
                        >
                          <td className="px-4 py-2 font-medium text-slate-700">
                            {item.field}
                          </td>
                          <td className="px-4 py-2 text-slate-800">
                            {item.value?.trim() ? (
                              <span>
                                {item.value}
                                {item.status === "corrected" && (
                                  <Badge
                                    variant="secondary"
                                    className="ml-2 text-xs"
                                  >
                                    Corrected
                                  </Badge>
                                )}
                              </span>
                            ) : (
                              <span className="text-slate-400">
                                Not provided
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {call.extraInformation.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                  Extra information
                </h3>
                <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                        <th className="px-4 py-2">Detail</th>
                        <th className="px-4 py-2">Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {call.extraInformation.map((item) => (
                        <tr
                          key={item.label}
                          className="border-b border-slate-100 last:border-0"
                        >
                          <td className="px-4 py-2 font-medium text-slate-700">
                            {item.label}
                          </td>
                          <td className="px-4 py-2 text-slate-800">
                            {item.value}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                Sentiment
              </h3>
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <Badge variant={sentiment.variant}>{sentiment.label}</Badge>
                {call.actionItems.length > 0 && (
                  <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-700">
                    {call.actionItems.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                Recording
              </h3>
              {hasRecording && recordingSrc ? (
                <audio
                  controls
                  className="w-full"
                  src={recordingSrc}
                  preload="metadata"
                >
                  Your browser does not support audio playback.
                </audio>
              ) : (
                <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-600">
                  <Volume2 className="h-8 w-8 text-slate-400" aria-hidden />
                  No recording available for this call yet.
                </div>
              )}
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                Transcript
              </h3>
              {call.transcriptTurns.length === 0 ? (
                <p className="text-sm text-slate-600">No transcript captured.</p>
              ) : (
                <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
                  {call.transcriptTurns.map((turn, i) => (
                    <div
                      key={`${call.callId}-t-${i}`}
                      className={cn(
                        "flex gap-3 rounded-md p-3",
                        turn.role === "assistant"
                          ? "bg-indigo-50/80"
                          : "bg-slate-100/80",
                      )}
                    >
                      <span
                        className={cn(
                          "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white",
                          turn.role === "assistant"
                            ? "bg-indigo-600"
                            : "bg-slate-600",
                        )}
                      >
                        {turn.role === "assistant" ? (
                          <Bot className="h-4 w-4" aria-hidden />
                        ) : (
                          <User className="h-4 w-4" aria-hidden />
                        )}
                      </span>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          {turn.role === "assistant" ? "Agent" : "Caller"}
                        </p>
                        <p className="mt-1 text-sm leading-relaxed text-slate-800">
                          {turn.content}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function DetailRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
}) {
  const display = value?.trim() ? value : "—";
  return (
    <div className="flex justify-between gap-4">
      <span className="shrink-0 text-slate-500">{label}</span>
      <span
        className={cn(
          "text-right font-medium text-slate-800",
          mono && "font-mono text-xs",
        )}
      >
        {display}
      </span>
    </div>
  );
}

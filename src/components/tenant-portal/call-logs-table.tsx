"use client";

import * as React from "react";
import {
  Bot,
  ChevronDown,
  ChevronRight,
  User,
  Volume2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

type Disposition = "Completed" | "Transferred" | "Failed";

type TranscriptTurn = { role: "human" | "ai"; text: string };

type CallRow = {
  id: string;
  timestampUtc: string;
  callerId: string;
  dialedNumber: string;
  assignedAgent: string;
  durationSec: number;
  disposition: Disposition;
  summary: string;
  transcript: TranscriptTurn[];
  sentimentScore: number;
};

const MOCK_CALLS: CallRow[] = [
  {
    id: "call_1",
    timestampUtc: "2026-05-11T14:22:00Z",
    callerId: "+1 (617) 555-0198",
    dialedNumber: "+1 (857) 555-0142",
    assignedAgent: "Receptionist",
    durationSec: 186,
    disposition: "Completed",
    summary:
      "Caller asked for billing hours and payment extensions. Agent provided policy and offered email follow-up.",
    transcript: [
      {
        role: "ai",
        text: "Thank you for calling Bostel Voice AI. How can I help you today?",
      },
      {
        role: "human",
        text: "Hi — I need to know your billing hours and if I can get a short extension on my invoice.",
      },
      {
        role: "ai",
        text: "Our billing desk is open Monday through Friday, 9 AM to 5:30 PM Eastern. Extensions may be available for qualified accounts; I can note your request for a specialist.",
      },
      {
        role: "human",
        text: "That works. Please have someone email me the options.",
      },
    ],
    sentimentScore: 78,
  },
  {
    id: "call_2",
    timestampUtc: "2026-05-11T11:04:00Z",
    callerId: "+1 (212) 555-0131",
    dialedNumber: "+1 (857) 555-0142",
    assignedAgent: "Sales",
    durationSec: 92,
    disposition: "Transferred",
    summary:
      "Prospect requested enterprise pricing. Warm transfer to human AE per routing rule.",
    transcript: [
      { role: "ai", text: "You’ve reached Bostel sales routing. May I have your company name?" },
      { role: "human", text: "Northwind Traders — we need enterprise pricing and SSO." },
      { role: "ai", text: "I’ll connect you with an account executive now. Please hold." },
    ],
    sentimentScore: 62,
  },
  {
    id: "call_3",
    timestampUtc: "2026-05-10T22:18:00Z",
    callerId: "+1 (617) 555-0100",
    dialedNumber: "+1 (857) 555-0142",
    assignedAgent: "After Hours",
    durationSec: 12,
    disposition: "Failed",
    summary:
      "Caller disconnected during greeting; possible pocket dial or carrier drop.",
    transcript: [
      { role: "ai", text: "Thank you for calling —" },
      { role: "human", text: "(line dropped)" },
    ],
    sentimentScore: 44,
  },
];

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function dispositionVariant(
  d: Disposition,
): "success" | "secondary" | "warning" {
  if (d === "Completed") return "success";
  if (d === "Transferred") return "secondary";
  return "warning";
}

function sentimentLabel(score: number): string {
  if (score >= 70) return "Positive";
  if (score >= 50) return "Neutral";
  return "Needs attention";
}

function sentimentBarClass(score: number): string {
  if (score >= 70) return "bg-emerald-500";
  if (score >= 50) return "bg-amber-500";
  return "bg-rose-500";
}

/**
 * Call logs table with expandable call detail (transcript, summary, recording, sentiment).
 */
export function CallLogsTable() {
  const [expandedId, setExpandedId] = React.useState<string | null>(null);

  const toggle = (id: string) => {
    setExpandedId((cur) => (cur === id ? null : id));
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
          Call Logs & Analytics
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-600 sm:text-base">
          Review conversations, outcomes, and sentiment. Connect to your{" "}
          <code className="rounded bg-slate-100 px-1 text-xs">CALL_LOG</code> API for
          live data.
        </p>
      </div>

      <Card className="overflow-hidden border-slate-200/90 shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="border-slate-200 bg-slate-50/90 hover:bg-slate-50/90">
              <TableHead className="w-10" aria-hidden />
              <TableHead>Timestamp (UTC)</TableHead>
              <TableHead>Caller ID</TableHead>
              <TableHead>Dialed number</TableHead>
              <TableHead>Assigned agent</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Disposition</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {MOCK_CALLS.map((row) => {
              const open = expandedId === row.id;
              return (
                <React.Fragment key={row.id}>
                  <TableRow
                    role="button"
                    tabIndex={0}
                    data-state={open ? "selected" : undefined}
                    className="cursor-pointer"
                    onClick={() => toggle(row.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        toggle(row.id);
                      }
                    }}
                  >
                    <TableCell className="w-10 text-slate-500">
                      {open ? (
                        <ChevronDown className="h-4 w-4" aria-hidden />
                      ) : (
                        <ChevronRight className="h-4 w-4" aria-hidden />
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-slate-600 sm:text-sm">
                      {row.timestampUtc.replace("T", " ").replace("Z", " UTC")}
                    </TableCell>
                    <TableCell className="font-medium text-slate-800">
                      {row.callerId}
                    </TableCell>
                    <TableCell className="text-slate-700">
                      {row.dialedNumber}
                    </TableCell>
                    <TableCell>{row.assignedAgent}</TableCell>
                    <TableCell className="font-mono text-slate-600">
                      {formatDuration(row.durationSec)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={dispositionVariant(row.disposition)}>
                        {row.disposition}
                      </Badge>
                    </TableCell>
                  </TableRow>
                  {open && (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={7} className="p-0">
                        <div className="border-t border-slate-200 bg-slate-50/80 px-4 py-6 sm:px-6">
                          <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-2">
                            <div className="space-y-3">
                              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                                Transcript
                              </h3>
                              <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
                                {row.transcript.map((turn, i) => (
                                  <div
                                    key={`${row.id}-t-${i}`}
                                    className={cn(
                                      "flex gap-3 rounded-md p-3",
                                      turn.role === "ai"
                                        ? "bg-indigo-50/80"
                                        : "bg-slate-100/80",
                                    )}
                                  >
                                    <span
                                      className={cn(
                                        "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white",
                                        turn.role === "ai"
                                          ? "bg-indigo-600"
                                          : "bg-slate-600",
                                      )}
                                    >
                                      {turn.role === "ai" ? (
                                        <Bot className="h-4 w-4" aria-hidden />
                                      ) : (
                                        <User className="h-4 w-4" aria-hidden />
                                      )}
                                    </span>
                                    <div>
                                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                        {turn.role === "ai" ? "AI" : "Human"}
                                      </p>
                                      <p className="mt-1 text-sm leading-relaxed text-slate-800">
                                        {turn.text}
                                      </p>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                            <div className="space-y-6">
                              <div className="space-y-2">
                                <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                                  Call summary
                                </h3>
                                <p className="rounded-lg border border-slate-200 bg-white p-4 text-sm leading-relaxed text-slate-700">
                                  {row.summary}
                                </p>
                              </div>
                              <div className="space-y-2">
                                <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                                  Recording
                                </h3>
                                <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-slate-300 bg-white px-4 py-8 text-center">
                                  <Volume2 className="h-8 w-8 text-slate-400" aria-hidden />
                                  <p className="text-sm text-slate-600">
                                    Audio player placeholder — bind{" "}
                                    <code className="rounded bg-slate-100 px-1 text-xs">
                                      recordingUrl
                                    </code>{" "}
                                    when available.
                                  </p>
                                  <audio
                                    controls
                                    className="w-full max-w-md opacity-50"
                                    preload="none"
                                    aria-label="Call recording placeholder"
                                  />
                                </div>
                              </div>
                              <div className="space-y-2">
                                <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                                  Sentiment score
                                </h3>
                                <div className="rounded-lg border border-slate-200 bg-white p-4">
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-2xl font-bold tabular-nums text-slate-900">
                                      {row.sentimentScore}
                                    </span>
                                    <span className="text-sm font-medium text-slate-600">
                                      {sentimentLabel(row.sentimentScore)}
                                    </span>
                                  </div>
                                  <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                                    <div
                                      className={cn(
                                        "h-full rounded-full transition-all",
                                        sentimentBarClass(row.sentimentScore),
                                      )}
                                      style={{ width: `${row.sentimentScore}%` }}
                                    />
                                  </div>
                                  <p className="mt-2 text-xs text-slate-500">
                                    Model-assisted score (0–100). Tune thresholds in
                                    analytics pipelines.
                                  </p>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

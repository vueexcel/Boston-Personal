"use client";

import * as React from "react";
import {
  Calendar,
  Eye,
  Filter,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CallDetailSheet } from "@/components/tenant-portal/call-detail-sheet";
import { useAgents } from "@/hooks/use-agents";
import { useCalls, useInvalidateCalls } from "@/hooks/use-calls";
import type { CallLogListItem } from "@/lib/services/calls";
import { formatPhoneNumberDisplay } from "@/lib/utils/phone-format";
import { ApiClientError } from "@/lib/api/http";

const PAGE_SIZE = 25;

type DatePreset =
  | "all"
  | "today"
  | "yesterday"
  | "last7"
  | "last30"
  | "last90";

function dateRangeForPreset(preset: DatePreset): {
  from?: string;
  to?: string;
} {
  if (preset === "all") return {};
  const now = new Date();
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  const start = new Date(now);
  start.setHours(0, 0, 0, 0);

  if (preset === "yesterday") {
    start.setDate(start.getDate() - 1);
    end.setDate(end.getDate() - 1);
    end.setHours(23, 59, 59, 999);
  } else if (preset === "last7") {
    start.setDate(start.getDate() - 6);
  } else if (preset === "last30") {
    start.setDate(start.getDate() - 29);
  } else if (preset === "last90") {
    start.setDate(start.getDate() - 89);
  }

  return { from: start.toISOString(), to: end.toISOString() };
}

function formatDuration(sec: number | null): string {
  if (sec == null || sec <= 0) return "—";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

type CallHistoryClientProps = {
  tenantId: string;
};

export function CallHistoryClient({ tenantId }: CallHistoryClientProps) {
  const { data: agents = [] } = useAgents(tenantId);
  const invalidateCalls = useInvalidateCalls(tenantId);

  const [datePreset, setDatePreset] = React.useState<DatePreset>("all");
  const [agentFilter, setAgentFilter] = React.useState<string>("all");
  const [cursor, setCursor] = React.useState<string | undefined>();
  const [cursors, setCursors] = React.useState<string[]>([]);
  const [accumulated, setAccumulated] = React.useState<CallLogListItem[]>([]);

  const [detailCallId, setDetailCallId] = React.useState<string | null>(null);
  const [detailOpen, setDetailOpen] = React.useState(false);

  const range = dateRangeForPreset(datePreset);
  const listParams = {
    limit: PAGE_SIZE,
    cursor,
    agentId: agentFilter === "all" ? undefined : agentFilter,
    from: range.from,
    to: range.to,
  };

  const { data, isPending, isFetching, error, refetch } = useCalls(
    tenantId,
    listParams,
  );

  React.useEffect(() => {
    setCursor(undefined);
    setCursors([]);
    setAccumulated([]);
  }, [datePreset, agentFilter]);

  React.useEffect(() => {
    if (!data?.calls) return;
    if (!cursor) {
      setAccumulated(data.calls);
    } else {
      setAccumulated((prev) => {
        const ids = new Set(prev.map((c) => c.callId));
        const merged = [...prev];
        for (const c of data.calls) {
          if (!ids.has(c.callId)) merged.push(c);
        }
        return merged;
      });
    }
  }, [data, cursor]);

  const nextCursor = data?.nextCursor ?? null;
  const pageIndex = cursors.length;

  const openDetail = (callId: string) => {
    setDetailCallId(callId);
    setDetailOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
              Call History
            </h1>
            <Badge variant="secondary" className="text-xs">
              BETA
            </Badge>
          </div>
          <p className="mt-1 text-sm text-slate-600">
            Inbound calls with transcript, AI summary, and Twilio recordings.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            invalidateCalls();
            void refetch();
          }}
          disabled={isFetching}
        >
          <RefreshCw
            className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`}
            aria-hidden
          />
          Refresh
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={datePreset}
          onValueChange={(v) => setDatePreset(v as DatePreset)}
        >
          <SelectTrigger className="w-[180px]">
            <Calendar className="mr-2 h-4 w-4 text-slate-500" aria-hidden />
            <SelectValue placeholder="Select dates" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All time</SelectItem>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="yesterday">Yesterday</SelectItem>
            <SelectItem value="last7">Last 7 days</SelectItem>
            <SelectItem value="last30">Last 30 days</SelectItem>
            <SelectItem value="last90">Last 90 days</SelectItem>
          </SelectContent>
        </Select>

        <Select value={agentFilter} onValueChange={setAgentFilter}>
          <SelectTrigger className="w-[200px]">
            <Filter className="mr-2 h-4 w-4 text-slate-500" aria-hidden />
            <SelectValue placeholder="All Agents" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Agents</SelectItem>
            {agents.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error && (
        <p className="text-sm text-rose-600">
          {error instanceof ApiClientError
            ? error.message
            : "Failed to load call history"}
        </p>
      )}

      <Card className="overflow-hidden border-slate-200/90 shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="border-slate-200 bg-slate-50/90 hover:bg-slate-50/90">
              <TableHead>Agent</TableHead>
              <TableHead>Call To</TableHead>
              <TableHead>Call From</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Credits</TableHead>
              <TableHead className="text-right">Summary</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isPending && accumulated.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-12 text-center">
                  <Loader2 className="mx-auto h-6 w-6 animate-spin text-slate-400" />
                </TableCell>
              </TableRow>
            ) : accumulated.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="py-12 text-center text-sm text-slate-600"
                >
                  No calls yet. Place an inbound test call to your Twilio number.
                </TableCell>
              </TableRow>
            ) : (
              accumulated.map((row) => (
                <TableRow key={row.callId}>
                  <TableCell>
                    <div className="font-medium text-indigo-700">
                      {row.agentName ?? "—"}
                    </div>
                    <div className="text-xs text-slate-500">
                      {formatDateTime(row.startedAt)}
                    </div>
                  </TableCell>
                  <TableCell className="text-slate-700">
                    {formatPhoneNumberDisplay(row.dialedNumber)}
                  </TableCell>
                  <TableCell className="text-slate-700">
                    {formatPhoneNumberDisplay(row.callerNumber)}
                  </TableCell>
                  <TableCell className="font-mono text-slate-600">
                    {formatDuration(row.duration)}
                  </TableCell>
                  <TableCell className="font-mono text-slate-600">
                    {row.credits}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => openDetail(row.callId)}
                    >
                      <Eye className="mr-2 h-4 w-4" aria-hidden />
                      View Summary
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-600">
          Page {pageIndex + 1}
          {nextCursor ? "" : " (last page)"}
        </p>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pageIndex === 0 || isFetching}
            onClick={() => {
              const prev = cursors[cursors.length - 1];
              setCursors((c) => c.slice(0, -1));
              setCursor(prev);
            }}
          >
            Previous
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!nextCursor || isFetching}
            onClick={() => {
              if (nextCursor) {
                setCursors((c) => [...c, cursor ?? ""]);
                setCursor(nextCursor);
              }
            }}
          >
            Next
          </Button>
        </div>
      </div>

      <CallDetailSheet
        tenantId={tenantId}
        callId={detailCallId}
        open={detailOpen}
        onOpenChange={setDetailOpen}
      />
    </div>
  );
}

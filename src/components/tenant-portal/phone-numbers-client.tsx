"use client";

import * as React from "react";
import { ExternalLink, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EditPhoneAgentDialog } from "@/components/tenant-portal/edit-phone-agent-dialog";
import { GetNumberDialog } from "@/components/tenant-portal/get-number-dialog";
import { useAgents } from "@/hooks/use-agents";
import {
  usePhoneNumbers,
  useReleasePhoneNumber,
} from "@/hooks/use-phone-numbers";
import type { PhoneNumberRow } from "@/lib/services/phone-numbers";
import { formatPhoneNumberDisplay } from "@/lib/utils/phone-format";
import { ApiClientError } from "@/lib/api/http";

const PAGE_SIZE = 10;

type PhoneNumbersClientProps = {
  tenantId: string;
};

function agentNameForPhone(
  phone: PhoneNumberRow,
  agents: { id: string; name: string }[],
): string | null {
  if (!phone.assignedAgentId) return null;
  return agents.find((a) => a.id === phone.assignedAgentId)?.name ?? null;
}

export function PhoneNumbersClient({ tenantId }: PhoneNumbersClientProps) {
  const { data: phones = [], isPending, error } = usePhoneNumbers(tenantId);
  const { data: agents = [] } = useAgents(tenantId);
  const releaseMutation = useReleasePhoneNumber(tenantId);

  const [getNumberOpen, setGetNumberOpen] = React.useState(false);
  const [editPhone, setEditPhone] = React.useState<PhoneNumberRow | null>(null);
  const [page, setPage] = React.useState(1);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [releasingId, setReleasingId] = React.useState<string | null>(null);

  const totalPages = Math.max(1, Math.ceil(phones.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageItems = phones.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );

  React.useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const handleCancelNumber = async (phone: PhoneNumberRow) => {
    const label = formatPhoneNumberDisplay(phone.e164Number);
    if (
      !window.confirm(
        `Release ${label}? This removes the number from Twilio and your account.`,
      )
    ) {
      return;
    }
    setActionError(null);
    setReleasingId(phone.id);
    try {
      await releaseMutation.mutateAsync(phone.id);
    } catch (e) {
      setActionError(
        e instanceof ApiClientError ? e.message : "Failed to release number",
      );
    } finally {
      setReleasingId(null);
    }
  };

  const queryError =
    error instanceof ApiClientError
      ? error.message
      : error instanceof Error
        ? error.message
        : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
              Phone Numbers
            </h1>
            <Badge className="bg-slate-900 text-white hover:bg-slate-900">
              BETA
            </Badge>
          </div>
          <p className="mt-1 text-sm text-slate-600">
            Manage your phone numbers.
          </p>
        </div>
        <Button
          type="button"
          className="bg-indigo-600 text-white hover:bg-indigo-700"
          onClick={() => setGetNumberOpen(true)}
        >
          Get Number
        </Button>
      </div>

      <Card className="border-slate-200 shadow-sm">
        <CardContent className="p-0">
          {isPending ? (
            <p className="flex items-center gap-2 px-6 py-10 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading phone numbers…
            </p>
          ) : queryError ? (
            <p className="px-6 py-10 text-sm text-red-600" role="alert">
              {queryError}
            </p>
          ) : phones.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <p className="text-sm text-slate-600">
                No phone numbers yet. Click{" "}
                <span className="font-medium text-slate-900">Get Number</span>{" "}
                to search Twilio and add one to your account.
              </p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-[40%]">Phone Number</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageItems.map((p) => {
                    const agentName = agentNameForPhone(p, agents);
                    const releasing = releasingId === p.id;
                    return (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium text-slate-900">
                          {formatPhoneNumberDisplay(p.e164Number)}
                        </TableCell>
                        <TableCell className="text-slate-600">
                          {agentName ? (
                            <span>
                              Used by{" "}
                              <span className="font-medium text-slate-800">
                                {agentName}
                              </span>
                            </span>
                          ) : (
                            <span className="text-slate-500">Not assigned</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex flex-wrap items-center justify-end gap-2">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="text-slate-600 hover:text-slate-900"
                              disabled={releasing || releaseMutation.isPending}
                              onClick={() => void handleCancelNumber(p)}
                            >
                              {releasing ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                "Cancel Number"
                              )}
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="border-slate-200 bg-white"
                              onClick={() => setEditPhone(p)}
                            >
                              Edit Agent
                              <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3">
                <p className="text-sm text-slate-600">
                  Page {safePage} of {totalPages}
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="border-slate-200"
                    disabled={safePage <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="border-slate-200"
                    disabled={safePage >= totalPages}
                    onClick={() =>
                      setPage((p) => Math.min(totalPages, p + 1))
                    }
                  >
                    Next
                  </Button>
                </div>
              </div>
            </>
          )}
          {actionError ? (
            <p className="border-t border-slate-100 px-6 py-3 text-sm text-red-600" role="alert">
              {actionError}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <GetNumberDialog
        tenantId={tenantId}
        open={getNumberOpen}
        onOpenChange={setGetNumberOpen}
      />

      <EditPhoneAgentDialog
        tenantId={tenantId}
        phone={editPhone}
        agents={agents.map((a) => ({
          id: a.id,
          name: a.name,
          status: a.status,
        }))}
        open={editPhone != null}
        onOpenChange={(open) => {
          if (!open) setEditPhone(null);
        }}
      />
    </div>
  );
}

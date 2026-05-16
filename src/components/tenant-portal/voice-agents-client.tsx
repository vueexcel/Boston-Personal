"use client";

import * as React from "react";
import Link from "next/link";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CreateAgentWizard } from "@/components/tenant-portal/create-agent-wizard";
import { useAgents, useDeleteAgent } from "@/hooks/use-agents";
import { ApiClientError } from "@/lib/api/http";

type VoiceAgentsClientProps = {
  tenantId: string;
};

function queryErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) return error.message;
  if (error instanceof Error) return error.message;
  return "Could not load agents";
}

export function VoiceAgentsClient({ tenantId }: VoiceAgentsClientProps) {
  const [wizardOpen, setWizardOpen] = React.useState(false);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);

  const {
    data: agents = [],
    isPending: loading,
    error: listQueryError,
  } = useAgents(tenantId);
  const listError = listQueryError
    ? queryErrorMessage(listQueryError)
    : null;

  const deleteMutation = useDeleteAgent(tenantId);

  const deleteAgentHandler = async (agentId: string, name: string) => {
    if (
      !window.confirm(
        `Delete agent “${name}”? This cannot be undone from the portal.`,
      )
    ) {
      return;
    }
    setDeletingId(agentId);
    try {
      await deleteMutation.mutateAsync(agentId);
    } catch (e) {
      window.alert(
        e instanceof ApiClientError ? e.message : "Delete failed",
      );
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
            Voice Agents
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600 sm:text-base">
            Design inbound personas, link knowledge, and enforce safety before you
            publish to production traffic.
          </p>
        </div>
        <Button
          type="button"
          className="shrink-0 bg-indigo-600 hover:bg-indigo-700"
          onClick={() => setWizardOpen(true)}
        >
          <Plus className="mr-2 h-4 w-4" />
          New agent
        </Button>
      </div>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Your agents</CardTitle>
          <CardDescription>
            Draft and active agents for this workspace. Create a new one to get
            started.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-slate-600">Loading agents…</p>
          ) : listError ? (
            <p className="text-sm text-red-600" role="alert">
              {listError}
            </p>
          ) : agents.length === 0 ? (
            <p className="text-sm text-slate-600">
              No agents yet. Click <strong>New agent</strong> to create your first
              one.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-slate-200">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/80">
                    <TableHead>Name</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden sm:table-cell">Created</TableHead>
                    <TableHead className="w-[140px] text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {agents.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium text-slate-900">
                        {a.name}
                      </TableCell>
                      <TableCell className="text-slate-700">{a.status}</TableCell>
                      <TableCell className="hidden text-slate-600 sm:table-cell">
                        {new Date(a.createdAt).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="outline" size="sm" className="h-8" asChild>
                            <Link href={`/portal/voice-agents/${a.id}`}>
                              <Pencil className="mr-1 h-3.5 w-3.5" />
                              Edit
                            </Link>
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 text-red-700 hover:bg-red-50 hover:text-red-800"
                            disabled={deletingId === a.id}
                            onClick={() => void deleteAgentHandler(a.id, a.name)}
                          >
                            <Trash2 className="mr-1 h-3.5 w-3.5" />
                            {deletingId === a.id ? "…" : "Delete"}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <CreateAgentWizard
        tenantId={tenantId}
        open={wizardOpen}
        onOpenChange={setWizardOpen}
      />
    </div>
  );
}
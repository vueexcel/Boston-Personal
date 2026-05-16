"use client";

import * as React from "react";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { tenantStatusSchema } from "@/lib/db/schema";
import type { z } from "zod";

type TenantStatus = z.infer<typeof tenantStatusSchema>;

export type AdminTenantRow = {
  tenantId: string;
  displayTenantId: string;
  accountName: string;
  status: TenantStatus;
  planCode: string;
  agentCount: number;
  maxAgents: number;
  maxPhoneNumbers: number;
};

const FALLBACK_WARNING =
  "Fallback behavior applies: inbound calls will follow inactive-tenant routing (e.g. voicemail or alternate destination) instead of live AI agents.";

function confirmInactive(): boolean {
  if (typeof window === "undefined") return true;
  return window.confirm(
    `${FALLBACK_WARNING}\n\nSet this tenant to Inactive?`,
  );
}

const MOCK_TENANTS: AdminTenantRow[] = [
  {
    tenantId: "cltenant001acme",
    displayTenantId: "TEN-10025",
    accountName: "Acme Plumbing Co.",
    status: "ACTIVE",
    planCode: "VOICE_AI_PRO",
    agentCount: 4,
    maxAgents: 10,
    maxPhoneNumbers: 5,
  },
  {
    tenantId: "cltenant002beta",
    displayTenantId: "TEN-10026",
    accountName: "Beta Dental Group",
    status: "INACTIVE",
    planCode: "VOICE_AI_PRO",
    agentCount: 2,
    maxAgents: 5,
    maxPhoneNumbers: 3,
  },
  {
    tenantId: "cltenant003gamma",
    displayTenantId: "TEN-10027",
    accountName: "Gamma Legal LLP",
    status: "ACTIVE",
    planCode: "VOICE_AI_STARTER",
    agentCount: 1,
    maxAgents: 3,
    maxPhoneNumbers: 2,
  },
];

const columnHelper = createColumnHelper<AdminTenantRow>();

export function TenantManagement() {
  const [tenants, setTenants] = React.useState<AdminTenantRow[]>(MOCK_TENANTS);
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  const selected = React.useMemo(
    () => tenants.find((t) => t.tenantId === selectedId) ?? null,
    [tenants, selectedId],
  );

  const patchTenant = React.useCallback(
    (tenantId: string, patch: Partial<AdminTenantRow>) => {
      setTenants((prev) =>
        prev.map((t) => (t.tenantId === tenantId ? { ...t, ...patch } : t)),
      );
    },
    [],
  );

  const requestStatus = React.useCallback(
    (tenantId: string, next: TenantStatus) => {
      if (next === "INACTIVE") {
        if (!confirmInactive()) return;
      }
      patchTenant(tenantId, { status: next });
    },
    [patchTenant],
  );

  const columns = React.useMemo(
    () => [
      columnHelper.accessor("accountName", {
        header: "Account name",
        cell: (info) => (
          <span className="font-medium text-foreground">{info.getValue()}</span>
        ),
      }),
      columnHelper.accessor("displayTenantId", {
        header: "Tenant ID",
        cell: (info) => (
          <Badge variant="outline" className="font-mono">
            {info.getValue()}
          </Badge>
        ),
      }),
      columnHelper.accessor("status", {
        header: "Status",
        cell: (info) => {
          const row = info.row.original;
          const status = info.getValue();
          const active = status === "ACTIVE";
          const label =
            status === "SUSPENDED"
              ? "Suspended"
              : active
                ? "Active"
                : "Inactive";
          return (
            <div
              className="flex items-center gap-2"
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
            >
              <Switch
                checked={active}
                onCheckedChange={(checked) =>
                  requestStatus(row.tenantId, checked ? "ACTIVE" : "INACTIVE")
                }
                aria-label={`Toggle active for ${row.accountName}`}
              />
              <Badge variant={active ? "success" : "muted"}>{label}</Badge>
            </div>
          );
        },
      }),
      columnHelper.accessor("planCode", {
        header: "Plan",
        cell: (info) => (
          <Badge variant="secondary" className="font-mono text-xs">
            {info.getValue()}
          </Badge>
        ),
      }),
      columnHelper.accessor("agentCount", {
        header: "Agents",
        cell: (info) => (
          <span className="tabular-nums text-muted-foreground">
            {info.getValue()}
          </span>
        ),
      }),
    ],
    [requestStatus],
  );

  const table = useReactTable({
    data: tenants,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const openSheet = (tenantId: string) => {
    setSelectedId(tenantId);
    setSheetOpen(true);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Tenant management
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Platform admin view — entitlements and tenant status (demo data).
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Tenants</CardTitle>
        </CardHeader>
        <CardContent className="p-0 sm:p-0">
          <div className="rounded-md border border-border overflow-x-auto">
            <Table>
              <TableHeader>
                {table.getHeaderGroups().map((hg) => (
                  <TableRow key={hg.id} className="hover:bg-transparent">
                    {hg.headers.map((header) => (
                      <TableHead key={header.id}>
                        {header.isPlaceholder
                          ? null
                          : flexRender(
                              header.column.columnDef.header,
                              header.getContext(),
                            )}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows.length ? (
                  table.getRowModel().rows.map((row) => (
                    <TableRow
                      key={row.id}
                      className="cursor-pointer"
                      data-state={selectedId === row.original.tenantId && sheetOpen ? "selected" : undefined}
                      onClick={() => openSheet(row.original.tenantId)}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id}>
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext(),
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={columns.length}
                      className="h-24 text-center text-muted-foreground"
                    >
                      No tenants.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Sheet
        open={sheetOpen}
        onOpenChange={(open) => {
          setSheetOpen(open);
          if (!open) setSelectedId(null);
        }}
      >
        <SheetContent className="flex flex-col gap-0 overflow-y-auto sm:max-w-lg">
          {selected ? (
            <>
              <SheetHeader className="space-y-1 pb-2">
                <SheetTitle className="pr-6">{selected.accountName}</SheetTitle>
                <SheetDescription className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="font-mono">
                    {selected.displayTenantId}
                  </Badge>
                  <span className="text-muted-foreground">·</span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {selected.tenantId}
                  </span>
                </SheetDescription>
              </SheetHeader>

              <div className="space-y-6 py-4">
                <section className="space-y-3">
                  <h3 className="text-sm font-medium text-foreground">
                    Entitlements
                  </h3>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="max_agents">max_agents</Label>
                      <Input
                        id="max_agents"
                        type="number"
                        min={0}
                        value={selected.maxAgents}
                        onChange={(e) =>
                          patchTenant(selected.tenantId, {
                            maxAgents: Math.max(
                              0,
                              Number.parseInt(e.target.value, 10) || 0,
                            ),
                          })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="max_phone_numbers">
                        max_phone_numbers
                      </Label>
                      <Input
                        id="max_phone_numbers"
                        type="number"
                        min={0}
                        value={selected.maxPhoneNumbers}
                        onChange={(e) =>
                          patchTenant(selected.tenantId, {
                            maxPhoneNumbers: Math.max(
                              0,
                              Number.parseInt(e.target.value, 10) || 0,
                            ),
                          })
                        }
                      />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Maps to tenant entitlement limits in Postgres (
                    <code className="rounded bg-muted px-1 py-0.5">maxAgents</code>
                    ,{" "}
                    <code className="rounded bg-muted px-1 py-0.5">
                      maxPhoneNumbers
                    </code>
                    ).
                  </p>
                </section>

                <Separator />

                <section className="space-y-4">
                  <h3 className="text-sm font-medium text-foreground">
                    Status control
                  </h3>
                  <div
                    className="flex flex-col gap-4 rounded-lg border border-border bg-muted/30 p-4"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div className="space-y-1">
                        <p className="text-sm font-medium leading-none">
                          Tenant active
                        </p>
                        <p className="text-xs text-muted-foreground">
                          When off, the tenant is inactive and fallback routing
                          applies.
                        </p>
                      </div>
                      <Switch
                        className="h-7 w-12 scale-110 data-[state=checked]:bg-primary"
                        checked={selected.status === "ACTIVE"}
                        onCheckedChange={(checked) => {
                          if (!checked && !confirmInactive()) return;
                          patchTenant(
                            selected.tenantId,
                            {
                              status: checked ? "ACTIVE" : "INACTIVE",
                            },
                          );
                        }}
                        aria-label="Toggle tenant active status"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Status:</span>
                      <Badge
                        variant={
                          selected.status === "ACTIVE" ? "success" : "muted"
                        }
                      >
                        {selected.status === "ACTIVE"
                          ? "Active"
                          : selected.status === "SUSPENDED"
                            ? "Suspended"
                            : "Inactive"}
                      </Badge>
                    </div>
                  </div>

                  {selected.status !== "ACTIVE" ? (
                    <Alert variant="warning">
                      <AlertTitle>Fallback behavior</AlertTitle>
                      <AlertDescription>{FALLBACK_WARNING}</AlertDescription>
                    </Alert>
                  ) : null}
                </section>

                <Separator />

                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setSheetOpen(false)}
                  >
                    Close
                  </Button>
                </div>
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}

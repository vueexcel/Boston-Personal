"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { Loader2, MoreHorizontal, RefreshCw, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import type { AdminTenantListRow } from "@/lib/services/platform-tenants";
import type { ApiEnvelope } from "@/types/api";
import { useAdminPlanLabels } from "@/hooks/use-admin-plan-labels";

const columnHelper = createColumnHelper<AdminTenantListRow>();

function statusBadgeVariant(
  status: AdminTenantListRow["status"],
): "success" | "warning" | "muted" {
  if (status === "ACTIVE") return "success";
  if (status === "SUSPENDED") return "warning";
  return "muted";
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

async function fetchTenants(params: {
  search: string;
  status: string;
  page: number;
}): Promise<{ tenants: AdminTenantListRow[]; total: number }> {
  const qs = new URLSearchParams();
  if (params.search) qs.set("search", params.search);
  if (params.status && params.status !== "ALL") qs.set("status", params.status);
  qs.set("page", String(params.page));
  qs.set("limit", "25");

  const res = await fetch(`/api/admin/tenants?${qs.toString()}`, {
    credentials: "same-origin",
  });
  const body = (await res.json()) as ApiEnvelope<{
    tenants: AdminTenantListRow[];
    total: number;
  }>;
  if (!body.success) throw new Error(body.error?.message ?? "Failed to load tenants");
  return body.data;
}

export function TenantManagement() {
  const router = useRouter();
  const [search, setSearch] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("ALL");
  const [page, setPage] = React.useState(1);

  React.useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => window.clearTimeout(t);
  }, [search]);

  React.useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter]);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["admin-tenants", debouncedSearch, statusFilter, page],
    queryFn: () =>
      fetchTenants({ search: debouncedSearch, status: statusFilter, page }),
  });

  const { labelFor } = useAdminPlanLabels();

  const tenants = data?.tenants ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / 25));

  const columns = React.useMemo(
    () => [
      columnHelper.accessor("accountName", {
        header: "Tenant name",
        cell: (info) => (
          <span className="font-medium text-foreground">{info.getValue()}</span>
        ),
      }),
      columnHelper.accessor("companyName", {
        header: "Company",
        cell: (info) => (
          <span className="text-muted-foreground">
            {info.getValue() || "—"}
          </span>
        ),
      }),
      columnHelper.accessor("planCode", {
        header: "Plan",
        cell: (info) => (
          <Badge variant="secondary" className="text-xs">
            {labelFor(info.getValue())}
          </Badge>
        ),
      }),
      columnHelper.accessor("status", {
        header: "Status",
        cell: (info) => {
          const status = info.getValue();
          return (
            <Badge variant={statusBadgeVariant(status)}>
              {status === "ACTIVE"
                ? "Active"
                : status === "SUSPENDED"
                  ? "Suspended"
                  : "Inactive"}
            </Badge>
          );
        },
      }),
      columnHelper.display({
        id: "usage",
        header: "Usage (30d)",
        cell: ({ row }) => (
          <span className="tabular-nums text-sm text-muted-foreground">
            {row.original.callCount.toLocaleString()} calls ·{" "}
            {row.original.minutesUsed30d.toLocaleString()} min
          </span>
        ),
      }),
      columnHelper.accessor("createdAt", {
        header: "Created",
        cell: (info) => (
          <span className="text-sm text-muted-foreground">
            {formatDate(info.getValue())}
          </span>
        ),
      }),
      columnHelper.display({
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`View ${row.original.accountName}`}
            onClick={(e) => {
              e.stopPropagation();
              router.push(`/admin/tenants/${row.original.tenantId}`);
            }}
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        ),
      }),
    ],
    [router, labelFor],
  );

  const table = useReactTable({
    data: tenants,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Tenant management
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          View and manage all customer tenants on the platform.
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-4 pb-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base">Tenants</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search tenants…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All statuses</SelectItem>
                <SelectItem value="ACTIVE">Active</SelectItem>
                <SelectItem value="INACTIVE">Inactive</SelectItem>
                <SelectItem value="SUSPENDED">Suspended</SelectItem>
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Refresh"
              onClick={() => void refetch()}
              disabled={isFetching}
            >
              <RefreshCw
                className={isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"}
              />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0 sm:p-0">
          {isLoading ? (
            <div className="flex h-48 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : isError ? (
            <div className="p-6 text-sm text-destructive">
              {(error as Error).message}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto rounded-md border border-border">
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
                          onClick={() =>
                            router.push(
                              `/admin/tenants/${row.original.tenantId}`,
                            )
                          }
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
                          No tenants found.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
              <div className="flex items-center justify-between border-t border-border px-4 py-3">
                <p className="text-xs text-muted-foreground">
                  {total.toLocaleString()} tenant{total === 1 ? "" : "s"}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    Page {page} of {totalPages}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Click a row to open the full tenant profile.{" "}
        <Link href="/admin" className="underline underline-offset-2">
          Back to dashboard
        </Link>
      </p>
    </div>
  );
}

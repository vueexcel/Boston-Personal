"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  ExternalLink,
  FileText,
  Globe,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CreateKnowledgeFromTextDialog } from "@/components/tenant-portal/create-knowledge-from-text-dialog";
import {
  useDeleteKnowledgeBase,
  useKnowledgeBases,
} from "@/hooks/use-knowledge-bases";
import type { KnowledgeBaseSummary } from "@/lib/services/knowledge-bases";
import { ApiClientError } from "@/lib/api/http";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 10;

type SortKey = "name" | "documentCount" | "updatedAt";
type SortDir = "asc" | "desc";

function formatListDate(iso: string): string {
  try {
    const d = new Date(iso);
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const yyyy = d.getFullYear();
    return `${mm}-${dd}-${yyyy}`;
  } catch {
    return iso;
  }
}

function queryErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) return error.message;
  if (error instanceof Error) return error.message;
  return "Could not load knowledge bases";
}

export type KnowledgeBaseListProps = {
  tenantId: string;
};

export function KnowledgeBaseList({ tenantId }: KnowledgeBaseListProps) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = React.useState(false);
  const [page, setPage] = React.useState(1);
  const [sortKey, setSortKey] = React.useState<SortKey>("updatedAt");
  const [sortDir, setSortDir] = React.useState<SortDir>("desc");
  const [deletingId, setDeletingId] = React.useState<string | null>(null);

  const { data: items = [], isPending, error } = useKnowledgeBases(tenantId);
  const deleteMutation = useDeleteKnowledgeBase(tenantId);

  const sorted = React.useMemo(() => {
    const copy = [...items];
    copy.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "name") {
        cmp = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      } else if (sortKey === "documentCount") {
        cmp = a.documentCount - b.documentCount;
      } else {
        cmp =
          new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [items, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageItems = sorted.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );

  React.useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "name" ? "asc" : "desc");
    }
  };

  const SortIcon = ({ column }: { column: SortKey }) => {
    if (sortKey !== column) {
      return <ArrowUp className="ml-1 inline h-3 w-3 opacity-30" />;
    }
    return sortDir === "asc" ? (
      <ArrowUp className="ml-1 inline h-3 w-3" />
    ) : (
      <ArrowDown className="ml-1 inline h-3 w-3" />
    );
  };

  const handleDelete = async (kb: KnowledgeBaseSummary) => {
    if (
      !window.confirm(
        `Delete knowledge base “${kb.name}” and all its documents?`,
      )
    ) {
      return;
    }
    setDeletingId(kb.id);
    try {
      await deleteMutation.mutateAsync(kb.id);
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
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Knowledge Base
        </h1>
        <Badge className="bg-slate-900 text-white hover:bg-slate-900">BETA</Badge>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <CreateSourceCard
          icon={<Plus className="h-5 w-5" />}
          label="Create From Text"
          onClick={() => setCreateOpen(true)}
        />
        <CreateSourceCard
          icon={<FileText className="h-5 w-5" />}
          label="Create From File"
          disabled
          hint="Coming soon"
        />
        <CreateSourceCard
          icon={<Globe className="h-5 w-5" />}
          label="Create From Website"
          disabled
          hint="Coming soon"
        />
      </div>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="border-b border-slate-100 py-4">
          {isPending ? (
            <p className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading…
            </p>
          ) : error ? (
            <p className="text-sm text-red-600" role="alert">
              {queryErrorMessage(error)}
            </p>
          ) : null}
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>
                  <button
                    type="button"
                    className="inline-flex items-center font-medium"
                    onClick={() => toggleSort("name")}
                  >
                    Name
                    <SortIcon column="name" />
                  </button>
                </TableHead>
                <TableHead>
                  <button
                    type="button"
                    className="inline-flex items-center font-medium"
                    onClick={() => toggleSort("documentCount")}
                  >
                    Documents
                    <SortIcon column="documentCount" />
                  </button>
                </TableHead>
                <TableHead>
                  <button
                    type="button"
                    className="inline-flex items-center font-medium"
                    onClick={() => toggleSort("updatedAt")}
                  >
                    Last Updated
                    <SortIcon column="updatedAt" />
                  </button>
                </TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!isPending && pageItems.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="py-12 text-center text-sm text-slate-500"
                  >
                    No knowledge bases yet. Create one from text to get started.
                  </TableCell>
                </TableRow>
              ) : null}
              {pageItems.map((kb) => (
                <TableRow key={kb.id}>
                  <TableCell className="font-medium text-slate-900">
                    {kb.name}
                  </TableCell>
                  <TableCell>{kb.documentCount}</TableCell>
                  <TableCell className="text-slate-600">
                    {formatListDate(kb.updatedAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="border-slate-200"
                        onClick={() =>
                          router.push(`/portal/knowledge/${kb.id}`)
                        }
                      >
                        <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                        Edit
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-8 w-8 border-slate-200 text-red-600 hover:text-red-700"
                        disabled={deletingId === kb.id}
                        onClick={() => void handleDelete(kb)}
                        aria-label={`Delete ${kb.name}`}
                      >
                        {deletingId === kb.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="flex flex-col items-center justify-center gap-3 border-t border-slate-100 px-4 py-4 sm:flex-row">
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
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <CreateKnowledgeFromTextDialog
        tenantId={tenantId}
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(kbId) => router.push(`/portal/knowledge/${kbId}`)}
      />
    </div>
  );
}

function CreateSourceCard({
  icon,
  label,
  onClick,
  disabled,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      title={hint}
      onClick={onClick}
      className={cn(
        "flex min-h-[72px] items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-800 shadow-sm transition-colors",
        disabled
          ? "cursor-not-allowed opacity-50"
          : "hover:border-indigo-200 hover:bg-indigo-50/50",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

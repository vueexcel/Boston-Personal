"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronRight,
  Loader2,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  useDeleteKnowledgeBase,
  useDeleteKnowledgeDocument,
  useKnowledgeBase,
  useKnowledgeDocuments,
  useUpdateKnowledgeBase,
  useCreateKnowledgeDocument,
  useUpdateKnowledgeDocument,
} from "@/hooks/use-knowledge-bases";
import {
  documentContentSnippet,
  type KnowledgeDocument,
} from "@/lib/services/knowledge-documents.shared";
import { ApiClientError } from "@/lib/api/http";

export type KnowledgeBaseEditProps = {
  tenantId: string;
  kbId: string;
};

export function KnowledgeBaseEdit({ tenantId, kbId }: KnowledgeBaseEditProps) {
  const router = useRouter();
  const { data: kb, isPending: kbLoading, error: kbError } =
    useKnowledgeBase(tenantId, kbId);
  const { data: documents = [], isPending: docsLoading } =
    useKnowledgeDocuments(tenantId, kbId);

  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [metaDirty, setMetaDirty] = React.useState(false);

  const [docDialogOpen, setDocDialogOpen] = React.useState(false);
  const [editingDoc, setEditingDoc] = React.useState<KnowledgeDocument | null>(
    null,
  );
  const [docContent, setDocContent] = React.useState("");
  const [docError, setDocError] = React.useState<string | null>(null);

  const updateKb = useUpdateKnowledgeBase(tenantId, kbId);
  const deleteKb = useDeleteKnowledgeBase(tenantId);
  const createDoc = useCreateKnowledgeDocument(tenantId, kbId);
  const updateDoc = useUpdateKnowledgeDocument(tenantId, kbId);
  const deleteDoc = useDeleteKnowledgeDocument(tenantId, kbId);

  React.useEffect(() => {
    if (kb) {
      setName(kb.name);
      setDescription(kb.description ?? "");
      setMetaDirty(false);
    }
  }, [kb]);

  const saveMeta = async () => {
    if (!name.trim()) {
      setSaveError("Name is required.");
      return;
    }
    setSaveError(null);
    try {
      await updateKb.mutateAsync({
        name: name.trim(),
        description: description.trim() || null,
      });
      setMetaDirty(false);
    } catch (e) {
      setSaveError(
        e instanceof ApiClientError ? e.message : "Could not save",
      );
    }
  };

  const openNewDoc = () => {
    setEditingDoc(null);
    setDocContent("");
    setDocError(null);
    setDocDialogOpen(true);
  };

  const openEditDoc = (doc: KnowledgeDocument) => {
    setEditingDoc(doc);
    setDocContent(doc.content);
    setDocError(null);
    setDocDialogOpen(true);
  };

  const submitDoc = async () => {
    const trimmed = docContent.trim();
    if (!trimmed) {
      setDocError("Content is required.");
      return;
    }
    setDocError(null);
    try {
      if (editingDoc) {
        await updateDoc.mutateAsync({
          docId: editingDoc.id,
          body: { content: trimmed },
        });
      } else {
        await createDoc.mutateAsync({ content: trimmed });
      }
      setDocDialogOpen(false);
    } catch (e) {
      setDocError(
        e instanceof ApiClientError ? e.message : "Could not save document",
      );
    }
  };

  const handleDeleteKb = async () => {
    if (!kb) return;
    if (
      !window.confirm(
        `Delete knowledge base “${kb.name}” and all documents? This cannot be undone.`,
      )
    ) {
      return;
    }
    try {
      await deleteKb.mutateAsync(kbId);
      router.push("/portal/knowledge");
    } catch (e) {
      window.alert(
        e instanceof ApiClientError ? e.message : "Delete failed",
      );
    }
  };

  const handleDeleteDoc = async (doc: KnowledgeDocument) => {
    if (!window.confirm("Delete this document?")) return;
    try {
      await deleteDoc.mutateAsync(doc.id);
    } catch (e) {
      window.alert(
        e instanceof ApiClientError ? e.message : "Delete failed",
      );
    }
  };

  const sortedDocuments = React.useMemo(() => {
    const copy = [...documents];
    copy.sort((a, b) => {
      const aOrder = a.sourceMeta?.sortOrder;
      const bOrder = b.sourceMeta?.sortOrder;
      if (aOrder != null && bOrder != null) return aOrder - bOrder;
      if (aOrder != null) return -1;
      if (bOrder != null) return 1;
      return (
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
    });
    return copy;
  }, [documents]);

  const importedSource = React.useMemo(() => {
    for (const doc of documents) {
      if (doc.sourceType === "file" && doc.sourceMeta?.originalFileName) {
        return { type: "file" as const, label: doc.sourceMeta.originalFileName };
      }
      if (doc.sourceType === "website" && doc.sourceMeta?.sourceUrl) {
        return { type: "website" as const, label: doc.sourceMeta.sourceUrl };
      }
    }
    return null;
  }, [documents]);

  if (kbLoading) {
    return (
      <p className="flex items-center gap-2 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading knowledge base…
      </p>
    );
  }

  if (kbError || !kb) {
    return (
      <p className="text-sm text-red-600" role="alert">
        {kbError instanceof Error ? kbError.message : "Knowledge base not found"}
      </p>
    );
  }

  const docCount = sortedDocuments.length;

  return (
    <div className="space-y-6">
      <nav className="flex flex-wrap items-center gap-1 text-sm text-slate-600">
        <Link
          href="/portal/knowledge"
          className="font-medium text-slate-900 hover:text-indigo-700"
        >
          Knowledge Base
        </Link>
        <ChevronRight className="h-4 w-4 text-slate-400" />
        <span className="flex items-center gap-2">
          Documents
          <Badge className="bg-slate-900 text-white hover:bg-slate-900">
            BETA
          </Badge>
        </span>
      </nav>

      <Card className="border-slate-200 shadow-sm">
        <CardContent className="space-y-6 p-6">
          <div className="space-y-2">
            <Label htmlFor="kb-name">
              Name <span className="text-red-600">*</span>
            </Label>
            <Input
              id="kb-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setMetaDirty(true);
              }}
              className="max-w-xl border-slate-200"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="kb-description">Description</Label>
            <Textarea
              id="kb-description"
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                setMetaDirty(true);
              }}
              placeholder="Enter a description for this knowledge base..."
              className="min-h-[100px] max-w-2xl resize-y border-slate-200"
            />
          </div>
          {metaDirty ? (
            <Button
              type="button"
              size="sm"
              className="bg-indigo-600 hover:bg-indigo-700"
              disabled={updateKb.isPending}
              onClick={() => void saveMeta()}
            >
              {updateKb.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Save name & description
            </Button>
          ) : null}
          {saveError ? (
            <p className="text-sm text-red-600" role="alert">
              {saveError}
            </p>
          ) : null}

          {importedSource ? (
            <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              Imported from{" "}
              <span className="break-all font-medium text-slate-900">
                {importedSource.label}
              </span>
              {importedSource.type === "website"
                ? " (website)"
                : null}
              . Review each section below and edit as needed.
            </p>
          ) : null}

          <div className="border-t border-slate-100 pt-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  Documents
                </h2>
                <p className="text-sm text-slate-600">
                  This knowledge base contains {docCount} document
                  {docCount === 1 ? "" : "s"}.
                </p>
              </div>
              <Button
                type="button"
                className="bg-indigo-600 hover:bg-indigo-700"
                onClick={openNewDoc}
              >
                <Plus className="mr-1.5 h-4 w-4" />
                Create New Document
              </Button>
            </div>

            <div className="mt-4 overflow-hidden rounded-lg border border-slate-200">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-[200px]">Title</TableHead>
                    <TableHead>Content</TableHead>
                    <TableHead className="w-[180px] text-right">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {docsLoading ? (
                    <TableRow>
                      <TableCell colSpan={3} className="py-8 text-center">
                        <Loader2 className="mx-auto h-5 w-5 animate-spin text-slate-400" />
                      </TableCell>
                    </TableRow>
                  ) : sortedDocuments.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={3}
                        className="py-8 text-center text-sm text-slate-500"
                      >
                        No documents yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    sortedDocuments.map((doc) => (
                      <TableRow key={doc.id}>
                        <TableCell className="font-medium text-slate-900">
                          {doc.sourceMeta?.section ?? "Document"}
                        </TableCell>
                        <TableCell className="max-w-md truncate text-slate-600">
                          {documentContentSnippet(doc.content, 80)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="inline-flex gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="border-slate-200"
                              onClick={() => openEditDoc(doc)}
                            >
                              <Pencil className="mr-1.5 h-3.5 w-3.5" />
                              Edit
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="border-red-200 text-red-600 hover:text-red-700"
                              onClick={() => void handleDeleteDoc(doc)}
                            >
                              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                              Delete
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            className="border-red-200 text-red-600 hover:bg-red-50"
            disabled={deleteKb.isPending}
            onClick={() => void handleDeleteKb()}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete Knowledge Base
          </Button>
        </CardContent>
      </Card>

      <Dialog open={docDialogOpen} onOpenChange={setDocDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingDoc
                ? editingDoc.sourceMeta?.section
                  ? `Edit: ${editingDoc.sourceMeta.section}`
                  : "Edit document"
                : "New document"}
            </DialogTitle>
            <DialogDescription>
              Paste or edit the text the agent can use as reference.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={docContent}
            onChange={(e) => setDocContent(e.target.value)}
            className="min-h-[200px] resize-y border-slate-200"
            placeholder="Document content…"
          />
          {docError ? (
            <p className="text-sm text-red-600" role="alert">
              {docError}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDocDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-indigo-600 hover:bg-indigo-700"
              disabled={createDoc.isPending || updateDoc.isPending}
              onClick={() => void submitDoc()}
            >
              {(createDoc.isPending || updateDoc.isPending) && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

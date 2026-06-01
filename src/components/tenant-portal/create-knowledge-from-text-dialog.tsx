"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { Textarea } from "@/components/ui/textarea";
import { ApiClientError } from "@/lib/api/http";
import { useCreateKnowledgeBase } from "@/hooks/use-knowledge-bases";

export type CreateKnowledgeFromTextDialogProps = {
  tenantId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (kbId: string) => void;
};

export function CreateKnowledgeFromTextDialog({
  tenantId,
  open,
  onOpenChange,
  onCreated,
}: CreateKnowledgeFromTextDialogProps) {
  const [name, setName] = React.useState("");
  const [content, setContent] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const createMutation = useCreateKnowledgeBase(tenantId);

  React.useEffect(() => {
    if (!open) {
      setName("");
      setContent("");
      setError(null);
    }
  }, [open]);

  const submit = async () => {
    const trimmedName = name.trim();
    const trimmedContent = content.trim();
    if (!trimmedName) {
      setError("Name is required.");
      return;
    }
    if (!trimmedContent) {
      setError("Content is required for the first document.");
      return;
    }
    setError(null);
    try {
      const kb = await createMutation.mutateAsync({
        name: trimmedName,
        initialContent: trimmedContent,
      });
      onOpenChange(false);
      onCreated?.(kb.id);
    } catch (e) {
      setError(
        e instanceof ApiClientError ? e.message : "Could not create knowledge base",
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create from text</DialogTitle>
          <DialogDescription>
            Name your knowledge base and paste the text for the first document.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="kb-create-name">
              Name <span className="text-red-600">*</span>
            </Label>
            <Input
              id="kb-create-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Contact Information"
              className="border-slate-200"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="kb-create-content">
              Document content <span className="text-red-600">*</span>
            </Label>
            <Textarea
              id="kb-create-content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Paste facts, FAQs, or policies…"
              className="min-h-[160px] resize-y border-slate-200"
            />
          </div>
          {error ? (
            <p className="text-sm text-red-600" role="alert">
              {error}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={createMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="bg-indigo-600 hover:bg-indigo-700"
            disabled={createMutation.isPending}
            onClick={() => void submit()}
          >
            {createMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

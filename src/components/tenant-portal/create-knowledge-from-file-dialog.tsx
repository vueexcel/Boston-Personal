"use client";

import * as React from "react";
import { Check, FileText, Loader2, Upload } from "lucide-react";
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
import { ApiClientError } from "@/lib/api/http";
import { useCreateKnowledgeBaseFromFile } from "@/hooks/use-knowledge-bases";
import { cn } from "@/lib/utils";

const ACCEPTED_EXTENSIONS = [".pdf", ".csv", ".docx"];
const ACCEPTED_MIME =
  ".pdf,.csv,.docx,application/pdf,text/csv,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const EXTRACTION_STEPS = [
  "Uploading file",
  "Reading document",
  "Extracting knowledge with AI",
  "Creating knowledge base",
] as const;

function fileNameStem(fileName: string): string {
  const base = fileName.replace(/\\/g, "/").split("/").pop() ?? fileName;
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(0, dot) : base;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isAcceptedFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return ACCEPTED_EXTENSIONS.some((ext) => name.endsWith(ext));
}

export type CreateKnowledgeFromFileDialogProps = {
  tenantId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (kbId: string) => void;
};

export function CreateKnowledgeFromFileDialog({
  tenantId,
  open,
  onOpenChange,
  onCreated,
}: CreateKnowledgeFromFileDialogProps) {
  const [name, setName] = React.useState("");
  const [file, setFile] = React.useState<File | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [isExtracting, setIsExtracting] = React.useState(false);
  const [activeStep, setActiveStep] = React.useState(0);
  const [dragOver, setDragOver] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const createMutation = useCreateKnowledgeBaseFromFile(tenantId);

  React.useEffect(() => {
    if (!open) {
      setName("");
      setFile(null);
      setError(null);
      setIsExtracting(false);
      setActiveStep(0);
      setDragOver(false);
    }
  }, [open]);

  React.useEffect(() => {
    if (!isExtracting) return;

    setActiveStep(0);
    const timers = [
      window.setTimeout(() => setActiveStep(1), 1200),
      window.setTimeout(() => setActiveStep(2), 2800),
      window.setTimeout(() => setActiveStep(3), 5500),
    ];

    return () => {
      for (const id of timers) window.clearTimeout(id);
    };
  }, [isExtracting]);

  const handleFile = (picked: File | null) => {
    if (!picked) return;
    if (!isAcceptedFile(picked)) {
      setError("Only PDF, CSV, and DOCX files are supported.");
      return;
    }
    setError(null);
    setFile(picked);
    if (!name.trim()) {
      setName(fileNameStem(picked.name));
    }
  };

  const handleOpenChange = (next: boolean) => {
    if (!next && isExtracting) return;
    onOpenChange(next);
  };

  const submit = async () => {
    if (!file) {
      setError("Please select a file.");
      return;
    }
    setError(null);
    setIsExtracting(true);

    try {
      const kb = await createMutation.mutateAsync({
        file,
        name: name.trim() || undefined,
      });
      onOpenChange(false);
      onCreated?.(kb.id);
    } catch (e) {
      setIsExtracting(false);
      setActiveStep(0);
      setError(
        e instanceof ApiClientError
          ? e.message
          : "Could not create knowledge base from file",
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className={cn(
          "max-h-[90vh] overflow-y-auto sm:max-w-lg",
          isExtracting && "[&>button]:hidden",
        )}
        onInteractOutside={(e) => {
          if (isExtracting) e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (isExtracting) e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>Create from file</DialogTitle>
          <DialogDescription>
            Upload a PDF, CSV, or DOCX file. We will extract business knowledge
            and create a structured knowledge base.
          </DialogDescription>
        </DialogHeader>

        {isExtracting ? (
          <div className="space-y-5 py-4">
            <div className="flex items-center gap-3 rounded-lg border border-indigo-100 bg-indigo-50/60 px-4 py-3">
              <Loader2 className="h-5 w-5 shrink-0 animate-spin text-indigo-600" />
              <p className="text-sm text-indigo-900">
                Please keep this window open. Extraction cannot be cancelled
                once started.
              </p>
            </div>
            <ol className="space-y-3">
              {EXTRACTION_STEPS.map((label, index) => {
                const done = index < activeStep;
                const current = index === activeStep;
                return (
                  <li
                    key={label}
                    className={cn(
                      "flex items-center gap-3 text-sm",
                      done
                        ? "text-slate-600"
                        : current
                          ? "font-medium text-slate-900"
                          : "text-slate-400",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border",
                        done
                          ? "border-emerald-200 bg-emerald-50 text-emerald-600"
                          : current
                            ? "border-indigo-200 bg-indigo-50 text-indigo-600"
                            : "border-slate-200 bg-white text-slate-400",
                      )}
                    >
                      {done ? (
                        <Check className="h-3.5 w-3.5" />
                      ) : current ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <span className="text-xs">{index + 1}</span>
                      )}
                    </span>
                    {label}
                  </li>
                );
              })}
            </ol>
          </div>
        ) : (
          <div className="min-w-0 space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="kb-file-name">Name</Label>
              <Input
                id="kb-file-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Company handbook"
                className="border-slate-200"
              />
              <p className="text-xs text-slate-500">
                Optional — defaults to the file name or AI-suggested name.
              </p>
            </div>

            <div className="min-w-0 space-y-2">
              <Label>File</Label>
              <div
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    fileInputRef.current?.click();
                  }
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  handleFile(e.dataTransfer.files[0] ?? null);
                }}
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  "box-border flex w-full min-w-0 min-h-[120px] cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors",
                  dragOver
                    ? "border-indigo-400 bg-indigo-50/50"
                    : "border-slate-200 bg-slate-50/50 hover:border-indigo-200 hover:bg-indigo-50/30",
                )}
              >
                {file ? (
                  <>
                    <FileText className="h-8 w-8 text-indigo-600" />
                    <p className="max-w-full truncate px-2 text-sm font-medium text-slate-900">
                      {file.name}
                    </p>
                    <p className="text-xs text-slate-500">
                      {formatFileSize(file.size)}
                    </p>
                    <p className="text-xs text-indigo-600">
                      Click or drop to replace
                    </p>
                  </>
                ) : (
                  <>
                    <Upload className="h-8 w-8 text-slate-400" />
                    <p className="text-sm font-medium text-slate-700">
                      Drop a file here or click to browse
                    </p>
                    <p className="text-xs text-slate-500">
                      PDF, CSV, or DOCX — max 10 MB
                    </p>
                  </>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_MIME}
                className="sr-only"
                onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
              />
            </div>

            {error ? (
              <p
                className="break-words text-sm text-red-600"
                role="alert"
              >
                {error}
              </p>
            ) : null}
          </div>
        )}

        {!isExtracting ? (
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-indigo-600 hover:bg-indigo-700"
              disabled={!file}
              onClick={() => void submit()}
            >
              Extract and create
            </Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

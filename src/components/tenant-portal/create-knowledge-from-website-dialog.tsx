"use client";

import * as React from "react";
import { Check, Globe, Loader2 } from "lucide-react";
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
import { useCreateKnowledgeBaseFromWebsite } from "@/hooks/use-knowledge-bases";
import { cn } from "@/lib/utils";

const EXTRACTION_STEPS = [
  "Validating URL",
  "Crawling website",
  "Extracting knowledge with AI",
  "Creating knowledge base",
] as const;

function hostnameFromUrl(raw: string): string | null {
  try {
    const withProtocol = raw.trim().match(/^https?:\/\//)
      ? raw.trim()
      : `https://${raw.trim()}`;
    return new URL(withProtocol).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function normalizeUrlInput(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const withProtocol = trimmed.match(/^https?:\/\//)
      ? trimmed
      : `https://${trimmed}`;
    const parsed = new URL(withProtocol);
    if (!["http:", "https:"].includes(parsed.protocol)) return null;
    return parsed.href;
  } catch {
    return null;
  }
}

export type CreateKnowledgeFromWebsiteDialogProps = {
  tenantId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (kbId: string) => void;
};

export function CreateKnowledgeFromWebsiteDialog({
  tenantId,
  open,
  onOpenChange,
  onCreated,
}: CreateKnowledgeFromWebsiteDialogProps) {
  const [url, setUrl] = React.useState("");
  const [name, setName] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [isProcessing, setIsProcessing] = React.useState(false);
  const [activeStep, setActiveStep] = React.useState(0);

  const createMutation = useCreateKnowledgeBaseFromWebsite(tenantId);

  React.useEffect(() => {
    if (!open) {
      setUrl("");
      setName("");
      setError(null);
      setIsProcessing(false);
      setActiveStep(0);
    }
  }, [open]);

  React.useEffect(() => {
    if (!isProcessing) return;

    setActiveStep(0);
    const timers = [
      window.setTimeout(() => setActiveStep(1), 800),
      window.setTimeout(() => setActiveStep(2), 3500),
      window.setTimeout(() => setActiveStep(3), 8000),
    ];

    return () => {
      for (const id of timers) window.clearTimeout(id);
    };
  }, [isProcessing]);

  const handleOpenChange = (next: boolean) => {
    if (!next && isProcessing) return;
    onOpenChange(next);
  };

  const handleUrlBlur = () => {
    if (!name.trim() && url.trim()) {
      const host = hostnameFromUrl(url);
      if (host) setName(host);
    }
  };

  const submit = async () => {
    const normalized = normalizeUrlInput(url);
    if (!normalized) {
      setError("Enter a valid website URL (e.g. https://example.com).");
      return;
    }

    setError(null);
    setIsProcessing(true);

    try {
      const kb = await createMutation.mutateAsync({
        url: normalized,
        name: name.trim() || undefined,
      });
      onOpenChange(false);
      onCreated?.(kb.id);
    } catch (e) {
      setIsProcessing(false);
      setActiveStep(0);
      setError(
        e instanceof ApiClientError
          ? e.message
          : "Could not create knowledge base from website",
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className={cn(
          "max-h-[90vh] overflow-y-auto sm:max-w-lg",
          isProcessing && "[&>button]:hidden",
        )}
        onInteractOutside={(e) => {
          if (isProcessing) e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (isProcessing) e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>Create from website</DialogTitle>
          <DialogDescription>
            Enter a website URL. We will crawl the site, extract business
            knowledge with AI, and create a structured knowledge base.
          </DialogDescription>
        </DialogHeader>

        {isProcessing ? (
          <div className="space-y-5 py-4">
            <div className="flex items-center gap-3 rounded-lg border border-indigo-100 bg-indigo-50/60 px-4 py-3">
              <Loader2 className="h-5 w-5 shrink-0 animate-spin text-indigo-600" />
              <p className="text-sm text-indigo-900">
                Please keep this window open. Scraping cannot be cancelled once
                started.
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
              <Label htmlFor="kb-website-url">
                Website URL <span className="text-red-600">*</span>
              </Label>
              <div className="relative">
                <Globe className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  id="kb-website-url"
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  onBlur={handleUrlBlur}
                  placeholder="https://example.com"
                  className="border-slate-200 pl-9"
                />
              </div>
              <p className="text-xs text-slate-500">
                We crawl same-domain pages linked from the site footer.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="kb-website-name">Name</Label>
              <Input
                id="kb-website-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Acme Corp"
                className="border-slate-200"
              />
              <p className="text-xs text-slate-500">
                Optional — defaults to hostname or AI-suggested name.
              </p>
            </div>

            {error ? (
              <p className="break-words text-sm text-red-600" role="alert">
                {error}
              </p>
            ) : null}
          </div>
        )}

        {!isProcessing ? (
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
              disabled={!url.trim()}
              onClick={() => void submit()}
            >
              Scrape and create
            </Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

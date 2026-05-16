"use client";

import * as React from "react";
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  MessageCircle,
  PencilRuler,
  Sparkles,
  Tag,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCreateAgent } from "@/hooks/use-agents";
import { ApiClientError } from "@/lib/api/http";
import type { CreatedAgentSummary } from "@/lib/api/agents";
import { cn } from "@/lib/utils";
import type { WizardTemplateId } from "@/lib/validation/agents-create";

type BuildMode = "wizard" | "blank";

export type { CreatedAgentSummary };

type CreateAgentWizardProps = {
  tenantId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (agent: CreatedAgentSummary) => void;
};

const TEMPLATES: {
  id: WizardTemplateId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: "appointments", label: "Appointments", icon: Calendar },
  { id: "sales_assistant", label: "Sales Assistant", icon: Tag },
  { id: "customer_faq", label: "Customer FAQ", icon: MessageCircle },
  { id: "lead_generation", label: "Lead Generation", icon: Zap },
];

function StepIndicator({ step }: { step: 1 | 2 }) {
  const pillIndex = step - 1;
  return (
    <div className="flex items-center justify-center gap-2 pt-2">
      {Array.from({ length: 8 }, (_, i) => (
        <div
          key={i}
          className={cn(
            "rounded-full transition-colors",
            i === pillIndex
              ? "h-2 w-8 bg-indigo-600"
              : "h-2 w-2 bg-slate-200",
          )}
          aria-hidden
        />
      ))}
    </div>
  );
}

function resetState() {
  return {
    step: 1 as 1 | 2,
    buildMode: null as BuildMode | null,
    wizardTemplate: "appointments" as WizardTemplateId,
    name: "",
    submitting: false,
    error: null as string | null,
  };
}

/**
 * Two-step modal: choose Wizard vs Blank (+ template chips), then name the agent and create via API.
 */
export function CreateAgentWizard({
  tenantId,
  open,
  onOpenChange,
  onCreated,
}: CreateAgentWizardProps) {
  const createAgentMutation = useCreateAgent(tenantId ?? "");
  const [state, setState] = React.useState(resetState);

  React.useEffect(() => {
    if (!open) {
      setState(resetState());
    }
  }, [open]);

  const setPartial = (patch: Partial<typeof state>) =>
    setState((s) => ({ ...s, ...patch }));

  const goToStep2 = () => setPartial({ step: 2, error: null });

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setState(resetState());
    }
    onOpenChange(next);
  };

  const submit = async () => {
    if (!tenantId || !state.buildMode) return;
    const trimmed = state.name.trim();
    if (!trimmed) return;

    setPartial({ error: null });
    try {
      const agent = await createAgentMutation.mutateAsync({
        name: trimmed,
        buildMode: state.buildMode,
        wizardTemplate:
          state.buildMode === "wizard" ? state.wizardTemplate : undefined,
      });
      onCreated?.(agent);
      handleOpenChange(false);
    } catch (e) {
      setPartial({
        error:
          e instanceof ApiClientError
            ? e.message
            : e instanceof Error
              ? e.message
              : "Network error",
      });
    }
  };

  const submitting = createAgentMutation.isPending;
  const canContinueStep1 = state.buildMode !== null;
  const canSubmitName = state.name.trim().length > 0 && !submitting;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[min(90vh,720px)] max-w-3xl overflow-y-auto border-slate-200 p-0 sm:rounded-2xl">
        {state.step === 1 ? (
          <div className="p-6 sm:p-8">
            <DialogHeader className="space-y-2 pr-10 text-left">
              <DialogTitle className="text-xl font-semibold text-slate-900 sm:text-2xl">
                How would you like to build your Agent?
              </DialogTitle>
              <DialogDescription className="text-base text-slate-600">
                Choose a pre-built foundation or design every detail from a blank
                canvas.
              </DialogDescription>
            </DialogHeader>

            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              <Card
                className={cn(
                  "cursor-pointer border-2 transition-shadow hover:shadow-md",
                  state.buildMode === "wizard"
                    ? "border-indigo-600 ring-2 ring-indigo-600/15"
                    : "border-slate-200",
                )}
                onClick={() =>
                  setPartial({ buildMode: "wizard", error: null })
                }
              >
                <CardContent className="space-y-4 p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-semibold text-slate-900">
                      Agent Builder Wizard
                    </h3>
                    <Badge className="gap-1 border-0 bg-slate-900 text-white hover:bg-slate-900">
                      <Sparkles className="h-3 w-3" />
                      RECOMMENDED
                    </Badge>
                  </div>
                  <p className="text-sm text-slate-600">
                    Launch faster with a pre-built agent designed for real business
                    needs. You can still edit later.
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {TEMPLATES.map((t) => {
                      const Icon = t.icon;
                      const active = state.wizardTemplate === t.id;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setPartial({
                              buildMode: "wizard",
                              wizardTemplate: t.id,
                            });
                          }}
                          className={cn(
                            "flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-sm font-medium transition-colors",
                            active
                              ? "border-indigo-600 bg-indigo-50 text-indigo-900"
                              : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100",
                          )}
                        >
                          <Icon className="h-4 w-4 shrink-0 opacity-80" />
                          {t.label}
                        </button>
                      );
                    })}
                  </div>
                  <Button
                    type="button"
                    className="w-full bg-indigo-600 hover:bg-indigo-700"
                    disabled={!canContinueStep1 || state.buildMode !== "wizard"}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (state.buildMode === "wizard") goToStep2();
                    }}
                  >
                    Create Agent
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>

              <Card
                className={cn(
                  "cursor-pointer border-2 border-dashed transition-shadow hover:shadow-md",
                  state.buildMode === "blank"
                    ? "border-indigo-600 bg-indigo-50/30 ring-2 ring-indigo-600/15"
                    : "border-slate-300 bg-slate-50/50",
                )}
                onClick={() => setPartial({ buildMode: "blank", error: null })}
              >
                <CardContent className="flex h-full flex-col space-y-4 p-5">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full border border-slate-200 bg-white">
                    <PencilRuler className="h-6 w-6 text-slate-700" />
                  </div>
                  <h3 className="text-lg font-semibold text-slate-900">Blank Agent</h3>
                  <p className="flex-1 text-sm text-slate-600">
                    For developers or unique workflows. Start with a clean slate.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full border-slate-300 bg-white"
                    disabled={!canContinueStep1 || state.buildMode !== "blank"}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (state.buildMode === "blank") goToStep2();
                    }}
                  >
                    Create from Scratch
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            </div>

            {state.error ? (
              <p className="mt-4 text-center text-sm text-red-600">{state.error}</p>
            ) : null}
            <StepIndicator step={1} />
          </div>
        ) : (
          <div className="p-6 sm:p-8">
            <div className="mb-6 flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="-ml-2 gap-1 text-slate-600"
                onClick={() => setPartial({ step: 1, error: null })}
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
            </div>

            <div className="mx-auto flex max-w-md flex-col items-center text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl border border-slate-200 bg-slate-50">
                <span className="text-2xl" aria-hidden>
                  🤖
                </span>
              </div>
              <DialogHeader className="space-y-2 text-center">
                <DialogTitle className="text-xl font-semibold text-slate-900 sm:text-2xl">
                  What&apos;s your agent name?
                </DialogTitle>
                <DialogDescription className="text-base text-slate-600">
                  Give your AI agent a name.
                </DialogDescription>
              </DialogHeader>

              <div className="mt-6 w-full space-y-2 text-left">
                <Label htmlFor="agent-name" className="sr-only">
                  Agent name
                </Label>
                <Input
                  id="agent-name"
                  placeholder="e.g., My first agent"
                  value={state.name}
                  onChange={(e) => setPartial({ name: e.target.value })}
                  className="h-11 border-slate-200 text-base"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && canSubmitName) void submit();
                  }}
                />
              </div>

              {state.error ? (
                <p className="mt-3 text-sm text-red-600">{state.error}</p>
              ) : null}

              <Button
                type="button"
                className={cn(
                  "mt-6 min-w-[140px]",
                  canSubmitName
                    ? "bg-indigo-600 text-white hover:bg-indigo-700"
                    : "bg-slate-200 text-slate-800 hover:bg-slate-300",
                )}
                disabled={!canSubmitName}
                onClick={() => void submit()}
              >
                Continue
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>

            <StepIndicator step={2} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

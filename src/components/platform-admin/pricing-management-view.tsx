"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  computePackageCost,
  costingSettingsSchema,
  type CostingSettings,
} from "@/lib/db/costing-settings";
import type { ApiEnvelope } from "@/types/api";

type CostingSettingsResponse = CostingSettings & {
  createdAt: string;
  updatedAt: string;
};

type FieldKey = keyof CostingSettings;

const FIELD_LABELS: Record<FieldKey, string> = {
  hourlyRate: "Hourly rate",
  package1Name: "Package 1 name",
  package1Hours: "Package 1 hours",
  package1Price: "Package 1 price",
  package2Name: "Package 2 name",
  package2Hours: "Package 2 hours",
  package2Price: "Package 2 price",
  paygRate: "Pay-as-you-go rate",
};

function formatCurrency(value: number): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

function parseNumericInput(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const n = Number.parseFloat(trimmed);
  return Number.isFinite(n) ? n : null;
}

function fieldErrors(
  data: CostingSettings,
): Partial<Record<FieldKey, string>> {
  const parsed = costingSettingsSchema.safeParse(data);
  if (parsed.success) return {};

  const out: Partial<Record<FieldKey, string>> = {};
  for (const issue of parsed.error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && key in FIELD_LABELS) {
      out[key as FieldKey] = issue.message;
    }
  }
  return out;
}

function toFormSettings(data: CostingSettingsResponse): CostingSettings {
  return {
    hourlyRate: data.hourlyRate,
    package1Name: data.package1Name,
    package1Hours: data.package1Hours,
    package1Price: data.package1Price,
    package2Name: data.package2Name,
    package2Hours: data.package2Hours,
    package2Price: data.package2Price,
    paygRate: data.paygRate,
  };
}

async function fetchCosting(): Promise<CostingSettingsResponse> {
  const res = await fetch("/api/admin/costing", { credentials: "same-origin" });
  const body = (await res.json()) as ApiEnvelope<CostingSettingsResponse>;
  if (!body.success) {
    throw new Error(body.error?.message ?? "Failed to load pricing");
  }
  return body.data;
}

export function PricingManagementView() {
  const queryClient = useQueryClient();
  const [form, setForm] = React.useState<CostingSettings | null>(null);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = React.useState(false);
  const [touched, setTouched] = React.useState(false);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["admin-costing"],
    queryFn: fetchCosting,
  });

  React.useEffect(() => {
    if (data) setForm(toFormSettings(data));
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: async (payload: CostingSettings) => {
      const res = await fetch("/api/admin/costing", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(payload),
      });
      const body = (await res.json()) as ApiEnvelope<CostingSettingsResponse>;
      if (!body.success) {
        throw new Error(body.error?.message ?? "Failed to save pricing");
      }
      return body.data;
    },
    onSuccess: (updated) => {
      setForm(toFormSettings(updated));
      setSaveError(null);
      setSaveSuccess(true);
      setTouched(false);
      void queryClient.setQueryData(["admin-costing"], updated);
    },
    onError: (err: Error) => {
      setSaveSuccess(false);
      setSaveError(err.message);
    },
  });

  const errors = form && touched ? fieldErrors(form) : {};

  const package1Calculated =
    form != null
      ? computePackageCost(form.package1Hours, form.hourlyRate)
      : 0;
  const package2Calculated =
    form != null
      ? computePackageCost(form.package2Hours, form.hourlyRate)
      : 0;

  const setNumeric = (key: FieldKey, raw: string) => {
    setTouched(true);
    setSaveSuccess(false);
    const n = parseNumericInput(raw);
    setForm((prev) => (prev ? { ...prev, [key]: n ?? 0 } : prev));
  };

  const setText = (key: FieldKey, value: string) => {
    setTouched(true);
    setSaveSuccess(false);
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const handleSave = () => {
    if (!form) return;
    setTouched(true);
    setSaveSuccess(false);
    const parsed = costingSettingsSchema.safeParse(form);
    if (!parsed.success) {
      setSaveError("Fix validation errors before saving.");
      return;
    }
    setSaveError(null);
    saveMutation.mutate(parsed.data);
  };

  if (isLoading || !form) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>{(error as Error).message}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Costing management
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure hourly rates, prepaid packages, and pay-as-you-go pricing
          for the platform.
        </p>
      </div>

      {saveSuccess ? (
        <Alert className="border-emerald-500/40 bg-emerald-50 text-emerald-950">
          <AlertTitle>Saved</AlertTitle>
          <AlertDescription>
            Pricing configuration saved successfully.
          </AlertDescription>
        </Alert>
      ) : null}

      {saveError ? (
        <Alert variant="destructive">
          <AlertDescription>{saveError}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Pricing configuration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="hourlyRate">Hourly rate ($)</Label>
              <Input
                id="hourlyRate"
                type="number"
                min={0}
                step="0.01"
                value={form.hourlyRate}
                onChange={(e) => setNumeric("hourlyRate", e.target.value)}
              />
              {errors.hourlyRate ? (
                <p className="text-xs text-destructive">{errors.hourlyRate}</p>
              ) : null}
            </div>

            <Separator />

            <div className="space-y-4">
              <h3 className="text-sm font-medium text-foreground">Package 1</h3>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2 sm:col-span-3">
                  <Label htmlFor="package1Name">Name</Label>
                  <Input
                    id="package1Name"
                    value={form.package1Name}
                    onChange={(e) => setText("package1Name", e.target.value)}
                  />
                  {errors.package1Name ? (
                    <p className="text-xs text-destructive">
                      {errors.package1Name}
                    </p>
                  ) : null}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="package1Hours">Hours</Label>
                  <Input
                    id="package1Hours"
                    type="number"
                    min={0}
                    step="0.01"
                    value={form.package1Hours}
                    onChange={(e) =>
                      setNumeric("package1Hours", e.target.value)
                    }
                  />
                  {errors.package1Hours ? (
                    <p className="text-xs text-destructive">
                      {errors.package1Hours}
                    </p>
                  ) : null}
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="package1Price">Price ($)</Label>
                  <Input
                    id="package1Price"
                    type="number"
                    min={0}
                    step="0.01"
                    value={form.package1Price}
                    onChange={(e) =>
                      setNumeric("package1Price", e.target.value)
                    }
                  />
                  {errors.package1Price ? (
                    <p className="text-xs text-destructive">
                      {errors.package1Price}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>

            <Separator />

            <div className="space-y-4">
              <h3 className="text-sm font-medium text-foreground">Package 2</h3>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2 sm:col-span-3">
                  <Label htmlFor="package2Name">Name</Label>
                  <Input
                    id="package2Name"
                    value={form.package2Name}
                    onChange={(e) => setText("package2Name", e.target.value)}
                  />
                  {errors.package2Name ? (
                    <p className="text-xs text-destructive">
                      {errors.package2Name}
                    </p>
                  ) : null}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="package2Hours">Hours</Label>
                  <Input
                    id="package2Hours"
                    type="number"
                    min={0}
                    step="0.01"
                    value={form.package2Hours}
                    onChange={(e) =>
                      setNumeric("package2Hours", e.target.value)
                    }
                  />
                  {errors.package2Hours ? (
                    <p className="text-xs text-destructive">
                      {errors.package2Hours}
                    </p>
                  ) : null}
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="package2Price">Price ($)</Label>
                  <Input
                    id="package2Price"
                    type="number"
                    min={0}
                    step="0.01"
                    value={form.package2Price}
                    onChange={(e) =>
                      setNumeric("package2Price", e.target.value)
                    }
                  />
                  {errors.package2Price ? (
                    <p className="text-xs text-destructive">
                      {errors.package2Price}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>

            <Separator />

            <div className="space-y-2">
              <Label htmlFor="paygRate">Pay-as-you-go rate ($/hour)</Label>
              <Input
                id="paygRate"
                type="number"
                min={0}
                step="0.01"
                value={form.paygRate}
                onChange={(e) => setNumeric("paygRate", e.target.value)}
              />
              {errors.paygRate ? (
                <p className="text-xs text-destructive">{errors.paygRate}</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Charged on the next billing cycle for postpaid hours actually
                  used (up to 30h) after package hours are exhausted — not a
                  flat 30-hour charge.
                </p>
              )}
            </div>

            <Button
              type="button"
              className="w-full sm:w-auto"
              disabled={saveMutation.isPending}
              onClick={handleSave}
            >
              {saveMutation.isPending ? (
                <>
                  <Loader2 className="animate-spin" />
                  Saving…
                </>
              ) : (
                "Save pricing"
              )}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pricing summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-4">
              <p className="font-medium text-foreground">{form.package1Name}</p>
              <p className="text-muted-foreground">
                Calculated:{" "}
                <span className="font-medium tabular-nums text-foreground">
                  {formatCurrency(package1Calculated)}
                </span>
                <span className="mx-1">·</span>
                Configured:{" "}
                <span className="font-medium tabular-nums text-foreground">
                  {formatCurrency(form.package1Price)}
                </span>
              </p>
              <p className="text-xs text-muted-foreground">
                {form.package1Hours} hrs × {formatCurrency(form.hourlyRate)}/hr
              </p>
            </div>

            <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-4">
              <p className="font-medium text-foreground">{form.package2Name}</p>
              <p className="text-muted-foreground">
                Calculated:{" "}
                <span className="font-medium tabular-nums text-foreground">
                  {formatCurrency(package2Calculated)}
                </span>
                <span className="mx-1">·</span>
                Configured:{" "}
                <span className="font-medium tabular-nums text-foreground">
                  {formatCurrency(form.package2Price)}
                </span>
              </p>
              <p className="text-xs text-muted-foreground">
                {form.package2Hours} hrs × {formatCurrency(form.hourlyRate)}/hr
              </p>
            </div>

            <Separator />

            <div className="space-y-1">
              <p className="font-medium text-foreground">Pay-as-you-go</p>
              <p className="text-muted-foreground">
                {formatCurrency(form.paygRate)}/hour after package hours are used
              </p>
            </div>

            <div className="space-y-1">
              <p className="font-medium text-foreground">Base hourly rate</p>
              <p className="text-muted-foreground">
                {formatCurrency(form.hourlyRate)}/hour
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

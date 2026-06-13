"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Trash2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import type { AdminTenantDetail } from "@/lib/services/platform-tenants";
import type { ApiEnvelope } from "@/types/api";
import { normalizeTenantPlanCode } from "@/lib/db/tenant-plans";
import { useAdminPlanLabels } from "@/hooks/use-admin-plan-labels";

type TenantDetailViewProps = {
  tenantId: string;
};

async function fetchTenant(tenantId: string): Promise<AdminTenantDetail> {
  const res = await fetch(`/api/admin/tenants/${tenantId}`, {
    credentials: "same-origin",
  });
  const body = (await res.json()) as ApiEnvelope<AdminTenantDetail>;
  if (!body.success) throw new Error(body.error?.message ?? "Failed to load tenant");
  return body.data;
}

async function patchTenant(
  tenantId: string,
  body: Record<string, unknown>,
): Promise<AdminTenantDetail> {
  const res = await fetch(`/api/admin/tenants/${tenantId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(body),
  });
  const responseBody = (await res.json()) as ApiEnvelope<AdminTenantDetail>;
  if (!responseBody.success) {
    throw new Error(responseBody.error?.message ?? "Update failed");
  }
  return responseBody.data;
}

export function TenantDetailView({ tenantId }: TenantDetailViewProps) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: tenant, isLoading, isError, error } = useQuery({
    queryKey: ["admin-tenant", tenantId],
    queryFn: () => fetchTenant(tenantId),
  });

  const [form, setForm] = React.useState<AdminTenantDetail | null>(null);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = React.useState(false);
  const [resetOpen, setResetOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [tempPassword, setTempPassword] = React.useState<string | null>(null);
  const [customPassword, setCustomPassword] = React.useState("");

  const { options: planOptions } = useAdminPlanLabels();

  React.useEffect(() => {
    setForm(null);
  }, [tenantId]);

  React.useEffect(() => {
    if (tenant) {
      setForm((prev) => (prev === null ? tenant : prev));
    }
  }, [tenant]);

  const applyTenantUpdate = React.useCallback(
    (updated: AdminTenantDetail) => {
      setForm(updated);
      queryClient.setQueryData(["admin-tenant", tenantId], updated);
      void queryClient.invalidateQueries({ queryKey: ["admin-tenants"] });
    },
    [queryClient, tenantId],
  );

  const statusMutation = useMutation({
    mutationFn: (status: AdminTenantDetail["status"]) =>
      patchTenant(tenantId, { status }),
    onSuccess: (updated) => {
      applyTenantUpdate(updated);
      setSaveError(null);
    },
    onError: (err: Error) => setSaveError(err.message),
  });

  const saveMutation = useMutation({
    mutationFn: async (payload: AdminTenantDetail) =>
      patchTenant(tenantId, {
        accountName: payload.accountName,
        planCode: normalizeTenantPlanCode(payload.planCode),
        status: payload.status,
        maxAgents: payload.maxAgents,
        maxPhoneNumbers: payload.maxPhoneNumbers,
        settings: payload.settings,
      }),
    onSuccess: (updated) => {
      applyTenantUpdate(updated);
      setSaveError(null);
      setSaveSuccess(true);
      window.setTimeout(() => setSaveSuccess(false), 3000);
    },
    onError: (err: Error) => setSaveError(err.message),
  });

  const resetMutation = useMutation({
    mutationFn: async (password?: string) => {
      const res = await fetch(
        `/api/admin/tenants/${tenantId}/reset-password`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify(password ? { password } : {}),
        },
      );
      const body = (await res.json()) as ApiEnvelope<{
        email: string;
        temporaryPassword: string;
      }>;
      if (!body.success) throw new Error(body.error?.message ?? "Reset failed");
      return body.data;
    },
    onSuccess: (data) => {
      setTempPassword(data.temporaryPassword);
      setCustomPassword("");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/admin/tenants/${tenantId}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      const body = (await res.json()) as ApiEnvelope<{ deleted: boolean }>;
      if (!body.success) throw new Error(body.error?.message ?? "Delete failed");
      return body.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-tenants"] });
      router.push("/admin/tenants");
      router.refresh();
    },
  });

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

  const patchSettings = (
    section: "company" | "contact" | "billing",
    field: string,
    value: string,
  ) => {
    setForm((prev) =>
      prev
        ? {
            ...prev,
            settings: {
              ...prev.settings,
              [section]: {
                ...prev.settings[section],
                [field]: value,
              },
            },
          }
        : prev,
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start gap-4">
        <Button type="button" variant="ghost" size="sm" asChild>
          <Link href="/admin/tenants">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Tenants
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">
              {form.accountName}
            </h1>
            <Badge variant="outline" className="font-mono">
              {form.displayTenantId}
            </Badge>
            <Badge
              variant={
                form.status === "ACTIVE"
                  ? "success"
                  : form.status === "SUSPENDED"
                    ? "warning"
                    : "muted"
              }
            >
              {form.status}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Created {new Date(form.createdAt).toLocaleDateString()}
            {form.primaryAdminEmail
              ? ` · Admin: ${form.primaryAdminEmail}`
              : null}
          </p>
        </div>
      </div>

      {saveError ? (
        <Alert variant="destructive">
          <AlertDescription>{saveError}</AlertDescription>
        </Alert>
      ) : null}

      {saveSuccess ? (
        <Alert>
          <AlertDescription>Tenant settings saved.</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Company information</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="accountName">Account name</Label>
                <Input
                  id="accountName"
                  value={form.accountName}
                  onChange={(e) =>
                    setForm({ ...form, accountName: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="companyName">Company name</Label>
                <Input
                  id="companyName"
                  value={form.settings.company.name}
                  onChange={(e) =>
                    patchSettings("company", "name", e.target.value)
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="website">Website</Label>
                <Input
                  id="website"
                  value={form.settings.company.website}
                  onChange={(e) =>
                    patchSettings("company", "website", e.target.value)
                  }
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Contact details</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="contactName">Contact name</Label>
                <Input
                  id="contactName"
                  value={form.settings.contact.name}
                  onChange={(e) =>
                    patchSettings("contact", "name", e.target.value)
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tenantEmail">Email</Label>
                <Input
                  id="tenantEmail"
                  type="email"
                  readOnly
                  value={form.primaryAdminEmail ?? ""}
                  className="bg-muted/50"
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="contactPhone">Phone</Label>
                <Input
                  id="contactPhone"
                  value={form.settings.contact.phone}
                  onChange={(e) =>
                    patchSettings("contact", "phone", e.target.value)
                  }
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Billing information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="billingAddress">Address</Label>
                <Textarea
                  id="billingAddress"
                  rows={3}
                  value={form.settings.billing.address}
                  onChange={(e) =>
                    patchSettings("billing", "address", e.target.value)
                  }
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="taxId">Tax ID</Label>
                  <Input
                    id="taxId"
                    value={form.settings.billing.taxId}
                    onChange={(e) =>
                      patchSettings("billing", "taxId", e.target.value)
                    }
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="billingNotes">Notes</Label>
                  <Textarea
                    id="billingNotes"
                    rows={2}
                    value={form.settings.billing.notes}
                    onChange={(e) =>
                      patchSettings("billing", "notes", e.target.value)
                    }
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Current plan</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Select
                value={normalizeTenantPlanCode(form.planCode)}
                onValueChange={(v) => setForm({ ...form, planCode: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {planOptions.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={form.status}
                  disabled={statusMutation.isPending}
                  onValueChange={(v) => {
                    const status = v as AdminTenantDetail["status"];
                    const previous = form.status;
                    setForm({ ...form, status });
                    setSaveError(null);
                    statusMutation.mutate(status, {
                      onError: () => {
                        setForm((current) =>
                          current ? { ...current, status: previous } : current,
                        );
                      },
                    });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ACTIVE">Active</SelectItem>
                    <SelectItem value="INACTIVE">Inactive</SelectItem>
                    <SelectItem value="SUSPENDED">Suspended</SelectItem>
                  </SelectContent>
                </Select>
                {statusMutation.isPending ? (
                  <p className="text-xs text-muted-foreground">Updating status…</p>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Usage statistics</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total calls</span>
                <span className="font-medium tabular-nums">
                  {form.totalCalls.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Minutes (all time)</span>
                <span className="font-medium tabular-nums">
                  {form.minutesUsedAllTime.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Minutes (30d)</span>
                <span className="font-medium tabular-nums">
                  {form.minutesUsed30d.toLocaleString()}
                </span>
              </div>
              <Separator />
              <div className="flex justify-between">
                <span className="text-muted-foreground">Voice agents</span>
                <span className="font-medium tabular-nums">
                  {form.activeAgents} active / {form.agentCount} total
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Entitlements</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="space-y-2">
                <Label htmlFor="maxAgents">Max agents</Label>
                <Input
                  id="maxAgents"
                  type="number"
                  min={0}
                  value={form.maxAgents}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      maxAgents: Math.max(
                        0,
                        Number.parseInt(e.target.value, 10) || 0,
                      ),
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="maxPhoneNumbers">Max phone numbers</Label>
                <Input
                  id="maxPhoneNumbers"
                  type="number"
                  min={0}
                  value={form.maxPhoneNumbers}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      maxPhoneNumbers: Math.max(
                        0,
                        Number.parseInt(e.target.value, 10) || 0,
                      ),
                    })
                  }
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Actions</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <Button
                type="button"
                disabled={saveMutation.isPending}
                onClick={() => saveMutation.mutate(form)}
              >
                {saveMutation.isPending ? (
                  <>
                    <Loader2 className="animate-spin" />
                    Saving…
                  </>
                ) : (
                  "Save changes"
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setTempPassword(null);
                  setResetOpen(true);
                }}
                disabled={!form.primaryAdminEmail}
              >
                Reset Tenant password
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 className="h-4 w-4" />
                Delete tenant
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset tenant admin password</DialogTitle>
            <DialogDescription>
              {form.primaryAdminEmail
                ? `Reset password for ${form.primaryAdminEmail}. Leave blank to generate a temporary password.`
                : "No tenant admin user found."}
            </DialogDescription>
          </DialogHeader>
          {tempPassword ? (
            <Alert>
              <AlertTitle>Temporary password</AlertTitle>
              <AlertDescription className="font-mono break-all">
                {tempPassword}
              </AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="newPassword">Custom password (optional)</Label>
              <Input
                id="newPassword"
                type="password"
                value={customPassword}
                onChange={(e) => setCustomPassword(e.target.value)}
                placeholder="Min 8 characters"
              />
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setResetOpen(false)}>
              {tempPassword ? "Done" : "Cancel"}
            </Button>
            {!tempPassword ? (
              <Button
                type="button"
                disabled={resetMutation.isPending}
                onClick={() =>
                  resetMutation.mutate(
                    customPassword.length >= 8 ? customPassword : undefined,
                  )
                }
              >
                {resetMutation.isPending ? "Resetting…" : "Reset password"}
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete tenant</DialogTitle>
            <DialogDescription>
              Soft-delete {form.accountName}? The tenant will be marked inactive
              and hidden from the platform. This cannot be undone from the admin
              UI.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => deleteMutation.mutate()}
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete tenant"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

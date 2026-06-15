"use client";

import * as React from "react";
import { Clock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  useRoutingSettings,
  useUpdateRoutingSettings,
} from "@/hooks/use-routing-settings";
import { ApiClientError } from "@/lib/api/http";
import {
  DEFAULT_AFTER_HOURS_MESSAGE,
  DEFAULT_INACTIVE_MESSAGE,
  defaultRoutingHolidays,
  type FallbackType,
  type RoutingHolidaysConfig,
  type TenantRoutingSettingsV1,
} from "@/lib/tenant-portal/routing-settings-v1";
import { routingSettingsBodyFromV1 } from "@/lib/validation/routing-settings";
import { RoutingHolidaysEditor } from "@/components/tenant-portal/routing-holidays-editor";

export type RoutingFlowBuilderProps = {
  tenantId: string;
};

type LocalFormState = {
  businessHoursEnabled: boolean;
  weekdayStart: string;
  weekdayEnd: string;
  holidays: RoutingHolidaysConfig;
  afterHoursFallback: FallbackType;
  afterHoursMessage: string;
  afterHoursPhone: string;
  inactiveFallback: FallbackType;
  inactiveMessage: string;
  inactivePhone: string;
  timezone: string;
};

function toLocalState(
  routing: TenantRoutingSettingsV1,
  timezone: string,
): LocalFormState {
  return {
    businessHoursEnabled: routing.businessHours.enabled,
    weekdayStart: routing.businessHours.weekdayStart,
    weekdayEnd: routing.businessHours.weekdayEnd,
    holidays: routing.holidays ?? defaultRoutingHolidays(),
    afterHoursFallback: routing.afterHoursFallback.type,
    afterHoursMessage:
      routing.afterHoursFallback.message ?? DEFAULT_AFTER_HOURS_MESSAGE,
    afterHoursPhone: routing.afterHoursFallback.forwardTo ?? "",
    inactiveFallback: routing.inactiveFallback.type,
    inactiveMessage:
      routing.inactiveFallback.message ?? DEFAULT_INACTIVE_MESSAGE,
    inactivePhone: routing.inactiveFallback.forwardTo ?? "",
    timezone,
  };
}

function toRoutingSettings(local: LocalFormState): TenantRoutingSettingsV1 {
  const afterHoursFallback =
    local.afterHoursFallback === "PHONE_FORWARD"
      ? {
          type: local.afterHoursFallback,
          forwardTo: local.afterHoursPhone.trim(),
        }
      : {
          type: local.afterHoursFallback,
          message: local.afterHoursMessage.trim(),
        };

  const inactiveFallback =
    local.inactiveFallback === "PHONE_FORWARD"
      ? {
          type: local.inactiveFallback,
          forwardTo: local.inactivePhone.trim(),
        }
      : {
          type: local.inactiveFallback,
          message: local.inactiveMessage.trim(),
        };

  return {
    version: 1,
    businessHours: {
      enabled: local.businessHoursEnabled,
      weekdayStart: local.weekdayStart,
      weekdayEnd: local.weekdayEnd,
    },
    holidays: local.holidays,
    afterHoursFallback,
    inactiveFallback,
  };
}

/**
 * Routing flow editor: business hours, after-hours fallback, and inactive-account fallback.
 */
export function RoutingFlowBuilder({ tenantId }: RoutingFlowBuilderProps) {
  const { data, isPending, error } = useRoutingSettings(tenantId);
  const updateMutation = useUpdateRoutingSettings(tenantId);

  const [local, setLocal] = React.useState<LocalFormState | null>(null);
  const [saveError, setSaveError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (data) {
      setLocal(toLocalState(data.routing, data.timezone));
      setSaveError(null);
    }
  }, [data]);

  const patchLocal = (patch: Partial<LocalFormState>) => {
    setLocal((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  const resetLocal = () => {
    if (data) {
      setLocal(toLocalState(data.routing, data.timezone));
      setSaveError(null);
    }
  };

  const handleSave = async () => {
    if (!local) return;
    setSaveError(null);
    const routing = toRoutingSettings(local);
    try {
      await updateMutation.mutateAsync({
        routing: routingSettingsBodyFromV1(routing),
      });
    } catch (e) {
      setSaveError(
        e instanceof ApiClientError ? e.message : "Could not save routing settings",
      );
    }
  };

  if (isPending || !local) {
    return (
      <div className="flex min-h-[240px] items-center justify-center text-slate-600">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden />
        Loading routing settings…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        Could not load routing settings. Please refresh and try again.
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
          Routing Flow
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-600 sm:text-base">
          Configure weekday business hours, US federal and custom holiday
          closures, and fallbacks for after-hours or inactive accounts. Live
          voice agents connect only during open hours when business hours are
          enabled.
        </p>
      </div>

      <Card data-tour="routing-hours" className="border-slate-200/90 shadow-sm">
        <CardHeader className="border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700">
              <Clock className="h-4 w-4" aria-hidden />
            </span>
            <div>
              <CardTitle className="text-lg text-slate-900">
                Business hours
              </CardTitle>
              <CardDescription>
                Monday–Friday coverage in your tenant timezone. Weekends are
                always treated as after-hours when hours are enabled.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6 pt-6">
          <div className="flex items-center justify-between gap-4 rounded-lg border border-slate-200/90 bg-white p-4">
            <div className="space-y-1">
              <Label htmlFor="bh-enabled">Enable business hours</Label>
              <p className="text-sm text-slate-600">
                When off, calls connect to your voice agent 24/7.
              </p>
            </div>
            <Switch
              id="bh-enabled"
              checked={local.businessHoursEnabled}
              onCheckedChange={(checked) =>
                patchLocal({ businessHoursEnabled: checked })
              }
            />
          </div>

          <p className="text-sm text-slate-600">
            Timezone:{" "}
            <span className="font-medium text-slate-900">{local.timezone}</span>{" "}
            (uses tenant timezone from settings)
          </p>

          <div className="grid gap-6 sm:grid-cols-2 lg:max-w-2xl">
            <div className="space-y-2">
              <Label htmlFor="bh-start">Weekday start</Label>
              <Input
                id="bh-start"
                type="time"
                value={local.weekdayStart}
                disabled={!local.businessHoursEnabled}
                onChange={(e) => patchLocal({ weekdayStart: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bh-end">Weekday end</Label>
              <Input
                id="bh-end"
                type="time"
                value={local.weekdayEnd}
                disabled={!local.businessHoursEnabled}
                onChange={(e) => patchLocal({ weekdayEnd: e.target.value })}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <RoutingHolidaysEditor
        holidays={local.holidays}
        businessHoursEnabled={local.businessHoursEnabled}
        onChange={(holidays) => patchLocal({ holidays })}
      />

      <Card
        data-tour="routing-fallback"
        className="border-amber-200/80 bg-amber-50/20 shadow-sm"
      >
        <CardHeader className="border-b border-amber-100/80">
          <CardTitle className="text-lg text-slate-900">Fallback</CardTitle>
          <CardDescription className="text-slate-700">
            When a call arrives outside business hours or when the account is
            inactive, callers never reach live agents — use these paths instead.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-8 pt-6 lg:grid-cols-2">
          <div className="space-y-4 rounded-lg border border-slate-200/90 bg-white p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-900">
              After-hours fallback
            </h3>
            <div className="space-y-2">
              <Label>Action type</Label>
              <Select
                value={local.afterHoursFallback}
                onValueChange={(v) =>
                  patchLocal({ afterHoursFallback: v as FallbackType })
                }
              >
                <SelectTrigger className="bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MESSAGE">Message (TwiML Say)</SelectItem>
                  <SelectItem value="PHONE_FORWARD">
                    Transfer to phone number
                  </SelectItem>
                  <SelectItem value="BOSTEL_SUPPORT">Bostel support line</SelectItem>
                  <SelectItem value="VOICEMAIL">Voicemail</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {(local.afterHoursFallback === "MESSAGE" ||
              local.afterHoursFallback === "VOICEMAIL" ||
              local.afterHoursFallback === "BOSTEL_SUPPORT") && (
              <div className="space-y-2">
                <Label>Caller-facing script</Label>
                <Textarea
                  className="min-h-[100px]"
                  value={local.afterHoursMessage}
                  onChange={(e) =>
                    patchLocal({ afterHoursMessage: e.target.value })
                  }
                />
              </div>
            )}
            {local.afterHoursFallback === "PHONE_FORWARD" && (
              <div className="space-y-2">
                <Label>Forward to (E.164)</Label>
                <Input
                  value={local.afterHoursPhone}
                  onChange={(e) =>
                    patchLocal({ afterHoursPhone: e.target.value })
                  }
                />
              </div>
            )}
          </div>

          <div className="space-y-4 rounded-lg border border-slate-200/90 bg-white p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-900">
              Inactive account fallback
            </h3>
            <div className="space-y-2">
              <Label>Action type</Label>
              <Select
                value={local.inactiveFallback}
                onValueChange={(v) =>
                  patchLocal({ inactiveFallback: v as FallbackType })
                }
              >
                <SelectTrigger className="bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MESSAGE">Message (TwiML Say)</SelectItem>
                  <SelectItem value="PHONE_FORWARD">
                    Transfer to phone number
                  </SelectItem>
                  <SelectItem value="BOSTEL_SUPPORT">Bostel support line</SelectItem>
                  <SelectItem value="VOICEMAIL">Voicemail</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {local.inactiveFallback !== "PHONE_FORWARD" ? (
              <div className="space-y-2">
                <Label>Message</Label>
                <Textarea
                  className="min-h-[100px]"
                  value={local.inactiveMessage}
                  onChange={(e) =>
                    patchLocal({ inactiveMessage: e.target.value })
                  }
                />
              </div>
            ) : (
              <div className="space-y-2">
                <Label>Forward to (E.164)</Label>
                <Input
                  placeholder="+1…"
                  value={local.inactivePhone}
                  onChange={(e) =>
                    patchLocal({ inactivePhone: e.target.value })
                  }
                />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {saveError ? (
        <p className="text-sm text-red-600" role="alert">
          {saveError}
        </p>
      ) : null}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={resetLocal}>
          Discard
        </Button>
        <Button
          type="button"
          onClick={handleSave}
          disabled={updateMutation.isPending}
        >
          {updateMutation.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
              Saving…
            </>
          ) : (
            "Save flow"
          )}
        </Button>
      </div>
    </div>
  );
}

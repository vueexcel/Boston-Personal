"use client";

import * as React from "react";
import { CalendarDays, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type {
  CustomHoliday,
  RoutingHolidaysConfig,
} from "@/lib/tenant-portal/routing-settings-v1";
import {
  FEDERAL_HOLIDAY_IDS,
  getFederalHolidaysForYear,
  type FederalHolidayId,
} from "@/lib/tenant-portal/us-federal-holidays";

export type RoutingHolidaysEditorProps = {
  holidays: RoutingHolidaysConfig;
  businessHoursEnabled: boolean;
  onChange: (holidays: RoutingHolidaysConfig) => void;
};

type CustomHolidayDraft = {
  id: string;
  name: string;
  kind: "annual" | "once";
  dateValue: string;
  enabled: boolean;
};

function formatObservedDate(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(dt);
}

function formatCustomSchedule(entry: CustomHoliday): string {
  if (entry.kind === "once" && entry.date) {
    return formatObservedDate(entry.date);
  }
  if (entry.kind === "annual" && entry.monthDay) {
    const [m, d] = entry.monthDay.split("-").map(Number);
    const dt = new Date(Date.UTC(2000, m - 1, d));
    return `${new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    }).format(dt)} annually`;
  }
  return "—";
}

function annualToDateInput(monthDay: string): string {
  return `2000-${monthDay}`;
}

function dateInputToAnnual(dateValue: string): string {
  return dateValue.slice(5);
}

function emptyDraft(): CustomHolidayDraft {
  return {
    id: crypto.randomUUID(),
    name: "",
    kind: "once",
    dateValue: "",
    enabled: true,
  };
}

function draftFromHoliday(entry: CustomHoliday): CustomHolidayDraft {
  return {
    id: entry.id,
    name: entry.name,
    kind: entry.kind,
    dateValue:
      entry.kind === "once"
        ? (entry.date ?? "")
        : entry.monthDay
          ? annualToDateInput(entry.monthDay)
          : "",
    enabled: entry.enabled,
  };
}

function draftToHoliday(draft: CustomHolidayDraft): CustomHoliday | null {
  const name = draft.name.trim();
  if (name.length < 2 || !draft.dateValue) return null;
  if (draft.kind === "once") {
    return {
      id: draft.id,
      name,
      kind: "once",
      date: draft.dateValue,
      enabled: draft.enabled,
    };
  }
  return {
    id: draft.id,
    name,
    kind: "annual",
    monthDay: dateInputToAnnual(draft.dateValue),
    enabled: draft.enabled,
  };
}

export function RoutingHolidaysEditor({
  holidays,
  businessHoursEnabled,
  onChange,
}: RoutingHolidaysEditorProps) {
  const currentYear = new Date().getFullYear();
  const federalRows = getFederalHolidaysForYear(currentYear, holidays.federal);

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<CustomHolidayDraft>(emptyDraft);
  const [dialogError, setDialogError] = React.useState<string | null>(null);

  const patchHolidays = (patch: Partial<RoutingHolidaysConfig>) => {
    onChange({ ...holidays, ...patch });
  };

  const setFederalEnabled = (id: FederalHolidayId, enabled: boolean) => {
    patchHolidays({
      federal: { ...holidays.federal, [id]: enabled },
    });
  };

  const setAllFederal = (enabled: boolean) => {
    const federal = Object.fromEntries(
      FEDERAL_HOLIDAY_IDS.map((id) => [id, enabled]),
    ) as Record<FederalHolidayId, boolean>;
    patchHolidays({ federal });
  };

  const openAddDialog = () => {
    setDraft(emptyDraft());
    setDialogError(null);
    setDialogOpen(true);
  };

  const openEditDialog = (entry: CustomHoliday) => {
    setDraft(draftFromHoliday(entry));
    setDialogError(null);
    setDialogOpen(true);
  };

  const saveDraft = () => {
    const parsed = draftToHoliday(draft);
    if (!parsed) {
      setDialogError("Enter a name (2+ characters) and a valid date.");
      return;
    }
    const exists = holidays.custom.some((c) => c.id === parsed.id);
    const custom = exists
      ? holidays.custom.map((c) => (c.id === parsed.id ? parsed : c))
      : [...holidays.custom, parsed];
    patchHolidays({ custom });
    setDialogOpen(false);
  };

  const deleteCustom = (id: string) => {
    if (
      !window.confirm("Remove this custom holiday from your routing schedule?")
    ) {
      return;
    }
    patchHolidays({
      custom: holidays.custom.filter((c) => c.id !== id),
    });
  };

  const toggleCustomEnabled = (id: string, enabled: boolean) => {
    patchHolidays({
      custom: holidays.custom.map((c) =>
        c.id === id ? { ...c, enabled } : c,
      ),
    });
  };

  const hoursOff = !businessHoursEnabled;

  return (
    <Card
      data-tour="routing-holidays"
      className="border-slate-200/90 shadow-sm"
    >
      <CardHeader className="border-b border-slate-100 bg-slate-50/50">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
            <CalendarDays className="h-4 w-4" aria-hidden />
          </span>
          <div>
            <CardTitle className="text-lg text-slate-900">
              National &amp; federal holidays
            </CardTitle>
            <CardDescription>
              Close on US federal holidays and add company-specific closures.
              Holidays apply only when business hours are enabled.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-8 pt-6">
        <div className="flex items-center justify-between gap-4 rounded-lg border border-slate-200/90 bg-white p-4">
          <div className="space-y-1">
            <Label htmlFor="federal-enabled">Close on US federal holidays</Label>
            <p className="text-sm text-slate-600">
              Uses standard federal observed dates for {currentYear}. Toggle
              individual holidays below.
            </p>
          </div>
          <Switch
            id="federal-enabled"
            checked={holidays.federalEnabled}
            disabled={hoursOff}
            onCheckedChange={(checked) =>
              patchHolidays({ federalEnabled: checked })
            }
          />
        </div>

        {hoursOff ? (
          <p className="text-sm text-amber-800">
            Enable business hours above to configure holiday closures.
          </p>
        ) : null}

        {holidays.federalEnabled && !hoursOff ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-900">
                Federal holidays ({currentYear})
              </h3>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setAllFederal(true)}
                >
                  Enable all
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setAllFederal(false)}
                >
                  Disable all
                </Button>
              </div>
            </div>
            <div className="overflow-hidden rounded-lg border border-slate-200/90">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Holiday</TableHead>
                    <TableHead>Observed date</TableHead>
                    <TableHead className="w-[100px] text-right">
                      Closed
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {federalRows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium text-slate-900">
                        {row.name}
                      </TableCell>
                      <TableCell className="text-slate-600">
                        {formatObservedDate(row.observedDate)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Switch
                          checked={row.enabled}
                          aria-label={`${row.name} closed`}
                          onCheckedChange={(checked) =>
                            setFederalEnabled(row.id, checked)
                          }
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        ) : null}

        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-900">
              Custom holidays
            </h3>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={hoursOff}
              onClick={openAddDialog}
            >
              <Plus className="mr-1.5 h-4 w-4" aria-hidden />
              Add holiday
            </Button>
          </div>

          {holidays.custom.length === 0 ? (
            <p className="text-sm text-slate-600">
              No custom closures yet. Add one-time dates or annual recurring
              days (e.g. company retreat or Christmas Eve).
            </p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-slate-200/90">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Schedule</TableHead>
                    <TableHead className="w-[90px]">Closed</TableHead>
                    <TableHead className="w-[100px] text-right">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {holidays.custom.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="font-medium text-slate-900">
                        {entry.name}
                      </TableCell>
                      <TableCell className="text-slate-600">
                        {formatCustomSchedule(entry)}
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={entry.enabled}
                          disabled={hoursOff}
                          aria-label={`${entry.name} closed`}
                          onCheckedChange={(checked) =>
                            toggleCustomEnabled(entry.id, checked)
                          }
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            disabled={hoursOff}
                            aria-label={`Edit ${entry.name}`}
                            onClick={() => openEditDialog(entry)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-red-600 hover:text-red-700"
                            disabled={hoursOff}
                            aria-label={`Delete ${entry.name}`}
                            onClick={() => deleteCustom(entry.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {holidays.custom.some((c) => c.id === draft.id)
                ? "Edit custom holiday"
                : "Add custom holiday"}
            </DialogTitle>
            <DialogDescription>
              One-time closures use a specific date. Annual holidays repeat
              every year on the same month and day.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="holiday-name">Name</Label>
              <Input
                id="holiday-name"
                value={draft.name}
                placeholder="e.g. Company retreat"
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, name: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Schedule type</Label>
              <Select
                value={draft.kind}
                onValueChange={(v) =>
                  setDraft((prev) => ({
                    ...prev,
                    kind: v as "annual" | "once",
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="once">One-time date</SelectItem>
                  <SelectItem value="annual">Repeats annually</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="holiday-date">
                {draft.kind === "once" ? "Date" : "Month and day (any year)"}
              </Label>
              <Input
                id="holiday-date"
                type="date"
                value={draft.dateValue}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, dateValue: e.target.value }))
                }
              />
            </div>
            <div className="flex items-center justify-between gap-4 rounded-lg border border-slate-200/90 p-3">
              <Label htmlFor="holiday-enabled">Closed on this day</Label>
              <Switch
                id="holiday-enabled"
                checked={draft.enabled}
                onCheckedChange={(checked) =>
                  setDraft((prev) => ({ ...prev, enabled: checked }))
                }
              />
            </div>
            {dialogError ? (
              <p className="text-sm text-red-600" role="alert">
                {dialogError}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button type="button" onClick={saveDraft}>
              Save holiday
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

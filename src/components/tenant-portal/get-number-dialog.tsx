"use client";

import * as React from "react";
import { Loader2, MapPin, Phone, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
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
import {
  useAvailablePhoneNumberCountries,
  useAvailablePhoneNumbers,
  useProvisionPhoneNumber,
} from "@/hooks/use-phone-numbers";
import type { AvailablePhoneNumberType } from "@/lib/integrations/twilio-phone-numbers";
import { formatPhoneNumberDisplay } from "@/lib/utils/phone-format";
import { ApiClientError } from "@/lib/api/http";
import { cn } from "@/lib/utils";

const DEFAULT_NUMBER_TYPES: AvailablePhoneNumberType[] = ["local"];

type GetNumberDialogProps = {
  tenantId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const NUMBER_TYPE_LABELS: Record<AvailablePhoneNumberType, string> = {
  local: "Local",
  toll_free: "Toll-free",
  mobile: "Mobile",
};

function formatLocation(
  locality: string | null,
  region: string | null,
  postalCode: string | null,
): string {
  const parts = [locality, region, postalCode].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : "—";
}

function capabilityBadges(capabilities: {
  voice: boolean;
  sms: boolean;
  mms: boolean;
}): React.ReactNode {
  const items: { label: string; on: boolean }[] = [
    { label: "Voice", on: capabilities.voice },
    { label: "SMS", on: capabilities.sms },
    { label: "MMS", on: capabilities.mms },
  ];
  const active = items.filter((i) => i.on);
  if (active.length === 0) {
    return <span className="text-xs text-slate-400">—</span>;
  }
  return (
    <div className="flex flex-wrap justify-end gap-1">
      {active.map((i) => (
        <Badge
          key={i.label}
          variant="secondary"
          className="text-[10px] font-normal"
        >
          {i.label}
        </Badge>
      ))}
    </div>
  );
}

export function GetNumberDialog({
  tenantId,
  open,
  onOpenChange,
}: GetNumberDialogProps) {
  const [country, setCountry] = React.useState("US");
  const [numberType, setNumberType] =
    React.useState<AvailablePhoneNumberType>("local");
  const [areaCode, setAreaCode] = React.useState("");
  const [searchEnabled, setSearchEnabled] = React.useState(false);
  const [selectedNumber, setSelectedNumber] = React.useState<string | null>(
    null,
  );
  const [error, setError] = React.useState<string | null>(null);

  const provisionMutation = useProvisionPhoneNumber(tenantId);

  const {
    data: countries = [],
    isLoading: countriesLoading,
    error: countriesError,
  } = useAvailablePhoneNumberCountries(tenantId, open);

  const selectedCountryMeta = React.useMemo(
    () => countries.find((c) => c.countryCode === country),
    [countries, country],
  );

  const availableTypes = React.useMemo(
    () => selectedCountryMeta?.numberTypes ?? DEFAULT_NUMBER_TYPES,
    [selectedCountryMeta?.numberTypes],
  );

  React.useEffect(() => {
    if (!open || countries.length === 0) return;
    const hasCurrent = countries.some((c) => c.countryCode === country);
    if (!hasCurrent) {
      const us = countries.find((c) => c.countryCode === "US");
      setCountry(us?.countryCode ?? countries[0]!.countryCode);
    }
  }, [open, countries, country]);

  React.useEffect(() => {
    if (!availableTypes.includes(numberType)) {
      setNumberType(availableTypes[0] ?? "local");
    }
  }, [availableTypes, numberType]);

  const showAreaCode =
    (country === "US" || country === "CA") && numberType === "local";

  const searchParams = React.useMemo(
    () => ({
      country,
      areaCode: showAreaCode ? areaCode.trim() : "",
      numberType,
    }),
    [country, areaCode, numberType, showAreaCode],
  );

  const {
    data: numbers = [],
    isFetching,
    error: searchError,
    refetch,
  } = useAvailablePhoneNumbers(tenantId, searchParams, searchEnabled && open);

  React.useEffect(() => {
    if (open) {
      setSearchEnabled(false);
      setSelectedNumber(null);
      setError(null);
    }
  }, [open]);

  React.useEffect(() => {
    setSelectedNumber(null);
  }, [numbers]);

  const runSearch = () => {
    setError(null);
    setSearchEnabled(true);
    void refetch();
  };

  const handleProvision = async () => {
    if (!selectedNumber) {
      setError("Select a phone number first.");
      return;
    }
    setError(null);
    try {
      await provisionMutation.mutateAsync({ phoneNumber: selectedNumber });
      onOpenChange(false);
      setAreaCode("");
      setSelectedNumber(null);
    } catch (e) {
      setError(
        e instanceof ApiClientError
          ? e.message
          : "Could not provision this number",
      );
    }
  };

  const countriesMessage =
    countriesError instanceof ApiClientError
      ? countriesError.message
      : countriesError instanceof Error
        ? countriesError.message
        : null;

  const searchMessage =
    searchError instanceof ApiClientError
      ? searchError.message
      : searchError instanceof Error
        ? searchError.message
        : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl gap-0 border-slate-200 p-0 sm:max-w-2xl">
        <DialogHeader className="border-b border-slate-100 px-6 py-4">
          <DialogTitle className="text-lg font-semibold text-slate-900">
            Get a phone number
          </DialogTitle>
          <p className="text-sm font-normal text-slate-500">
            Search live inventory from Twilio for your country and number type.
          </p>
        </DialogHeader>

        <div className="space-y-4 px-6 py-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="get-number-country">Country</Label>
              <Select
                value={country}
                onValueChange={setCountry}
                disabled={countriesLoading || countries.length === 0}
              >
                <SelectTrigger
                  id="get-number-country"
                  className="border-slate-200 bg-white"
                >
                  <SelectValue
                    placeholder={
                      countriesLoading ? "Loading countries…" : "Select country"
                    }
                  />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {countries.map((c) => (
                    <SelectItem key={c.countryCode} value={c.countryCode}>
                      {c.country} ({c.countryCode})
                      {c.beta ? " · beta" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {countriesMessage ? (
                <p className="text-xs text-red-600" role="alert">
                  {countriesMessage}
                </p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="get-number-type">Number type</Label>
              <Select
                value={numberType}
                onValueChange={(v) =>
                  setNumberType(v as AvailablePhoneNumberType)
                }
                disabled={availableTypes.length <= 1}
              >
                <SelectTrigger
                  id="get-number-type"
                  className="border-slate-200 bg-white"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableTypes.map((t) => (
                    <SelectItem key={t} value={t}>
                      {NUMBER_TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {showAreaCode ? (
              <div className="space-y-1.5">
                <Label htmlFor="get-number-area">Area code (NPA)</Label>
                <Input
                  id="get-number-area"
                  placeholder="e.g. 212"
                  className="border-slate-200 bg-white"
                  value={areaCode}
                  maxLength={3}
                  inputMode="numeric"
                  onChange={(e) =>
                    setAreaCode(e.target.value.replace(/\D/g, "").slice(0, 3))
                  }
                />
              </div>
            ) : (
              <div className="hidden lg:block" />
            )}

            <Button
              type="button"
              className="bg-indigo-600 text-white hover:bg-indigo-700 lg:col-span-4 lg:max-w-[200px] lg:justify-self-end"
              onClick={runSearch}
              disabled={isFetching || countriesLoading}
            >
              {isFetching ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Search className="mr-2 h-4 w-4" />
              )}
              Search numbers
            </Button>
          </div>

          <div className="overflow-hidden rounded-lg border border-slate-200">
            <div className="hidden border-b border-slate-100 bg-slate-50/80 px-4 py-2 text-xs font-medium uppercase tracking-wide text-slate-600 sm:grid sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,0.9fr)_auto] sm:gap-3">
              <span>Phone number</span>
              <span>Location</span>
              <span className="text-right">Capabilities</span>
              <span className="text-right">Action</span>
            </div>
            <div className="max-h-72 overflow-y-auto">
              {!searchEnabled ? (
                <p className="px-4 py-8 text-center text-sm text-slate-500">
                  Choose a country and click Search numbers to load available
                  inventory from Twilio.
                </p>
              ) : isFetching && numbers.length === 0 ? (
                <p className="flex items-center justify-center gap-2 px-4 py-8 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Searching Twilio…
                </p>
              ) : searchMessage ? (
                <p className="px-4 py-6 text-sm text-red-600" role="alert">
                  {searchMessage}
                </p>
              ) : numbers.length === 0 ? (
                <p className="px-4 py-6 text-sm text-slate-500">
                  No numbers found for {selectedCountryMeta?.country ?? country}{" "}
                  ({NUMBER_TYPE_LABELS[numberType]}
                  {showAreaCode && areaCode ? `, area ${areaCode}` : ""}). Try
                  another area code or number type.
                </p>
              ) : (
                <ul>
                  {numbers.map((n) => {
                    const selected = selectedNumber === n.phoneNumber;
                    const location = formatLocation(
                      n.locality,
                      n.region,
                      n.postalCode,
                    );
                    return (
                      <li
                        key={n.phoneNumber}
                        className={cn(
                          "border-b border-slate-100 px-4 py-3 last:border-0 sm:grid sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,0.9fr)_auto] sm:items-center sm:gap-3",
                          selected && "bg-indigo-50/60",
                        )}
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-900">
                            {formatPhoneNumberDisplay(n.phoneNumber)}
                          </p>
                          {n.friendlyName ? (
                            <p className="truncate text-xs text-slate-500">
                              {n.friendlyName}
                            </p>
                          ) : null}
                          <p className="mt-1 text-xs text-slate-400 sm:hidden">
                            {location}
                          </p>
                          <div className="mt-1 sm:hidden">
                            {capabilityBadges(n.capabilities)}
                          </div>
                        </div>
                        <div className="hidden min-w-0 items-center gap-1.5 text-sm text-slate-600 sm:flex">
                          <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                          <span className="truncate">{location}</span>
                        </div>
                        <div className="hidden sm:block">
                          {capabilityBadges(n.capabilities)}
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant={selected ? "default" : "outline"}
                          className={cn(
                            "mt-2 w-full sm:mt-0 sm:w-auto",
                            selected
                              ? "bg-indigo-600 text-white hover:bg-indigo-700"
                              : "border-slate-200",
                          )}
                          onClick={() => setSelectedNumber(n.phoneNumber)}
                        >
                          {selected ? "Selected" : "Select"}
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>

          {error ? (
            <p className="text-sm text-red-600" role="alert">
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter className="gap-2 border-t border-slate-100 px-6 py-4 sm:justify-end">
          <Button
            type="button"
            variant="outline"
            className="border-slate-200"
            onClick={() => onOpenChange(false)}
            disabled={provisionMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="bg-indigo-600 text-white hover:bg-indigo-700"
            disabled={!selectedNumber || provisionMutation.isPending}
            onClick={() => void handleProvision()}
          >
            {provisionMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Provisioning…
              </>
            ) : (
              <>
                <Phone className="mr-2 h-4 w-4" />
                Get number
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

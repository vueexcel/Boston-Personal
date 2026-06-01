"use client";

import * as React from "react";
import { Loader2, Phone, Sparkles, User } from "lucide-react";
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
  useAvailablePhoneNumbers,
  useProvisionPhoneNumber,
} from "@/hooks/use-phone-numbers";
import { formatPhoneNumberDisplay } from "@/lib/utils/phone-format";
import { ApiClientError } from "@/lib/api/http";
import { cn } from "@/lib/utils";

type GetNumberDialogProps = {
  tenantId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function GetNumberDialog({
  tenantId,
  open,
  onOpenChange,
}: GetNumberDialogProps) {
  const [country, setCountry] = React.useState("US");
  const [areaCode, setAreaCode] = React.useState("");
  const [searchEnabled, setSearchEnabled] = React.useState(false);
  const [selectedNumber, setSelectedNumber] = React.useState<string | null>(
    null,
  );
  const [error, setError] = React.useState<string | null>(null);

  const provisionMutation = useProvisionPhoneNumber(tenantId);

  const searchParams = React.useMemo(
    () => ({ country, areaCode: areaCode.trim() }),
    [country, areaCode],
  );

  const {
    data: numbers = [],
    isFetching,
    error: searchError,
    refetch,
  } = useAvailablePhoneNumbers(tenantId, searchParams, searchEnabled && open);

  React.useEffect(() => {
    if (open) {
      setSearchEnabled(true);
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

  const searchMessage =
    searchError instanceof ApiClientError
      ? searchError.message
      : searchError instanceof Error
        ? searchError.message
        : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg gap-0 border-slate-200 p-0 sm:max-w-lg">
        <DialogHeader className="border-b border-slate-100 px-6 py-4">
          <DialogTitle className="text-lg font-semibold text-slate-900">
            Phone Numbers
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 px-6 py-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <div className="space-y-1.5">
              <Label htmlFor="get-number-country">Country</Label>
              <Select value={country} onValueChange={setCountry}>
                <SelectTrigger
                  id="get-number-country"
                  className="border-slate-200 bg-white"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="US">US</SelectItem>
                  <SelectItem value="CA">CA</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="get-number-area">Area Code</Label>
              <Input
                id="get-number-area"
                placeholder="e.g., 212"
                className="border-slate-200 bg-white"
                value={areaCode}
                maxLength={3}
                inputMode="numeric"
                onChange={(e) =>
                  setAreaCode(e.target.value.replace(/\D/g, "").slice(0, 3))
                }
              />
            </div>
            <Button
              type="button"
              className="bg-indigo-600 text-white hover:bg-indigo-700"
              onClick={runSearch}
              disabled={isFetching}
            >
              {isFetching ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="mr-2 h-4 w-4" />
              )}
              Regenerate
            </Button>
          </div>

          <div className="overflow-hidden rounded-lg border border-slate-200">
            <div className="grid grid-cols-[1fr_auto] border-b border-slate-100 bg-slate-50/80 px-4 py-2 text-sm font-medium text-slate-700">
              <span>Phone Number</span>
              <span className="text-right">Action</span>
            </div>
            <div className="max-h-64 overflow-y-auto">
              {isFetching && numbers.length === 0 ? (
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
                  No numbers found. Try another area code or click Regenerate.
                </p>
              ) : (
                <ul>
                  {numbers.map((n) => {
                    const selected = selectedNumber === n.phoneNumber;
                    return (
                      <li
                        key={n.phoneNumber}
                        className={cn(
                          "grid grid-cols-[1fr_auto] items-center gap-3 border-b border-slate-100 px-4 py-3 last:border-0",
                          selected && "bg-indigo-50/60",
                        )}
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-700">
                            <User className="h-4 w-4" />
                          </span>
                          <span className="truncate text-sm font-medium text-slate-900">
                            {formatPhoneNumberDisplay(n.phoneNumber)}
                          </span>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant={selected ? "default" : "outline"}
                          className={
                            selected
                              ? "bg-indigo-600 text-white hover:bg-indigo-700"
                              : "border-slate-200"
                          }
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
                Get Number
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

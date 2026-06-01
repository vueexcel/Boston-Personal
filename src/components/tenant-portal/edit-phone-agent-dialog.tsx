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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useUpdatePhoneNumber } from "@/hooks/use-phone-numbers";
import type { PhoneNumberRow } from "@/lib/services/phone-numbers";
import { formatPhoneNumberDisplay } from "@/lib/utils/phone-format";
import { ApiClientError } from "@/lib/api/http";

type AgentOption = { id: string; name: string; status?: string };

type EditPhoneAgentDialogProps = {
  tenantId: string;
  phone: PhoneNumberRow | null;
  agents: AgentOption[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function EditPhoneAgentDialog({
  tenantId,
  phone,
  agents,
  open,
  onOpenChange,
}: EditPhoneAgentDialogProps) {
  const updateMutation = useUpdatePhoneNumber(tenantId);
  const [agentId, setAgentId] = React.useState<string>("none");
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (phone) {
      setAgentId(phone.assignedAgentId ?? "none");
      setError(null);
    }
  }, [phone]);

  const activeAgents = agents.filter(
    (a) => !a.status || a.status === "ACTIVE",
  );

  const handleSave = async () => {
    if (!phone) return;
    setError(null);
    try {
      await updateMutation.mutateAsync({
        phoneId: phone.id,
        body: {
          assignedAgentId: agentId === "none" ? null : agentId,
        },
      });
      onOpenChange(false);
    } catch (e) {
      setError(
        e instanceof ApiClientError ? e.message : "Failed to save assignment",
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md border-slate-200">
        <DialogHeader>
          <DialogTitle>Edit agent</DialogTitle>
          <DialogDescription>
            Choose which voice agent handles inbound calls to{" "}
            {phone ? formatPhoneNumberDisplay(phone.e164Number) : "this number"}
            .
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <Label htmlFor="phone-agent-select">Voice agent</Label>
          <Select
            value={agentId}
            onValueChange={setAgentId}
            disabled={updateMutation.isPending}
          >
            <SelectTrigger
              id="phone-agent-select"
              className="border-slate-200 bg-white"
            >
              <SelectValue placeholder="Select agent" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No agent assigned</SelectItem>
              {activeAgents.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {error ? (
            <p className="text-sm text-red-600" role="alert">
              {error}
            </p>
          ) : null}
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={updateMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="bg-indigo-600 text-white hover:bg-indigo-700"
            disabled={updateMutation.isPending || !phone}
            onClick={() => void handleSave()}
          >
            {updateMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving…
              </>
            ) : (
              "Save"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

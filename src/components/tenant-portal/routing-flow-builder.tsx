"use client";

import * as React from "react";
import { Clock, Plus, Trash2, Waypoints } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
type RouteAction = "AGENT" | "PHONE" | "VOICEMAIL";

type RuleRow = {
  id: string;
  intent: string;
  action: RouteAction;
  target: string;
};

const ACTION_LABEL: Record<RouteAction, string> = {
  AGENT: "Route to Agent",
  PHONE: "Transfer to Phone Number",
  VOICEMAIL: "Go to Voicemail",
};

const AGENT_OPTIONS = [
  { value: "agent_receptionist", label: "Receptionist" },
  { value: "agent_sales", label: "Sales" },
  { value: "agent_service", label: "Service" },
  { value: "agent_after_hours", label: "After Hours" },
];

function newId() {
  return `rule_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Visual routing / IVR-style flow editor: business hours, intent→action rules, and fallbacks.
 */
export function RoutingFlowBuilder() {
  const [weekdayStart, setWeekdayStart] = React.useState("09:00");
  const [weekdayEnd, setWeekdayEnd] = React.useState("17:30");
  const [rules, setRules] = React.useState<RuleRow[]>([
    {
      id: newId(),
      intent: "billing_or_invoice",
      action: "AGENT",
      target: "agent_receptionist",
    },
    {
      id: newId(),
      intent: "sales_new_customer",
      action: "AGENT",
      target: "agent_sales",
    },
    {
      id: newId(),
      intent: "emergency_keyword",
      action: "PHONE",
      target: "+16175550199",
    },
  ]);

  const [afterHoursFallback, setAfterHoursFallback] = React.useState<
    "MESSAGE" | "PHONE_FORWARD" | "BOSTEL_SUPPORT" | "VOICEMAIL"
  >("VOICEMAIL");
  const [afterHoursMessage, setAfterHoursMessage] = React.useState(
    "Thanks for calling Bostel. Our office is closed. Please leave a message with your name and callback number.",
  );
  const [afterHoursPhone, setAfterHoursPhone] = React.useState("+16175550100");

  const [inactiveFallback, setInactiveFallback] = React.useState<
    "MESSAGE" | "PHONE_FORWARD" | "BOSTEL_SUPPORT" | "VOICEMAIL"
  >("MESSAGE");
  const [inactiveMessage, setInactiveMessage] = React.useState(
    "This line is not accepting calls. Please try again later or visit bostel.com for support options.",
  );
  const [inactivePhone, setInactivePhone] = React.useState("+16175550200");

  const addRule = () => {
    setRules((r) => [
      ...r,
      {
        id: newId(),
        intent: "",
        action: "AGENT",
        target: "agent_receptionist",
      },
    ]);
  };

  const removeRule = (id: string) => {
    setRules((r) => r.filter((row) => row.id !== id));
  };

  const updateRule = (id: string, patch: Partial<RuleRow>) => {
    setRules((r) =>
      r.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    );
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
          Routing Flow
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-600 sm:text-base">
          Define business hours, map caller intents to actions, and configure
          fallbacks for after-hours or inactive accounts (aligns with{" "}
          <code className="rounded bg-slate-100 px-1 text-xs">RoutingFlow</code> /{" "}
          <code className="rounded bg-slate-100 px-1 text-xs">RoutingRule</code> in
          your data model).
        </p>
      </div>

      <Card className="border-slate-200/90 shadow-sm">
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
                Default weekday coverage for this flow. Pair with tenant timezone
                in production.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-6 pt-6 sm:grid-cols-2 lg:max-w-2xl">
          <div className="space-y-2">
            <Label htmlFor="bh-start">Weekday start</Label>
            <Input
              id="bh-start"
              type="time"
              value={weekdayStart}
              onChange={(e) => setWeekdayStart(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bh-end">Weekday end</Label>
            <Input
              id="bh-end"
              type="time"
              value={weekdayEnd}
              onChange={(e) => setWeekdayEnd(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-200/90 shadow-sm">
        <CardHeader className="flex flex-col gap-2 border-b border-slate-100 bg-slate-50/50 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700">
              <Waypoints className="h-4 w-4" aria-hidden />
            </span>
            <div>
              <CardTitle className="text-lg text-slate-900">
                Decision logic
              </CardTitle>
              <CardDescription>
                Map an <strong>intent</strong> (keyword or classifier id) to an{" "}
                <strong>action</strong>. Rules are evaluated in list order.
              </CardDescription>
            </div>
          </div>
          <Button type="button" size="sm" className="shrink-0 gap-1" onClick={addRule}>
            <Plus className="h-4 w-4" />
            Add rule
          </Button>
        </CardHeader>
        <CardContent className="space-y-4 pt-6">
          <div className="hidden gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500 md:grid md:grid-cols-[1fr_180px_1fr_40px]">
            <span>Intent</span>
            <span>Action</span>
            <span>Target</span>
            <span className="text-center"> </span>
          </div>
          <ul className="space-y-3">
            {rules.map((row, index) => (
              <li
                key={row.id}
                className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-sm"
              >
                <p className="mb-3 text-xs font-semibold text-slate-500 md:hidden">
                  Rule {index + 1}
                </p>
                <div className="grid gap-4 md:grid-cols-[1fr_180px_1fr_auto] md:items-end">
                  <div className="space-y-2">
                    <Label className="text-xs text-slate-500 md:hidden">
                      Intent
                    </Label>
                    <Input
                      placeholder="e.g. billing_or_invoice"
                      value={row.intent}
                      onChange={(e) =>
                        updateRule(row.id, { intent: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-slate-500 md:hidden">
                      Action
                    </Label>
                    <Select
                      value={row.action}
                      onValueChange={(v) =>
                        updateRule(row.id, {
                          action: v as RouteAction,
                          target:
                            v === "AGENT"
                              ? "agent_receptionist"
                              : v === "PHONE"
                                ? "+16175550100"
                                : "",
                        })
                      }
                    >
                      <SelectTrigger className="bg-background">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.keys(ACTION_LABEL) as RouteAction[]).map((k) => (
                          <SelectItem key={k} value={k}>
                            {ACTION_LABEL[k]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2 md:col-span-1">
                    <Label className="text-xs text-slate-500 md:hidden">
                      Target
                    </Label>
                    {row.action === "AGENT" ? (
                      <Select
                        value={row.target}
                        onValueChange={(v) =>
                          updateRule(row.id, { target: v })
                        }
                      >
                        <SelectTrigger className="bg-background">
                          <SelectValue placeholder="Agent" />
                        </SelectTrigger>
                        <SelectContent>
                          {AGENT_OPTIONS.map((a) => (
                            <SelectItem key={a.value} value={a.value}>
                              {a.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : row.action === "PHONE" ? (
                      <Input
                        placeholder="+1 E.164 number"
                        value={row.target}
                        onChange={(e) =>
                          updateRule(row.id, { target: e.target.value })
                        }
                      />
                    ) : (
                      <Input
                        readOnly
                        className="bg-muted/40 text-muted-foreground"
                        value="Standard tenant voicemail"
                      />
                    )}
                  </div>
                  <div className="flex justify-end md:pb-0.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="text-slate-500 hover:text-destructive"
                      onClick={() => removeRule(row.id)}
                      aria-label={`Remove rule ${index + 1}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card className="border-amber-200/80 bg-amber-50/20 shadow-sm">
        <CardHeader className="border-b border-amber-100/80">
          <CardTitle className="text-lg text-slate-900">Fallback</CardTitle>
          <CardDescription className="text-slate-700">
            When a call arrives <strong>outside business hours</strong> or when the{" "}
            <strong>account is inactive</strong>, callers never reach live agents —
            use these paths instead (maps to{" "}
            <code className="rounded bg-white/80 px-1 text-xs">fallbackType</code>{" "}
            on <code className="rounded bg-white/80 px-1 text-xs">RoutingFlow</code>
            ).
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
                value={afterHoursFallback}
                onValueChange={(v) =>
                  setAfterHoursFallback(
                    v as typeof afterHoursFallback,
                  )
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
            {(afterHoursFallback === "MESSAGE" ||
              afterHoursFallback === "VOICEMAIL" ||
              afterHoursFallback === "BOSTEL_SUPPORT") && (
              <div className="space-y-2">
                <Label>Caller-facing script</Label>
                <Textarea
                  className="min-h-[100px]"
                  value={afterHoursMessage}
                  onChange={(e) => setAfterHoursMessage(e.target.value)}
                />
              </div>
            )}
            {afterHoursFallback === "PHONE_FORWARD" && (
              <div className="space-y-2">
                <Label>Forward to (E.164)</Label>
                <Input
                  value={afterHoursPhone}
                  onChange={(e) => setAfterHoursPhone(e.target.value)}
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
                value={inactiveFallback}
                onValueChange={(v) =>
                  setInactiveFallback(v as typeof inactiveFallback)
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
            {inactiveFallback !== "PHONE_FORWARD" ? (
              <div className="space-y-2">
                <Label>Message</Label>
                <Textarea
                  className="min-h-[100px]"
                  value={inactiveMessage}
                  onChange={(e) => setInactiveMessage(e.target.value)}
                />
              </div>
            ) : (
              <div className="space-y-2">
                <Label>Forward to (E.164)</Label>
                <Input
                  placeholder="+1…"
                  value={inactivePhone}
                  onChange={(e) => setInactivePhone(e.target.value)}
                />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline">
          Discard
        </Button>
        <Button type="button">Save flow</Button>
      </div>
    </div>
  );
}

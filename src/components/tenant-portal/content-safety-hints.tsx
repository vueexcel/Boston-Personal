"use client";

import * as React from "react";
import { AlertCircle } from "lucide-react";
import {
  scanTextWithRegex,
  type SafetyIssue,
} from "@/lib/prompt-content-safety-patterns";
import { cn } from "@/lib/utils";

export function formatSafetyIssues(issues: SafetyIssue[]): string {
  if (issues.length === 0) return "";
  return issues
    .map((i) => (i.field ? `${i.field}: ${i.message}` : i.message))
    .join(" ");
}

type ContentSafetyHintsProps = {
  text: string;
  field: string;
  className?: string;
};

export function ContentSafetyHints({
  text,
  field,
  className,
}: ContentSafetyHintsProps) {
  const issues = React.useMemo(
    () => scanTextWithRegex(text, field).issues,
    [text, field],
  );

  if (issues.length === 0) return null;

  return (
    <ul className={cn("space-y-1", className)} role="list">
      {issues.map((issue, index) => (
        <li
          key={`${issue.code}-${index}`}
          className={cn(
            "flex items-start gap-1.5 text-xs",
            issue.severity === "critical"
              ? "text-red-700"
              : "text-amber-700",
          )}
        >
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>{issue.message}</span>
        </li>
      ))}
    </ul>
  );
}

type ContentSafetyBannerProps = {
  issues: SafetyIssue[];
  title?: string;
  onDismiss?: () => void;
};

export function ContentSafetyBanner({
  issues,
  title = "Content safety notice",
  onDismiss,
}: ContentSafetyBannerProps) {
  if (issues.length === 0) return null;

  const hasCritical = issues.some((i) => i.severity === "critical");

  return (
    <div
      className={cn(
        "rounded-lg border px-4 py-3 text-sm",
        hasCritical
          ? "border-red-200 bg-red-50 text-red-900"
          : "border-amber-200 bg-amber-50 text-amber-900",
      )}
      role="status"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium">{title}</p>
          <ul className="mt-1.5 list-inside list-disc space-y-0.5 text-xs">
            {issues.map((issue, index) => (
              <li key={`${issue.code}-${index}`}>
                {issue.field ? (
                  <>
                    <span className="font-mono">{issue.field}</span>:{" "}
                    {issue.message}
                  </>
                ) : (
                  issue.message
                )}
              </li>
            ))}
          </ul>
        </div>
        {onDismiss ? (
          <button
            type="button"
            className="shrink-0 text-xs underline opacity-80 hover:opacity-100"
            onClick={onDismiss}
          >
            Dismiss
          </button>
        ) : null}
      </div>
    </div>
  );
}

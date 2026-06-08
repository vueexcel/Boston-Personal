/**
 * Shared regex/heuristic patterns for prompt content safety.
 * Safe to import from client components (no server-only deps).
 */

export type SafetySeverity = "critical" | "warning";

export type PatternRule = {
  code: string;
  severity: SafetySeverity;
  message: string;
  pattern: RegExp;
};

/** Critical patterns — block save and runtime caller messages. */
export const CRITICAL_CONTENT_PATTERNS: PatternRule[] = [
  {
    code: "INJECTION_OVERRIDE",
    severity: "critical",
    message:
      "Contains instruction-override text (e.g. ignore previous instructions).",
    pattern:
      /\bignore\s+(all\s+)?(previous|prior|above)\s+instructions?\b/i,
  },
  {
    code: "INJECTION_OVERRIDE",
    severity: "critical",
    message: "Contains system-override instructions.",
    pattern:
      /\b(disregard|forget|override)\s+(the\s+)?(system|platform|above)\b/i,
  },
  {
    code: "INJECTION_OVERRIDE",
    severity: "critical",
    message: "Contains new-instructions override attempt.",
    pattern: /\bnew\s+instructions?\s*:/i,
  },
  {
    code: "SILENCE_SABOTAGE",
    severity: "critical",
    message: "Contains instructions to remain silent or stop responding.",
    pattern:
      /\b(do\s+not|don't|never)\s+(speak|say\s+anything|respond|reply)\b/i,
  },
  {
    code: "SILENCE_SABOTAGE",
    severity: "critical",
    message: "Contains instructions to remain silent.",
    pattern: /\b(remain|stay)\s+silent\b/i,
  },
  {
    code: "SILENCE_SABOTAGE",
    severity: "critical",
    message: "Contains instructions to say nothing.",
    pattern: /\bsay\s+nothing\b/i,
  },
  {
    code: "SILENCE_SABOTAGE",
    severity: "critical",
    message: "Contains instructions to stop responding.",
    pattern: /\bstop\s+responding\b/i,
  },
  {
    code: "ROLE_HIJACK",
    severity: "critical",
    message: "Contains role-hijack instructions.",
    pattern: /\b(you\s+are\s+now|pretend\s+(you\s+are|to\s+be))\b/i,
  },
  {
    code: "ROLE_HIJACK",
    severity: "critical",
    message: "Contains developer-mode override attempt.",
    pattern: /\bact\s+as\s+(a\s+)?(developer|system|admin)\b/i,
  },
  {
    code: "ROLE_HIJACK",
    severity: "critical",
    message: "Contains jailbreak attempt.",
    pattern: /\b(DAN\s+mode|jailbreak)\b/i,
  },
  {
    code: "PROMPT_EXFILTRATION",
    severity: "critical",
    message: "Attempts to extract system prompt contents.",
    pattern:
      /\b(repeat|show|reveal|print|output)\s+(me\s+)?(your\s+)?(system\s+)?(prompt|instructions?)\b/i,
  },
  {
    code: "PROMPT_EXFILTRATION",
    severity: "critical",
    message: "References developer or system messages for extraction.",
    pattern: /\b(developer|system)\s+message\b/i,
  },
];

/** Warning patterns — allow save with warnings. */
export const WARNING_CONTENT_PATTERNS: PatternRule[] = [
  {
    code: "PHISHING_CREDENTIALS",
    severity: "warning",
    message: "May solicit credentials or verification codes.",
    pattern:
      /\b(verify\s+your\s+account|enter\s+your\s+password|confirm\s+your\s+otp|one[-\s]?time\s+code|bank\s+login)\b/i,
  },
  {
    code: "PHISHING_URL",
    severity: "warning",
    message: "Contains a URL that may be used for phishing.",
    pattern:
      /https?:\/\/[^\s]*(?:login|verify|secure|account|password|bank)[^\s]*/i,
  },
  {
    code: "EXPLICIT_CONTENT",
    severity: "warning",
    message: "Contains potentially explicit language.",
    pattern: /\b(porn|xxx|nude|sexual\s+act|erotic)\b/i,
  },
];

export type SafetyIssue = {
  severity: SafetySeverity;
  code: string;
  message: string;
  field?: string;
};

export type RegexScanResult = {
  issues: SafetyIssue[];
  criticalCount: number;
  warningCount: number;
};

function matchRules(
  text: string,
  rules: PatternRule[],
  field?: string,
): SafetyIssue[] {
  const issues: SafetyIssue[] = [];
  const trimmed = text.trim();
  if (!trimmed) return issues;

  for (const rule of rules) {
    if (rule.pattern.test(trimmed)) {
      issues.push({
        severity: rule.severity,
        code: rule.code,
        message: rule.message,
        field,
      });
    }
  }
  return issues;
}

/** Synchronous regex scan for a single text field. */
export function scanTextWithRegex(
  text: string,
  field?: string,
): RegexScanResult {
  const critical = matchRules(text, CRITICAL_CONTENT_PATTERNS, field);
  const warning = matchRules(text, WARNING_CONTENT_PATTERNS, field);
  const issues = [...critical, ...warning];

  const criticalCount = critical.length;
  if (criticalCount >= 2) {
    issues.push({
      severity: "warning",
      code: "INJECTION_DENSITY",
      message: "Multiple override or sabotage patterns detected in one field.",
      field,
    });
  }

  return {
    issues: dedupeIssues(issues),
    criticalCount,
    warningCount: warning.length + (criticalCount >= 2 ? 1 : 0),
  };
}

export function dedupeIssues(issues: SafetyIssue[]): SafetyIssue[] {
  const seen = new Set<string>();
  const out: SafetyIssue[] = [];
  for (const issue of issues) {
    const key = `${issue.severity}:${issue.code}:${issue.field ?? ""}:${issue.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(issue);
  }
  return out;
}

export function aggregateVerdict(
  issues: SafetyIssue[],
): "pass" | "warn" | "block" {
  if (issues.some((i) => i.severity === "critical")) return "block";
  if (issues.some((i) => i.severity === "warning")) return "warn";
  return "pass";
}

export const RUNTIME_REFUSAL_REPLY =
  "I can't help with that request. Is there something about the business I can assist you with?";

export type RuntimeScreenResult = {
  allowed: boolean;
  safeReply?: string;
  issues: SafetyIssue[];
};

/**
 * Fast runtime screen for caller / test-chat messages (regex only).
 */
export function screenRuntimeUserMessage(text: string): RuntimeScreenResult {
  const result = scanTextWithRegex(text, "callerMessage");
  const blocked = result.issues.some((i) => i.severity === "critical");
  if (blocked) {
    return {
      allowed: false,
      safeReply: RUNTIME_REFUSAL_REPLY,
      issues: result.issues,
    };
  }
  return { allowed: true, issues: result.issues };
}

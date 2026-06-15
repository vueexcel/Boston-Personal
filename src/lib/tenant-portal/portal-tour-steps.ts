import type { Alignment, Side } from "driver.js";
import { getActiveTourStepIndex } from "@/lib/tenant-portal/portal-tour-storage";

export type PortalTourStep = {
  id: string;
  pathname: string;
  tourId: string;
  title: string;
  description: string;
  side?: Side;
  align?: Alignment;
  openMobileNav?: boolean;
};

export const PORTAL_TOUR_STEPS: PortalTourStep[] = [
  {
    id: "welcome",
    pathname: "/portal",
    tourId: "welcome",
    title: "Welcome to Bostel",
    description:
      "This portal is your command center for inbound AI voice — monitor calls, configure agents, and go live on your phone numbers.",
    side: "bottom",
    align: "start",
  },
  {
    id: "sidebar-nav",
    pathname: "/portal",
    tourId: "sidebar-nav",
    title: "Portal navigation",
    description:
      "Use the sidebar to move between Dashboard, Voice Agents, Knowledge Base, Phone Numbers, Routing, Call Logs, and Settings.",
    side: "right",
    align: "start",
    openMobileNav: true,
  },
  {
    id: "top-bar-status",
    pathname: "/portal",
    tourId: "top-bar-status",
    title: "Your account",
    description:
      "Your organization name and account status appear here. Inactive accounts use your configured routing fallbacks instead of live agents.",
    side: "bottom",
    align: "end",
  },
  {
    id: "dashboard-metrics",
    pathname: "/portal",
    tourId: "dashboard-metrics",
    title: "Performance at a glance",
    description:
      "Track total calls, active agents, minutes used in the last 30 days, and answer rate for the past week.",
    side: "bottom",
  },
  {
    id: "dashboard-recent-calls",
    pathname: "/portal",
    tourId: "dashboard-recent-calls",
    title: "Recent inbound calls",
    description:
      "A quick snapshot of your latest calls. Open Call Logs for full history, recordings, and transcripts.",
    side: "top",
  },
  {
    id: "voice-agents-header",
    pathname: "/portal/voice-agents",
    tourId: "voice-agents-header",
    title: "Voice Agents",
    description:
      "Create and manage the AI personas that answer your inbound phone calls.",
    side: "bottom",
    align: "start",
  },
  {
    id: "voice-agents-new",
    pathname: "/portal/voice-agents",
    tourId: "voice-agents-new",
    title: "Create a new agent",
    description:
      "Start from a template (appointments, sales, FAQ) or a blank agent, then customize behavior and voice.",
    side: "left",
    align: "start",
  },
  {
    id: "voice-agents-table",
    pathname: "/portal/voice-agents",
    tourId: "voice-agents-table",
    title: "Configure and test",
    description:
      "Click Edit on any agent to set voice, link knowledge bases, configure forwarding, and test before going live.",
    side: "top",
  },
  {
    id: "knowledge-header",
    pathname: "/portal/knowledge",
    tourId: "knowledge-header",
    title: "Knowledge Base",
    description:
      "Ground your agents in accurate business facts — policies, FAQs, product details, and more.",
    side: "bottom",
    align: "start",
  },
  {
    id: "knowledge-create",
    pathname: "/portal/knowledge",
    tourId: "knowledge-create",
    title: "Add knowledge",
    description:
      "Import content from pasted text, uploaded files (PDF, CSV, DOCX), or by scraping your website.",
    side: "bottom",
  },
  {
    id: "knowledge-table",
    pathname: "/portal/knowledge",
    tourId: "knowledge-table",
    title: "Manage documents",
    description:
      "Open any knowledge base to edit its documents, then attach bases to agents in the agent builder.",
    side: "top",
  },
  {
    id: "phone-numbers-header",
    pathname: "/portal/phone-numbers",
    tourId: "phone-numbers-header",
    title: "Phone Numbers",
    description:
      "Provision Twilio numbers that callers dial to reach your voice agents.",
    side: "bottom",
    align: "start",
  },
  {
    id: "phone-numbers-get",
    pathname: "/portal/phone-numbers",
    tourId: "phone-numbers-get",
    title: "Get a number",
    description:
      "Search available numbers by country and area code, then add one to your account.",
    side: "left",
    align: "start",
  },
  {
    id: "phone-numbers-table",
    pathname: "/portal/phone-numbers",
    tourId: "phone-numbers-table",
    title: "Assign to agents",
    description:
      "Each number must be linked to an agent. Use Edit Agent to choose who answers that line.",
    side: "top",
  },
  {
    id: "routing-hours",
    pathname: "/portal/routing",
    tourId: "routing-hours",
    title: "Business hours",
    description:
      "Enable weekday hours in your tenant timezone. When off, agents answer 24/7. Weekends are always after-hours when enabled.",
    side: "bottom",
  },
  {
    id: "routing-holidays",
    pathname: "/portal/routing",
    tourId: "routing-holidays",
    title: "Holiday closures",
    description:
      "Close on US federal holidays and add custom company closures. Holidays apply only when business hours are enabled.",
    side: "bottom",
  },
  {
    id: "routing-fallback",
    pathname: "/portal/routing",
    tourId: "routing-fallback",
    title: "Fallback paths",
    description:
      "Set what callers hear outside business hours or when your account is inactive — message, forward, voicemail, or Bostel support.",
    side: "top",
  },
  {
    id: "call-logs-filters",
    pathname: "/portal/call-logs",
    tourId: "call-logs-filters",
    title: "Filter call history",
    description:
      "Narrow by date range or agent, and refresh to pull the latest Twilio call data.",
    side: "bottom",
  },
  {
    id: "call-logs-table",
    pathname: "/portal/call-logs",
    tourId: "call-logs-table",
    title: "Call details",
    description:
      "Open any call to view status, duration, cost, recording, and transcript turns.",
    side: "top",
  },
  {
    id: "settings-card",
    pathname: "/portal/settings",
    tourId: "settings-card",
    title: "Settings",
    description:
      "Account profile, entitlements, webhooks, and security preferences will live here soon.",
    side: "bottom",
  },
  {
    id: "take-tour-finish",
    pathname: "/portal",
    tourId: "take-tour",
    title: "You're all set",
    description:
      "Replay this tour anytime with the Take tour button in the top bar. Need help? Configure routing fallbacks before your first live call.",
    side: "bottom",
    align: "end",
  },
];

export function tourSelector(tourId: string): string {
  return `[data-tour="${tourId}"]`;
}

export function getActiveStepIndexForPath(pathname: string): number | null {
  const active = getActiveTourStepIndex();
  if (active == null) return null;
  const step = PORTAL_TOUR_STEPS[active];
  if (!step) return null;
  return step.pathname === pathname ? active : null;
}


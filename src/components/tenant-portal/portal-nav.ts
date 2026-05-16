import type { LucideIcon } from "lucide-react";
import {
  BookOpen,
  Headphones,
  LayoutDashboard,
  Phone,
  ScrollText,
  Settings,
  Waypoints,
} from "lucide-react";

export type PortalNavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
};

export const PORTAL_NAV_ITEMS: PortalNavItem[] = [
  { label: "Dashboard", href: "/portal", icon: LayoutDashboard },
  { label: "Voice Agents", href: "/portal/voice-agents", icon: Headphones },
  { label: "Knowledge Base", href: "/portal/knowledge", icon: BookOpen },
  { label: "Phone Numbers", href: "/portal/phone-numbers", icon: Phone },
  { label: "Routing Flow", href: "/portal/routing", icon: Waypoints },
  { label: "Call Logs", href: "/portal/call-logs", icon: ScrollText },
  { label: "Settings", href: "/portal/settings", icon: Settings },
];

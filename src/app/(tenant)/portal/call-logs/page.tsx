import type { Metadata } from "next";
import { CallLogsTable } from "@/components/tenant-portal/call-logs-table";

export const metadata: Metadata = { title: "Call Logs" };

export default function CallLogsPage() {
  return <CallLogsTable />;
}

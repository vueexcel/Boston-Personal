import type { Metadata } from "next";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <Card className="border-slate-200/90">
      <CardHeader>
        <CardTitle className="text-slate-900">Settings</CardTitle>
        <CardDescription>
          Tenant profile, entitlements, webhooks, and security preferences.
        </CardDescription>
      </CardHeader>
    </Card>
  );
}

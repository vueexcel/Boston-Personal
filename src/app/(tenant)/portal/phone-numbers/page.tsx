import type { Metadata } from "next";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Phone Numbers" };

export default function PhoneNumbersPage() {
  return (
    <Card className="border-slate-200/90">
      <CardHeader>
        <CardTitle className="text-slate-900">Phone Numbers</CardTitle>
        <CardDescription>
          Provision and assign Twilio numbers to routing flows.
        </CardDescription>
      </CardHeader>
    </Card>
  );
}

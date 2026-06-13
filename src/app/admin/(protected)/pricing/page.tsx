import type { Metadata } from "next";
import { PricingManagementView } from "@/components/platform-admin/pricing-management-view";

export const metadata: Metadata = {
  title: "Pricing",
};

export default function AdminPricingPage() {
  return <PricingManagementView />;
}

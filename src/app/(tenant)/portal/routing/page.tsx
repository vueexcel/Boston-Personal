import type { Metadata } from "next";
import { RoutingFlowBuilder } from "@/components/tenant-portal/routing-flow-builder";

export const metadata: Metadata = { title: "Routing Flow" };

export default function RoutingFlowPage() {
  return <RoutingFlowBuilder />;
}

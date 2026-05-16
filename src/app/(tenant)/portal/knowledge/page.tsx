import type { Metadata } from "next";
import { KnowledgeBaseManager } from "@/components/tenant-portal/knowledge-base-manager";

export const metadata: Metadata = { title: "Knowledge Base" };

export default function KnowledgePage() {
  return <KnowledgeBaseManager />;
}

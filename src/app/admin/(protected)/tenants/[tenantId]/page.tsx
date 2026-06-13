import { TenantDetailView } from "@/components/platform-admin/tenant-detail-view";

type PageProps = {
  params: { tenantId: string };
};

export default function AdminTenantDetailPage({ params }: PageProps) {
  return <TenantDetailView tenantId={params.tenantId} />;
}

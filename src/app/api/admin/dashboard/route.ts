import { okEnvelope, jsonEnvelope } from "@/lib/api/response";
import { requirePlatformAdminApi } from "@/lib/auth/platform-access";
import { getPlatformDashboardData } from "@/lib/services/platform-dashboard";

export async function GET(): Promise<Response> {
  const auth = await requirePlatformAdminApi();
  if (!auth.ok) return auth.response;

  const data = await getPlatformDashboardData();
  return jsonEnvelope(okEnvelope(data));
}

import { jsonEnvelope, okEnvelope } from "@/lib/api/response";

/**
 * Liveness probe for load balancers; avoids touching external services.
 */
export async function GET(): Promise<Response> {
  return jsonEnvelope(
    okEnvelope({
      service: "bostel-voice-ai",
      status: "ok",
      timestampUtc: new Date().toISOString(),
    }),
  );
}

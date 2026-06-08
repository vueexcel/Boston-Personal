import { apiFetch, apiPostBlob } from "@/lib/api/http";
import type { PortalElevenLabsVoice } from "@/lib/services/elevenlabs-voices";

function tenantElevenLabsPath(tenantId: string, segment: string): string {
  return `/api/v1/tenants/${tenantId}/elevenlabs/${segment}`;
}

export type ElevenLabsVoicesResult = {
  voices: PortalElevenLabsVoice[];
  error: string | null;
};

export async function listElevenLabsVoices(
  tenantId: string,
): Promise<ElevenLabsVoicesResult> {
  return apiFetch<ElevenLabsVoicesResult>(
    tenantElevenLabsPath(tenantId, "voices"),
  );
}

export async function previewElevenLabsVoice(
  tenantId: string,
  voiceId: string,
  language?: string | null,
): Promise<Blob> {
  return apiPostBlob(tenantElevenLabsPath(tenantId, "preview"), {
    voiceId,
    ...(language != null && language !== "" ? { language } : {}),
  });
}

export type CreateCustomVoiceResult = {
  voiceId: string;
  requiresVerification: boolean;
};

export async function createElevenLabsCustomVoice(
  tenantId: string,
  params: { name: string; sample: File },
): Promise<CreateCustomVoiceResult> {
  const fd = new FormData();
  fd.set("name", params.name);
  fd.set("sample", params.sample);
  return apiFetch<CreateCustomVoiceResult>(
    tenantElevenLabsPath(tenantId, "custom-voice"),
    {
      method: "POST",
      body: fd,
    },
  );
}

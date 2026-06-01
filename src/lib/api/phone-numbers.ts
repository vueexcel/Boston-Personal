import { apiDelete, apiFetch, apiGet, apiPatch, apiPost } from "@/lib/api/http";
import type { AvailablePhoneNumber } from "@/lib/integrations/twilio-phone-numbers";
import type { PhoneNumberRow } from "@/lib/services/phone-numbers";
import type {
  ProvisionPhoneNumberBody,
  UpdatePhoneNumberBody,
} from "@/lib/validation/phone-numbers";

function path(tenantId: string): string {
  return `/api/v1/tenants/${tenantId}/phone-numbers`;
}

export async function listPhoneNumbers(
  tenantId: string,
): Promise<PhoneNumberRow[]> {
  const data = await apiFetch<{ phoneNumbers: PhoneNumberRow[] }>(
    path(tenantId),
  );
  return data.phoneNumbers;
}

export async function updatePhoneNumber(
  tenantId: string,
  phoneId: string,
  body: UpdatePhoneNumberBody,
): Promise<PhoneNumberRow> {
  const data = await apiPatch<{ phoneNumber: PhoneNumberRow }>(
    `${path(tenantId)}/${phoneId}`,
    body,
  );
  return data.phoneNumber;
}

export async function searchAvailablePhoneNumbers(
  tenantId: string,
  params: { country?: string; areaCode?: string },
): Promise<AvailablePhoneNumber[]> {
  const qs = new URLSearchParams();
  qs.set("country", params.country ?? "US");
  if (params.areaCode?.trim()) {
    qs.set("areaCode", params.areaCode.trim());
  }
  const data = await apiGet<{ numbers: AvailablePhoneNumber[] }>(
    `${path(tenantId)}/available?${qs.toString()}`,
  );
  return data.numbers;
}

export async function provisionPhoneNumber(
  tenantId: string,
  body: ProvisionPhoneNumberBody,
): Promise<PhoneNumberRow> {
  const data = await apiPost<{ phoneNumber: PhoneNumberRow }>(
    path(tenantId),
    body,
  );
  return data.phoneNumber;
}

export async function releasePhoneNumber(
  tenantId: string,
  phoneId: string,
): Promise<void> {
  await apiDelete(`${path(tenantId)}/${phoneId}`);
}

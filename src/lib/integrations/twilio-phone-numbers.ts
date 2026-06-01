import { getTwilioClient } from "@/lib/integrations/twilio";
import {
  getTwilioVoiceStatusWebhookUrl,
  getTwilioVoiceWebhookUrl,
} from "@/lib/webhooks/twilio-app-url";

export type AvailablePhoneNumber = {
  phoneNumber: string;
  friendlyName: string | null;
  locality: string | null;
  region: string | null;
};

export async function searchAvailablePhoneNumbers(params: {
  country: string;
  areaCode?: string;
  limit?: number;
}): Promise<AvailablePhoneNumber[]> {
  const client = getTwilioClient();
  const country = params.country.toUpperCase();
  const limit = params.limit ?? 12;

  const listParams: { areaCode?: number; limit: number } = { limit };
  if (params.areaCode?.trim()) {
    const ac = Number.parseInt(params.areaCode.trim(), 10);
    if (!Number.isNaN(ac) && ac > 0) {
      listParams.areaCode = ac;
    }
  }

  const results =
    country === "US" || country === "CA"
      ? await client.availablePhoneNumbers(country).local.list(listParams)
      : await client.availablePhoneNumbers(country).mobile.list(listParams);

  return results.map((n) => ({
    phoneNumber: n.phoneNumber,
    friendlyName: n.friendlyName ?? null,
    locality: n.locality ?? null,
    region: n.region ?? null,
  }));
}

export async function purchaseTwilioPhoneNumber(
  phoneNumber: string,
): Promise<{ sid: string; phoneNumber: string }> {
  const client = getTwilioClient();
  const voiceUrl = getTwilioVoiceWebhookUrl();
  const statusCallback = getTwilioVoiceStatusWebhookUrl();

  const purchased = await client.incomingPhoneNumbers.create({
    phoneNumber,
    voiceUrl,
    voiceMethod: "POST",
    statusCallback,
    statusCallbackMethod: "POST",
  });

  return {
    sid: purchased.sid,
    phoneNumber: purchased.phoneNumber,
  };
}

export async function releaseTwilioPhoneNumber(twilioSid: string): Promise<void> {
  const client = getTwilioClient();
  await client.incomingPhoneNumbers(twilioSid).remove();
}

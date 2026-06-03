import { getTwilioClient } from "@/lib/integrations/twilio";
import {
  getTwilioVoiceStatusWebhookUrl,
  getTwilioVoiceWebhookUrl,
} from "@/lib/webhooks/twilio-app-url";

export type AvailablePhoneNumberType = "local" | "toll_free" | "mobile";

export type AvailablePhoneNumberCountry = {
  countryCode: string;
  country: string;
  beta: boolean;
  numberTypes: AvailablePhoneNumberType[];
};

export type AvailablePhoneNumberCapabilities = {
  voice: boolean;
  sms: boolean;
  mms: boolean;
};

export type AvailablePhoneNumber = {
  phoneNumber: string;
  friendlyName: string | null;
  locality: string | null;
  region: string | null;
  isoCountry: string | null;
  postalCode: string | null;
  numberType: AvailablePhoneNumberType;
  capabilities: AvailablePhoneNumberCapabilities;
};

const SUBRESOURCE_TYPE_MAP: Record<string, AvailablePhoneNumberType> = {
  local: "local",
  toll_free: "toll_free",
  tollfree: "toll_free",
  mobile: "mobile",
};

function parseNumberTypes(
  subresourceUris: Record<string, string> | undefined,
): AvailablePhoneNumberType[] {
  if (!subresourceUris) return [];
  const types: AvailablePhoneNumberType[] = [];
  for (const key of Object.keys(subresourceUris)) {
    const normalized = key.toLowerCase().replace(/-/g, "_");
    const mapped = SUBRESOURCE_TYPE_MAP[normalized];
    if (mapped && !types.includes(mapped)) {
      types.push(mapped);
    }
  }
  return types;
}

function mapCapabilities(
  caps: { voice?: boolean; SMS?: boolean; MMS?: boolean; sms?: boolean; mms?: boolean } | undefined,
): AvailablePhoneNumberCapabilities {
  return {
    voice: Boolean(caps?.voice),
    sms: Boolean(caps?.SMS ?? caps?.sms),
    mms: Boolean(caps?.MMS ?? caps?.mms),
  };
}

function mapAvailableNumber(
  n: {
    phoneNumber: string;
    friendlyName?: string;
    locality?: string;
    region?: string;
    isoCountry?: string;
    postalCode?: string;
    capabilities?: {
      voice?: boolean;
      SMS?: boolean;
      MMS?: boolean;
      sms?: boolean;
      mms?: boolean;
    };
  },
  numberType: AvailablePhoneNumberType,
): AvailablePhoneNumber {
  return {
    phoneNumber: n.phoneNumber,
    friendlyName: n.friendlyName ?? null,
    locality: n.locality ?? null,
    region: n.region ?? null,
    isoCountry: n.isoCountry ?? null,
    postalCode: n.postalCode ?? null,
    numberType,
    capabilities: mapCapabilities(n.capabilities),
  };
}

/**
 * Lists countries where Twilio has searchable inventory.
 * @see https://www.twilio.com/docs/phone-numbers/api/availablephonenumber-resource
 */
export async function listAvailablePhoneNumberCountries(): Promise<
  AvailablePhoneNumberCountry[]
> {
  const client = getTwilioClient();
  const countries = await client.availablePhoneNumbers.list({ limit: 1000 });

  return countries
    .map((c) => ({
      countryCode: c.countryCode,
      country: c.country,
      beta: c.beta ?? false,
      numberTypes: parseNumberTypes(
        c.subresourceUris as Record<string, string> | undefined,
      ),
    }))
    .filter((c) => c.numberTypes.length > 0)
    .sort((a, b) => a.country.localeCompare(b.country));
}

async function fetchCountryNumberTypes(
  countryCode: string,
): Promise<AvailablePhoneNumberType[]> {
  const client = getTwilioClient();
  const resource = await client.availablePhoneNumbers(countryCode).fetch();
  return parseNumberTypes(
    resource.subresourceUris as Record<string, string> | undefined,
  );
}

/**
 * Searches Twilio AvailablePhoneNumbers (Local, TollFree, or Mobile) for a country.
 * @see https://www.twilio.com/docs/phone-numbers/api/availablephonenumber-local-resource
 */
export async function searchAvailablePhoneNumbers(params: {
  country: string;
  areaCode?: string;
  numberType?: AvailablePhoneNumberType;
  limit?: number;
}): Promise<AvailablePhoneNumber[]> {
  const client = getTwilioClient();
  const country = params.country.toUpperCase();
  const limit = params.limit ?? 20;

  const availableTypes = await fetchCountryNumberTypes(country);
  if (availableTypes.length === 0) {
    return [];
  }

  const numberType =
    params.numberType && availableTypes.includes(params.numberType)
      ? params.numberType
      : availableTypes[0]!;

  const listParams: { areaCode?: number; limit: number } = { limit };
  if (
    numberType === "local" &&
    (country === "US" || country === "CA") &&
    params.areaCode?.trim()
  ) {
    const ac = Number.parseInt(params.areaCode.trim(), 10);
    if (!Number.isNaN(ac) && ac > 0) {
      listParams.areaCode = ac;
    }
  }

  const resource = client.availablePhoneNumbers(country);
  let results: Parameters<typeof mapAvailableNumber>[0][];

  switch (numberType) {
    case "toll_free":
      results = await resource.tollFree.list(listParams);
      break;
    case "mobile":
      results = await resource.mobile.list(listParams);
      break;
    default:
      results = await resource.local.list(listParams);
      break;
  }

  return results.map((n) => mapAvailableNumber(n, numberType));
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

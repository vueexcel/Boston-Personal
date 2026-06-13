import {
  defaultTenantRoutingSettings,
  ROUTING_SETTINGS_VERSION,
  type TenantRoutingSettingsV1,
} from "@/lib/tenant-portal/routing-settings-v1";

const DEFAULT_TIMEZONE = "America/New_York";

/** Monday=1 … Sunday=7 (ISO weekday). */
function isoWeekdayInTimezone(date: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
  }).formatToParts(date);
  const wd = parts.find((p) => p.type === "weekday")?.value ?? "";
  const map: Record<string, number> = {
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
    Sun: 7,
  };
  return map[wd] ?? 7;
}

function minutesOfDayInTimezone(date: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return hour * 60 + minute;
}

function parseHmToMinutes(hm: string): number {
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + m;
}

export function normalizeTimezone(raw: string | null | undefined): string {
  if (!raw?.trim()) return DEFAULT_TIMEZONE;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: raw.trim() });
    return raw.trim();
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

export function parseTenantRoutingSettings(
  raw: unknown,
): TenantRoutingSettingsV1 {
  const defaults = defaultTenantRoutingSettings();
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    return defaults;
  }
  const obj = raw as Record<string, unknown>;
  if (obj.version !== ROUTING_SETTINGS_VERSION) {
    return defaults;
  }

  const bh =
    obj.businessHours && typeof obj.businessHours === "object"
      ? (obj.businessHours as Record<string, unknown>)
      : {};

  const parseFallback = (
    src: unknown,
    fallbackDefault: TenantRoutingSettingsV1["afterHoursFallback"],
  ): TenantRoutingSettingsV1["afterHoursFallback"] => {
    if (src == null || typeof src !== "object" || Array.isArray(src)) {
      return fallbackDefault;
    }
    const f = src as Record<string, unknown>;
    const type = f.type;
    if (
      type !== "MESSAGE" &&
      type !== "PHONE_FORWARD" &&
      type !== "BOSTEL_SUPPORT" &&
      type !== "VOICEMAIL"
    ) {
      return fallbackDefault;
    }
    return {
      type,
      message:
        typeof f.message === "string" ? f.message : fallbackDefault.message,
      forwardTo:
        typeof f.forwardTo === "string" ? f.forwardTo : fallbackDefault.forwardTo,
    };
  };

  return {
    version: ROUTING_SETTINGS_VERSION,
    businessHours: {
      enabled: bh.enabled === true,
      weekdayStart:
        typeof bh.weekdayStart === "string"
          ? bh.weekdayStart
          : defaults.businessHours.weekdayStart,
      weekdayEnd:
        typeof bh.weekdayEnd === "string"
          ? bh.weekdayEnd
          : defaults.businessHours.weekdayEnd,
    },
    afterHoursFallback: parseFallback(
      obj.afterHoursFallback,
      defaults.afterHoursFallback,
    ),
    inactiveFallback: parseFallback(
      obj.inactiveFallback,
      defaults.inactiveFallback,
    ),
  };
}

/**
 * Returns true when the current local time in `timezone` falls within configured
 * weekday business hours (Mon–Fri inclusive). End time is inclusive to the minute.
 */
export function isWithinBusinessHours(
  settings: TenantRoutingSettingsV1,
  timezone: string,
  now: Date = new Date(),
): boolean {
  if (!settings.businessHours.enabled) {
    return true;
  }

  const tz = normalizeTimezone(timezone);
  const weekday = isoWeekdayInTimezone(now, tz);
  if (weekday > 5) {
    return false;
  }

  const nowMin = minutesOfDayInTimezone(now, tz);
  const startMin = parseHmToMinutes(settings.businessHours.weekdayStart);
  const endMin = parseHmToMinutes(settings.businessHours.weekdayEnd);

  return nowMin >= startMin && nowMin <= endMin;
}

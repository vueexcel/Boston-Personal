import {
  defaultRoutingHolidays,
  defaultTenantRoutingSettings,
  ROUTING_SETTINGS_VERSION,
  type CustomHoliday,
  type TenantRoutingSettingsV1,
} from "@/lib/tenant-portal/routing-settings-v1";
import {
  defaultFederalHolidayEnabledMap,
  FEDERAL_HOLIDAY_IDS,
  isFederalHolidayId,
  resolveObservedFederalDate,
  type FederalHolidayId,
} from "@/lib/tenant-portal/us-federal-holidays";

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

/** Local calendar date in tenant timezone as YYYY-MM-DD. */
export function localDateInTimezone(date: Date, timezone: string): string {
  const tz = normalizeTimezone(timezone);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((p) => p.type === "year")?.value ?? "1970";
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  const day = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

/** Local month-day in tenant timezone as MM-DD. */
export function localMonthDayInTimezone(date: Date, timezone: string): string {
  const ymd = localDateInTimezone(date, timezone);
  return ymd.slice(5);
}

function parseCustomHoliday(raw: unknown): CustomHoliday | null {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const obj = raw as Record<string, unknown>;
  const id = typeof obj.id === "string" ? obj.id.trim() : "";
  const name = typeof obj.name === "string" ? obj.name.trim() : "";
  const kind = obj.kind;
  const enabled = obj.enabled !== false;
  if (!id || name.length < 2) return null;

  if (kind === "annual") {
    const monthDay =
      typeof obj.monthDay === "string" ? obj.monthDay.trim() : "";
    if (!/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(monthDay)) {
      return null;
    }
    return { id, name, kind: "annual", monthDay, enabled };
  }

  if (kind === "once") {
    const date = typeof obj.date === "string" ? obj.date.trim() : "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
    return { id, name, kind: "once", date, enabled };
  }

  return null;
}

function parseHolidays(raw: unknown): TenantRoutingSettingsV1["holidays"] {
  const defaults = defaultRoutingHolidays();
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    return defaults;
  }
  const obj = raw as Record<string, unknown>;
  const federalEnabled = obj.federalEnabled === true;

  const federal = { ...defaultFederalHolidayEnabledMap() };
  if (obj.federal && typeof obj.federal === "object" && !Array.isArray(obj.federal)) {
    for (const [key, val] of Object.entries(
      obj.federal as Record<string, unknown>,
    )) {
      if (isFederalHolidayId(key)) {
        federal[key] = val !== false;
      }
    }
  }

  const custom: CustomHoliday[] = [];
  const seen = new Set<string>();
  if (Array.isArray(obj.custom)) {
    for (const entry of obj.custom) {
      const parsed = parseCustomHoliday(entry);
      if (parsed && !seen.has(parsed.id) && custom.length < 50) {
        seen.add(parsed.id);
        custom.push(parsed);
      }
    }
  }

  return { federalEnabled, federal, custom };
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
    holidays: parseHolidays(obj.holidays),
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

export function isFederalHolidayClosed(
  settings: TenantRoutingSettingsV1,
  timezone: string,
  now: Date = new Date(),
): boolean {
  if (!settings.businessHours.enabled || !settings.holidays.federalEnabled) {
    return false;
  }

  const tz = normalizeTimezone(timezone);
  const localDate = localDateInTimezone(now, tz);
  const year = Number(localDate.slice(0, 4));

  for (const id of FEDERAL_HOLIDAY_IDS) {
    if (settings.holidays.federal[id as FederalHolidayId] === false) {
      continue;
    }
    if (resolveObservedFederalDate(id, year) === localDate) {
      return true;
    }
  }

  return false;
}

export function isCustomHolidayClosed(
  settings: TenantRoutingSettingsV1,
  timezone: string,
  now: Date = new Date(),
): boolean {
  if (!settings.businessHours.enabled) {
    return false;
  }

  const tz = normalizeTimezone(timezone);
  const localDate = localDateInTimezone(now, tz);
  const localMonthDay = localMonthDayInTimezone(now, tz);

  for (const entry of settings.holidays.custom) {
    if (!entry.enabled) continue;
    if (entry.kind === "once" && entry.date === localDate) {
      return true;
    }
    if (entry.kind === "annual" && entry.monthDay === localMonthDay) {
      return true;
    }
  }

  return false;
}

/**
 * Returns true when the current local time in `timezone` falls within configured
 * weekday business hours (Mon–Fri inclusive). End time is inclusive to the minute.
 * Federal and custom holidays are treated as closed when business hours are enabled.
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

  if (isFederalHolidayClosed(settings, tz, now)) {
    return false;
  }

  if (isCustomHolidayClosed(settings, tz, now)) {
    return false;
  }

  const nowMin = minutesOfDayInTimezone(now, tz);
  const startMin = parseHmToMinutes(settings.businessHours.weekdayStart);
  const endMin = parseHmToMinutes(settings.businessHours.weekdayEnd);

  return nowMin >= startMin && nowMin <= endMin;
}

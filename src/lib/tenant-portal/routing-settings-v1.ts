import {
  defaultFederalHolidayEnabledMap,
  type FederalHolidayId,
} from "@/lib/tenant-portal/us-federal-holidays";

export const ROUTING_SETTINGS_VERSION = 1 as const;

export type FallbackType =
  | "MESSAGE"
  | "PHONE_FORWARD"
  | "BOSTEL_SUPPORT"
  | "VOICEMAIL";

export type RoutingFallbackConfig = {
  type: FallbackType;
  message?: string;
  forwardTo?: string;
};

export type CustomHoliday =
  | {
      id: string;
      name: string;
      kind: "annual";
      monthDay: string;
      enabled: boolean;
    }
  | {
      id: string;
      name: string;
      kind: "once";
      date: string;
      enabled: boolean;
    };

export type RoutingHolidaysConfig = {
  federalEnabled: boolean;
  federal: Record<FederalHolidayId, boolean>;
  custom: CustomHoliday[];
};

export type TenantRoutingSettingsV1 = {
  version: typeof ROUTING_SETTINGS_VERSION;
  businessHours: {
    enabled: boolean;
    weekdayStart: string;
    weekdayEnd: string;
  };
  holidays: RoutingHolidaysConfig;
  afterHoursFallback: RoutingFallbackConfig;
  inactiveFallback: RoutingFallbackConfig;
};

export const DEFAULT_AFTER_HOURS_MESSAGE =
  "Thanks for calling. Our office is closed. Please leave a message with your name and callback number.";

export const DEFAULT_INACTIVE_MESSAGE =
  "This line is not accepting calls. Please try again later or visit our website for support options.";

export function defaultRoutingHolidays(): RoutingHolidaysConfig {
  return {
    federalEnabled: false,
    federal: defaultFederalHolidayEnabledMap(),
    custom: [],
  };
}

export function defaultTenantRoutingSettings(): TenantRoutingSettingsV1 {
  return {
    version: ROUTING_SETTINGS_VERSION,
    businessHours: {
      enabled: false,
      weekdayStart: "09:00",
      weekdayEnd: "17:30",
    },
    holidays: defaultRoutingHolidays(),
    afterHoursFallback: {
      type: "VOICEMAIL",
      message: DEFAULT_AFTER_HOURS_MESSAGE,
    },
    inactiveFallback: {
      type: "MESSAGE",
      message: DEFAULT_INACTIVE_MESSAGE,
    },
  };
}

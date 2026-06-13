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

export type TenantRoutingSettingsV1 = {
  version: typeof ROUTING_SETTINGS_VERSION;
  businessHours: {
    enabled: boolean;
    weekdayStart: string;
    weekdayEnd: string;
  };
  afterHoursFallback: RoutingFallbackConfig;
  inactiveFallback: RoutingFallbackConfig;
};

export const DEFAULT_AFTER_HOURS_MESSAGE =
  "Thanks for calling. Our office is closed. Please leave a message with your name and callback number.";

export const DEFAULT_INACTIVE_MESSAGE =
  "This line is not accepting calls. Please try again later or visit our website for support options.";

export function defaultTenantRoutingSettings(): TenantRoutingSettingsV1 {
  return {
    version: ROUTING_SETTINGS_VERSION,
    businessHours: {
      enabled: false,
      weekdayStart: "09:00",
      weekdayEnd: "17:30",
    },
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

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  defaultTenantRoutingSettings,
} from "@/lib/tenant-portal/routing-settings-v1";
import {
  resolveFederalHolidayDate,
  resolveObservedFederalDate,
} from "@/lib/tenant-portal/us-federal-holidays";
import {
  isCustomHolidayClosed,
  isFederalHolidayClosed,
  isWithinBusinessHours,
  localDateInTimezone,
  parseTenantRoutingSettings,
} from "@/lib/services/routing-schedule";

describe("resolveObservedFederalDate", () => {
  it("observes Independence Day on Friday when July 4 is Saturday", () => {
    assert.equal(
      resolveFederalHolidayDate("independence_day", 2026),
      "2026-07-04",
    );
    assert.equal(
      resolveObservedFederalDate("independence_day", 2026),
      "2026-07-03",
    );
  });

  it("observes Christmas on Monday when December 25 is Sunday", () => {
    assert.equal(resolveFederalHolidayDate("christmas", 2022), "2022-12-25");
    assert.equal(resolveObservedFederalDate("christmas", 2022), "2022-12-26");
  });

  it("does not shift floating holidays", () => {
    assert.equal(resolveObservedFederalDate("thanksgiving", 2026), "2026-11-26");
    assert.equal(resolveObservedFederalDate("mlk_day", 2026), "2026-01-19");
  });
});

describe("isWithinBusinessHours holidays", () => {
  const base = defaultTenantRoutingSettings();
  const settings = {
    ...base,
    businessHours: {
      enabled: true,
      weekdayStart: "09:00",
      weekdayEnd: "17:30",
    },
    holidays: {
      ...base.holidays,
      federalEnabled: true,
      federal: { ...base.holidays.federal },
      custom: [
        {
          id: "once-1",
          name: "Retreat",
          kind: "once" as const,
          date: "2026-03-15",
          enabled: true,
        },
        {
          id: "annual-1",
          name: "Christmas Eve",
          kind: "annual" as const,
          monthDay: "12-24",
          enabled: true,
        },
      ],
    },
  };

  it("returns false on an enabled federal holiday during weekday hours", () => {
    const thanksgiving = new Date("2026-11-26T15:00:00-05:00");
    assert.equal(
      isWithinBusinessHours(settings, "America/New_York", thanksgiving),
      false,
    );
    assert.equal(
      isFederalHolidayClosed(settings, "America/New_York", thanksgiving),
      true,
    );
  });

  it("returns true when a federal holiday is individually disabled", () => {
    const thanksgiving = new Date("2026-11-26T15:00:00-05:00");
    const disabled = {
      ...settings,
      holidays: {
        ...settings.holidays,
        federal: { ...settings.holidays.federal, thanksgiving: false },
      },
    };
    assert.equal(
      isFederalHolidayClosed(disabled, "America/New_York", thanksgiving),
      false,
    );
    assert.equal(
      isWithinBusinessHours(disabled, "America/New_York", thanksgiving),
      true,
    );
  });

  it("matches custom one-time holidays", () => {
    const retreat = new Date("2026-03-15T14:00:00-04:00");
    assert.equal(
      isCustomHolidayClosed(settings, "America/New_York", retreat),
      true,
    );
    assert.equal(
      isWithinBusinessHours(settings, "America/New_York", retreat),
      false,
    );
  });

  it("matches custom annual holidays", () => {
    const eve = new Date("2026-12-24T12:00:00-05:00");
    assert.equal(isCustomHolidayClosed(settings, "America/New_York", eve), true);
  });

  it("ignores disabled custom holidays", () => {
    const eve = new Date("2026-12-24T12:00:00-05:00");
    const disabled = {
      ...settings,
      holidays: {
        ...settings.holidays,
        custom: settings.holidays.custom.map((c) =>
          c.id === "annual-1" ? { ...c, enabled: false } : c,
        ),
      },
    };
    assert.equal(isCustomHolidayClosed(disabled, "America/New_York", eve), false);
  });

  it("uses tenant timezone for local date matching", () => {
    const utc = new Date("2026-03-16T03:30:00Z");
    assert.equal(localDateInTimezone(utc, "America/Los_Angeles"), "2026-03-15");
    assert.equal(localDateInTimezone(utc, "America/New_York"), "2026-03-15");
    assert.equal(isCustomHolidayClosed(settings, "America/Los_Angeles", utc), true);
  });
});

describe("parseTenantRoutingSettings", () => {
  it("defaults holidays when missing from stored JSON", () => {
    const parsed = parseTenantRoutingSettings({
      version: 1,
      businessHours: {
        enabled: true,
        weekdayStart: "08:00",
        weekdayEnd: "18:00",
      },
      afterHoursFallback: { type: "MESSAGE", message: "We are closed today." },
      inactiveFallback: { type: "MESSAGE", message: "Account inactive now." },
    });
    assert.equal(parsed.holidays.federalEnabled, false);
    assert.equal(parsed.holidays.custom.length, 0);
    assert.equal(parsed.holidays.federal.thanksgiving, true);
  });
});

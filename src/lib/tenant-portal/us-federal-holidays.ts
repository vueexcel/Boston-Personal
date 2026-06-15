export const FEDERAL_HOLIDAY_IDS = [
  "new_years_day",
  "mlk_day",
  "presidents_day",
  "memorial_day",
  "juneteenth",
  "independence_day",
  "labor_day",
  "columbus_day",
  "veterans_day",
  "thanksgiving",
  "christmas",
] as const;

export type FederalHolidayId = (typeof FEDERAL_HOLIDAY_IDS)[number];

export type FederalHolidayDefinition = {
  id: FederalHolidayId;
  name: string;
};

const DEFINITIONS: FederalHolidayDefinition[] = [
  { id: "new_years_day", name: "New Year's Day" },
  { id: "mlk_day", name: "Martin Luther King Jr. Day" },
  { id: "presidents_day", name: "Presidents' Day" },
  { id: "memorial_day", name: "Memorial Day" },
  { id: "juneteenth", name: "Juneteenth" },
  { id: "independence_day", name: "Independence Day" },
  { id: "labor_day", name: "Labor Day" },
  { id: "columbus_day", name: "Columbus Day" },
  { id: "veterans_day", name: "Veterans Day" },
  { id: "thanksgiving", name: "Thanksgiving Day" },
  { id: "christmas", name: "Christmas Day" },
];

export function listFederalHolidayDefinitions(): FederalHolidayDefinition[] {
  return [...DEFINITIONS];
}

export function defaultFederalHolidayEnabledMap(): Record<
  FederalHolidayId,
  boolean
> {
  return Object.fromEntries(
    FEDERAL_HOLIDAY_IDS.map((id) => [id, true]),
  ) as Record<FederalHolidayId, boolean>;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function formatYmd(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function weekdayOf(year: number, month: number, day: number): number {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function nthWeekdayOfMonth(
  year: number,
  month: number,
  weekday: number,
  n: number,
): number {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const firstWd = first.getUTCDay();
  const offset = (weekday - firstWd + 7) % 7;
  return 1 + offset + (n - 1) * 7;
}

function lastWeekdayOfMonth(
  year: number,
  month: number,
  weekday: number,
): number {
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const lastWd = new Date(Date.UTC(year, month - 1, daysInMonth)).getUTCDay();
  const diff = (lastWd - weekday + 7) % 7;
  return daysInMonth - diff;
}

/** Calendar date of the holiday (before weekend observation). */
export function resolveFederalHolidayDate(
  id: FederalHolidayId,
  year: number,
): string {
  switch (id) {
    case "new_years_day":
      return formatYmd(year, 1, 1);
    case "mlk_day":
      return formatYmd(year, 1, nthWeekdayOfMonth(year, 1, 1, 3));
    case "presidents_day":
      return formatYmd(year, 2, nthWeekdayOfMonth(year, 2, 1, 3));
    case "memorial_day":
      return formatYmd(year, 5, lastWeekdayOfMonth(year, 5, 1));
    case "juneteenth":
      return formatYmd(year, 6, 19);
    case "independence_day":
      return formatYmd(year, 7, 4);
    case "labor_day":
      return formatYmd(year, 9, nthWeekdayOfMonth(year, 9, 1, 1));
    case "columbus_day":
      return formatYmd(year, 10, nthWeekdayOfMonth(year, 10, 1, 2));
    case "veterans_day":
      return formatYmd(year, 11, 11);
    case "thanksgiving":
      return formatYmd(year, 11, nthWeekdayOfMonth(year, 11, 4, 4));
    case "christmas":
      return formatYmd(year, 12, 25);
    default:
      return formatYmd(year, 1, 1);
  }
}

const FLOATING_HOLIDAYS = new Set<FederalHolidayId>([
  "mlk_day",
  "presidents_day",
  "memorial_day",
  "labor_day",
  "columbus_day",
  "thanksgiving",
]);

function applyWeekendObservation(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const wd = weekdayOf(y, m, d);
  if (wd === 6) {
    const dt = new Date(Date.UTC(y, m - 1, d - 1));
    return formatYmd(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
  }
  if (wd === 0) {
    const dt = new Date(Date.UTC(y, m - 1, d + 1));
    return formatYmd(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
  }
  return ymd;
}

/** Observed federal closure date (weekend rules for fixed-date holidays). */
export function resolveObservedFederalDate(
  id: FederalHolidayId,
  year: number,
): string {
  const calendar = resolveFederalHolidayDate(id, year);
  if (FLOATING_HOLIDAYS.has(id)) {
    return calendar;
  }
  return applyWeekendObservation(calendar);
}

export type FederalHolidayYearEntry = {
  id: FederalHolidayId;
  name: string;
  observedDate: string;
  enabled: boolean;
};

export function getFederalHolidaysForYear(
  year: number,
  enabledMap: Partial<Record<FederalHolidayId, boolean>>,
): FederalHolidayYearEntry[] {
  return listFederalHolidayDefinitions().map((def) => ({
    id: def.id,
    name: def.name,
    observedDate: resolveObservedFederalDate(def.id, year),
    enabled: enabledMap[def.id] !== false,
  }));
}

export function isFederalHolidayId(value: string): value is FederalHolidayId {
  return (FEDERAL_HOLIDAY_IDS as readonly string[]).includes(value);
}

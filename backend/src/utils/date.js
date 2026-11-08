import Kenat, { toEC, toGC } from "kenat";
import { AppError } from "./AppError.js";

export const BUSINESS_TIMEZONE = "Africa/Addis_Ababa";
export const DAILY_ALLOWANCE_ETB = 40;

export const CONFIRMED_PUBLIC_HOLIDAYS = new Set([
  "enkutatash",
  "meskel",
  "beherbehereseb",
  "gena",
  "timket",
  "martyrsDay",
  "adwa",
  "labour",
  "fasika",
  "patriots",
  "siklet",
]);

export const UNCONFIRMED_PUBLIC_HOLIDAYS = new Set(["eidFitr", "eidAdha", "moulid"]);

const pad2 = (value) => String(value).padStart(2, "0");

const isPlainObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);

export const getAddisAbabaDateParts = (date = new Date()) => {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    calendar: "gregory",
  });

  const values = Object.fromEntries(
    formatter.formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
  };
};

const toAddisLocalUtcBoundary = (gregorianYear, gregorianMonth, gregorianDay) => {
  const utcMs = Date.UTC(gregorianYear, gregorianMonth - 1, gregorianDay);
  const addisOffsetMs = 3 * 60 * 60 * 1000;
  return new Date(utcMs - addisOffsetMs);
};

const normalizeGregorianDate = (value) => {
  if (value instanceof Date) {
    return {
      year: value.getUTCFullYear(),
      month: value.getUTCMonth() + 1,
      day: value.getUTCDate(),
    };
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) throw new AppError("Invalid Gregorian date value", 400);

    const match = trimmed.match(/^\d{4}-\d{2}-\d{2}$/);
    if (match) {
      const [year, month, day] = trimmed.split("-").map(Number);
      return { year, month, day };
    }

    const dateValue = new Date(trimmed);
    if (!Number.isNaN(dateValue.getTime())) {
      return {
        year: dateValue.getUTCFullYear(),
        month: dateValue.getUTCMonth() + 1,
        day: dateValue.getUTCDate(),
      };
    }
  }

  if (isPlainObject(value) && Number.isInteger(value.year) && Number.isInteger(value.month) && Number.isInteger(value.day)) {
    return { year: value.year, month: value.month, day: value.day };
  }

  throw new AppError("Invalid Gregorian date. Expected a Date or YYYY-MM-DD value.", 400);
};

const normalizeEthiopianDate = (value) => {
  if (value instanceof Kenat) {
    const ethiopian = value.getEthiopian();
    return {
      year: Number(ethiopian.year),
      month: Number(ethiopian.month),
      day: Number(ethiopian.day),
    };
  }

  if (isPlainObject(value) && Number.isInteger(value.year) && Number.isInteger(value.month) && Number.isInteger(value.day)) {
    return { year: value.year, month: value.month, day: value.day };
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) throw new AppError("Invalid Ethiopian date value", 400);

    const slashParts = trimmed.split("/");
    if (slashParts.length === 3) {
      const [year, month, day] = slashParts.map(Number);
      return { year, month, day };
    }

    const dashParts = trimmed.split("-");
    if (dashParts.length === 3) {
      const [year, month, day] = dashParts.map(Number);
      return { year, month, day };
    }
  }

  throw new AppError("Invalid Ethiopian date. Expected YYYY/MM/DD or an Ethiopian date object.", 400);
};

export const getCurrentEthiopianDate = () => {
  const gregorian = getAddisAbabaDateParts(new Date());
  return gregorianToEthiopian(gregorian);
};

export const ethiopianToGregorian = (ethiopianDate) => {
  const { year, month, day } = normalizeEthiopianDate(ethiopianDate);
  return toGC(year, month, day);
};

export const gregorianToEthiopian = (dateLike) => {
  const { year, month, day } = normalizeGregorianDate(dateLike);
  return toEC(year, month, day);
};

export const validateEthiopianMonth = (month) => {
  const current = getCurrentEthiopianDate();

  let year = current.year;
  let monthNumber = current.month;

  if (month !== undefined && month !== null && month !== "") {
    if (typeof month === "string") {
      const trimmed = month.trim();
      if (!trimmed) {
        throw new AppError("Invalid Ethiopian month. Expected YYYY-MM or YYYY/MM.", 400);
      }

      const [firstPart, secondPart] = trimmed.includes("/") ? trimmed.split("/") : trimmed.split("-");
      if (firstPart && secondPart) {
        year = Number(firstPart);
        monthNumber = Number(secondPart);
      } else {
        throw new AppError("Invalid Ethiopian month. Expected YYYY-MM or YYYY/MM.", 400);
      }
    } else if (typeof month === "number") {
      monthNumber = month;
    } else if (isPlainObject(month) && Number.isInteger(month.year) && Number.isInteger(month.month)) {
      year = month.year;
      monthNumber = month.month;
    } else if (month instanceof Date) {
      const ethiopian = gregorianToEthiopian(month);
      year = ethiopian.year;
      monthNumber = ethiopian.month;
    } else {
      throw new AppError("Invalid Ethiopian month. Expected YYYY-MM, YYYY/MM, or an Ethiopian month object.", 400);
    }
  }

  if (!Number.isInteger(year) || !Number.isInteger(monthNumber) || monthNumber < 1 || monthNumber > 13) {
    throw new AppError("Invalid Ethiopian month. Expected YYYY-MM or YYYY/MM with a month between 1 and 13.", 400);
  }

  return {
    year,
    month: monthNumber,
    monthKey: `${year}-${pad2(monthNumber)}`,
  };
};

export const getEthiopianMonthIdentifier = (month) => validateEthiopianMonth(month).monthKey;

export const getEthiopianMonthRange = (month) => {
  const normalized = validateEthiopianMonth(month);
  const monthStart = new Kenat(`${normalized.year}/${normalized.month}/1`);
  const monthStartGregorian = monthStart.getGregorian();
  const nextMonthGregorian = monthStart.addMonths(1).getGregorian();

  const start = new Date(Date.UTC(monthStartGregorian.year, monthStartGregorian.month - 1, monthStartGregorian.day));
  const end = new Date(Date.UTC(nextMonthGregorian.year, nextMonthGregorian.month - 1, nextMonthGregorian.day));

  const startAt = toAddisLocalUtcBoundary(monthStartGregorian.year, monthStartGregorian.month, monthStartGregorian.day);
  const endAt = toAddisLocalUtcBoundary(nextMonthGregorian.year, nextMonthGregorian.month, nextMonthGregorian.day);

  return {
    month: normalized.monthKey,
    year: normalized.year,
    monthNumber: normalized.month,
    start,
    end,
    allocationDate: start,
    startAt,
    endAt,
  };
};

export const getMonthRange = (month) => getEthiopianMonthRange(month);
export const getCurrentMonthRange = () => getEthiopianMonthRange();

// A cycle is one Ethiopian calendar month beginning on the selected day.  The
// date-only fields are deliberately paired with Addis-local timestamp bounds
// so ledger entries never drift by a day when UTC is used by the database.
export const getEthiopianCycleRange = (ethiopianStartDate) => {
  const normalized = normalizeEthiopianDate(ethiopianStartDate);
  if (
    !Number.isInteger(normalized.year)
    || normalized.year < 1
    || !Number.isInteger(normalized.month)
    || normalized.month < 1
    || normalized.month > 13
    || !Number.isInteger(normalized.day)
    || normalized.day < 1
    || normalized.day > 30
  ) {
    throw new AppError("Invalid Ethiopian cycle start date", 400);
  }

  let startKenat;
  try {
    startKenat = new Kenat(`${normalized.year}/${normalized.month}/${normalized.day}`);
  } catch (error) {
    if (error?.name === "InvalidEthiopianDateError") {
      throw new AppError("Invalid Ethiopian cycle start date", 400);
    }
    throw error;
  }
  const parsedStart = startKenat.getEthiopian();
  if (
    Number(parsedStart.year) !== normalized.year
    || Number(parsedStart.month) !== normalized.month
    || Number(parsedStart.day) !== normalized.day
  ) {
    throw new AppError("Invalid Ethiopian cycle start date", 400);
  }
  const startGregorian = startKenat.getGregorian();
  const endGregorian = startKenat.addMonths(1).getGregorian();
  const start = new Date(Date.UTC(startGregorian.year, startGregorian.month - 1, startGregorian.day));
  const end = new Date(Date.UTC(endGregorian.year, endGregorian.month - 1, endGregorian.day));

  return {
    ethiopian_start: normalized,
    start,
    end,
    startAt: toAddisLocalUtcBoundary(startGregorian.year, startGregorian.month, startGregorian.day),
    endAt: toAddisLocalUtcBoundary(endGregorian.year, endGregorian.month, endGregorian.day),
  };
};

const asKenatDate = (dateLike) => {
  if (dateLike instanceof Kenat) return dateLike;

  if (dateLike instanceof Date) {
    const ethiopianDate = gregorianToEthiopian(dateLike);
    return new Kenat(`${ethiopianDate.year}/${ethiopianDate.month}/${ethiopianDate.day}`);
  }

  if (typeof dateLike === "string") {
    const trimmed = dateLike.trim();
    if (!trimmed) return new Kenat();

    if (trimmed.includes("/")) {
      return new Kenat(trimmed);
    }

    if (trimmed.includes("-")) {
      const parts = trimmed.split("-");
      if (parts.length === 3) {
        const [year, month, day] = parts.map(Number);
        const ethiopianDate = toEC(year, month, day);
        return new Kenat(`${ethiopianDate.year}/${ethiopianDate.month}/${ethiopianDate.day}`);
      }
    }
  }

  if (isPlainObject(dateLike) && Number.isInteger(dateLike.year) && Number.isInteger(dateLike.month) && Number.isInteger(dateLike.day)) {
    return new Kenat(`${dateLike.year}/${dateLike.month}/${dateLike.day}`);
  }

  return new Kenat();
};

export const isWeekend = (dateLike) => {
  const parsed = asKenatDate(dateLike);
  const weekday = parsed.weekday();
  return weekday === 0 || weekday === 6;
};

export const isOfficialHoliday = (dateLike, options = {}) => {
  const { includeUnconfirmed = false } = options;
  const parsed = asKenatDate(dateLike);
  const holidays = parsed.isHoliday() ?? [];

  return holidays.some((holiday) => {
    if (!holiday || !Array.isArray(holiday.tags) || !holiday.tags.includes("public")) return false;
    const holidayKey = holiday.key;
    if (UNCONFIRMED_PUBLIC_HOLIDAYS.has(holidayKey)) {
      return includeUnconfirmed;
    }
    return CONFIRMED_PUBLIC_HOLIDAYS.has(holidayKey);
  });
};

export const isWorkingDay = (dateLike) => {
  if (isWeekend(dateLike)) return false;
  return !isOfficialHoliday(dateLike);
};

export const getEthiopianMonthCalendar = (month) => {
  const normalized = validateEthiopianMonth(month);
  const monthStart = new Kenat(`${normalized.year}/${normalized.month}/1`);
  const lastDay = monthStart.endOfMonth().getEthiopian().day;
  const days = [];

  for (let day = 1; day <= lastDay; day += 1) {
    const date = new Kenat(`${normalized.year}/${normalized.month}/${day}`);
    const gregorian = date.getGregorian();
    const weekend = isWeekend(date);
    const holiday = isOfficialHoliday(date);
    days.push({
      day,
      weekday: new Date(Date.UTC(gregorian.year, gregorian.month - 1, gregorian.day)).getUTCDay(),
      weekend,
      holiday,
      working_day: !weekend && !holiday,
      gregorian_date: `${gregorian.year}-${pad2(gregorian.month)}-${pad2(gregorian.day)}`,
    });
  }

  return {
    month: normalized.monthKey,
    year: normalized.year,
    month_number: normalized.month,
    days,
  };
};

export const countWorkingDaysInEthiopianMonth = (month) => {
  return getEthiopianMonthCalendar(month).days.filter((date) => date.working_day).length;
};

export const calculateMonthlyAllowance = (month) => {
  return countWorkingDaysInEthiopianMonth(month) * DAILY_ALLOWANCE_ETB;
};

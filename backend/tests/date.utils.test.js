import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ethiopianToGregorian,
  gregorianToEthiopian,
  getEthiopianMonthCalendar,
  getEthiopianMonthRange,
  isOfficialHoliday,
  isWorkingDay,
} from "../src/utils/date.js";
import { validateMonth } from "../src/validators/common.validators.js";

test("Gregorian-to-Ethiopian conversion matches the verified Ethiopian date mapping", () => {
  assert.deepEqual(gregorianToEthiopian(new Date(Date.UTC(2026, 10, 6))), { year: 2019, month: 2, day: 27 });
  assert.deepEqual(ethiopianToGregorian({ year: 2019, month: 2, day: 27 }), { year: 2026, month: 11, day: 6 });
});

test("Ethiopian month boundary conversion keeps the month window consistent for database filters", () => {
  const range = getEthiopianMonthRange("2019-02");
  assert.equal(range.month, "2019-02");
  assert.equal(range.startAt.toISOString(), "2026-10-10T21:00:00.000Z");
  assert.equal(range.endAt.toISOString(), "2026-11-09T21:00:00.000Z");
});

test("Ethiopian month calendar marks weekends and confirmed holidays as restricted", () => {
  const calendar = getEthiopianMonthCalendar("2019-02");
  assert.equal(calendar.month, "2019-02");
  assert.equal(calendar.days.length, 30);
  assert.equal(calendar.days[0].weekday, 0);
  assert.equal(calendar.days[0].weekend, true);
  assert.equal(calendar.days[0].working_day, false);
  assert.equal(calendar.days.filter((day) => day.working_day).length, 21);
  assert.equal(calendar.days.reduce((count, day) => count + Number(day.holiday), 0), 0);

  const firstMonth = getEthiopianMonthCalendar("2019-01");
  assert.equal(firstMonth.days.find((day) => day.day === 1).holiday, true);
  assert.equal(firstMonth.days.find((day) => day.day === 1).working_day, false);
  assert.equal(getEthiopianMonthCalendar("2019-13").days.length, 6);
  assert.equal(validateMonth("2019-13"), "2019-13");
});

test("Confirmed Ethiopian public holidays block working days while unconfirmed Eid dates remain excluded by policy", () => {
  assert.equal(isOfficialHoliday("2019/1/1"), true);
  assert.equal(isOfficialHoliday("2019/1/17"), true);
  assert.equal(isWorkingDay("2019/1/1"), false);
  assert.equal(isOfficialHoliday("2019/6/30"), false);
  assert.equal(isOfficialHoliday("2019/9/8"), false);
});

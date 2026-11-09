import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ethiopianToGregorian,
  gregorianToEthiopian,
  getEthiopianMonthCalendar,
  getEthiopianMonthRange,
  getEthiopianCycleRange,
  isOfficialHoliday,
  isWorkingDay,
} from "../src/utils/date.js";
import { validateMonth } from "../src/validators/common.validators.js";
import {
  validateAllocationCreate,
  validateExpiredBalancePreviewQuery,
  validateExpiredBalanceRestoration,
  validateEmployeeQrDepartmentFilter,
  validateGroupAllocation,
} from "../src/validators/company.validators.js";
import prisma from "../src/config/db.js";
import { previewExpiredBalancesForDepartment } from "../src/services/company.service.js";

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

test("custom Ethiopian allocation cycles preserve their requested start date and end on the same day next month", () => {
  const cycle = getEthiopianCycleRange("2019/04/04");
  assert.deepEqual(cycle.ethiopian_start, { year: 2019, month: 4, day: 4 });
  assert.deepEqual(gregorianToEthiopian(cycle.start), { year: 2019, month: 4, day: 4 });
  assert.deepEqual(gregorianToEthiopian(cycle.end), { year: 2019, month: 5, day: 4 });
  assert.equal(cycle.startAt.toISOString(), "2026-12-12T21:00:00.000Z");
  assert.equal(cycle.endAt.toISOString(), "2027-01-11T21:00:00.000Z");
  assert.throws(() => getEthiopianCycleRange("2019/13/30"), { statusCode: 400 });
});

test("allocation validation accepts a cycle date in its reporting month and rejects a different month", () => {
  assert.equal(validateAllocationCreate({
    user_id: 1,
    amount: 100,
    month: "2019-04",
    ethiopian_cycle_start: "2019/04/04",
    cycle_label: "Tir Allocation Cycle",
  }).cycle_label, "Tir Allocation Cycle");
  assert.throws(() => validateGroupAllocation({
    amount: 100,
    month: "2019-04",
    department_id: 1,
    ethiopian_cycle_start: "2019/05/04",
  }), { statusCode: 400 });
});

test("expired balance restoration validation bounds days and requires authorization fields", () => {
  assert.deepEqual(validateExpiredBalanceRestoration({
    department_id: 2,
    manager_password: "manager-secret",
    additional_days: 5,
  }), {
    department_id: 2,
    manager_password: "manager-secret",
    additional_days: 5,
  });
  assert.throws(() => validateExpiredBalanceRestoration({
    department_id: 2,
    manager_password: "manager-secret",
    additional_days: 366,
  }), { statusCode: 400 });
  assert.throws(() => validateExpiredBalanceRestoration({
    department_id: 2,
    manager_password: "",
    additional_days: 5,
  }), { statusCode: 400 });
  assert.deepEqual(validateExpiredBalanceRestoration({
    department_id: 2,
    month: "2019-02",
    manager_password: "manager-secret",
    additional_days: 5,
  }), {
    department_id: 2,
    month: "2019-02",
    manager_password: "manager-secret",
    additional_days: 5,
  });
  assert.deepEqual(validateExpiredBalanceRestoration({
    department_id: "all",
    month: "2019-02",
    manager_password: "manager-secret",
    additional_days: 5,
  }), {
    all_departments: true,
    month: "2019-02",
    manager_password: "manager-secret",
    additional_days: 5,
  });
});

test("expired balance preview requires a department and Ethiopian month", () => {
  assert.deepEqual(validateExpiredBalancePreviewQuery({ department_id: "2", month: "2019-02" }), {
    department_id: 2,
    month: "2019-02",
  });
  assert.deepEqual(validateExpiredBalancePreviewQuery({ department_id: "all", month: "2019-02" }), {
    all_departments: true,
    month: "2019-02",
  });
  assert.throws(() => validateExpiredBalancePreviewQuery({ department_id: "2" }), { statusCode: 400 });
  assert.throws(() => validateExpiredBalancePreviewQuery({ department_id: "2", month: "2019-14" }), { statusCode: 400 });
});

test("employee QR department filter defaults to all and validates selected departments", () => {
  assert.deepEqual(validateEmployeeQrDepartmentFilter({}), { department_id: undefined });
  assert.deepEqual(validateEmployeeQrDepartmentFilter({ department_id: null }), { department_id: undefined });
  assert.deepEqual(validateEmployeeQrDepartmentFilter({ department_id: "3" }), { department_id: 3 });
  assert.throws(() => validateEmployeeQrDepartmentFilter({ department_id: "all" }), { statusCode: 400 });
});

test("expired balance preview respects the all-departments flag even when a department id is also present", async () => {
  const originalFindUnique = prisma.users.findUnique;
  prisma.users.findUnique = async () => ({ department_id: 2 });

  await assert.rejects(() => previewExpiredBalancesForDepartment({
    id: 1,
    roles: ["company_manager"],
    department_id: 2,
  }, {
    department_id: 2,
    all_departments: true,
    month: "2019-02",
  }, "127.0.0.1"), { statusCode: 403 });

  prisma.users.findUnique = originalFindUnique;
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


import Kenat from "kenat";

console.log("========== KENAT TEST ==========");

// 1. Current Ethiopian date
const today = new Kenat();

console.log("\n1. Current Ethiopian date:");
console.log(today.getEthiopian());

console.log("Gregorian equivalent:");
console.log(today.getGregorian());

// 2. Test a normal Ethiopian month
const normalMonth = new Kenat("2019/1/1");

console.log("\n2. Normal month:");
console.log("First day:", normalMonth.startOfMonth().getEthiopian());
console.log("Last day:", normalMonth.endOfMonth().getEthiopian());

// 3. Test Pagume
const pagume = new Kenat("2019/13/1");

console.log("\n3. Pagume:");
console.log("Is leap year:", pagume.isLeapYear());
console.log("First day:", pagume.startOfMonth().getEthiopian());
console.log("Last day:", pagume.endOfMonth().getEthiopian());

// 4. Test weekdays
console.log("\n4. Weekday test:");

for (let day = 1; day <= 7; day++) {
    const date = new Kenat(`2019/1/${day}`);

    console.log({
        ethiopianDate: date.getEthiopian(),
        weekday: date.weekday(),
        isWeekend: date.weekday() === 0 || date.weekday() === 6
    });
}

console.log("\n========== TEST COMPLETED ==========");

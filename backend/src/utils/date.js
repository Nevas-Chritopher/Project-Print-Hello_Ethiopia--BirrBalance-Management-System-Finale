import { AppError } from "./AppError.js";

export const getMonthRange = (month) => {
  const value = month || new Date().toISOString().slice(0, 7);
  const [year, monthNumber] = value.split("-").map(Number);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(monthNumber) ||
    monthNumber < 1 ||
    monthNumber > 12
  ) {
    throw new AppError("Invalid month. Expected YYYY-MM", 400);
  }

  return {
    month: `${year}-${String(monthNumber).padStart(2, "0")}`,
    start: new Date(Date.UTC(year, monthNumber - 1, 1)),
    end: new Date(Date.UTC(year, monthNumber, 1)),
  };
};

export const getCurrentMonthRange = () => getMonthRange();

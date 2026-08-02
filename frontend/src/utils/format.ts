// Formatter utility for Ethiopian Birr (ETB)
export const formatETB = (amount: number | string): string => {
  return `ETB ${Number(amount || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
};

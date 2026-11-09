const ETHIOPIAN_MONTHS = [
  'Meskerem',
  'Tikimt',
  'Hidar',
  'Tahsas',
  'Tir',
  'Yekatit',
  'Megabit',
  'Miazia',
  'Ginbot',
  'Sene',
  'Hamle',
  'Nehase',
  'Pagume',
];

export const getCurrentEthiopianMonth = () => {
  return getEthiopianMonth(new Date());
};

export const getEthiopianMonth = (date: Date) => {
  const parts = new Intl.DateTimeFormat('en-u-ca-ethiopic-nu-latn', {
    timeZone: 'Africa/Addis_Ababa',
    year: 'numeric',
    month: 'numeric',
  }).formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;

  if (!year || !month) {
    throw new Error('Unable to determine the current Ethiopian month.');
  }

  return `${year}-${month.padStart(2, '0')}`;
};

export const ETHIOPIAN_MONTH_NAMES = ETHIOPIAN_MONTHS;

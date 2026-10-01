// Dates travel as YYYY-MM-DD (Postgres DATE columns, stored at UTC midnight) and accounting
// periods as YYYY-MM
const DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/;

export const isDate = (value: unknown): value is string => typeof value === 'string' && DATE.test(value);
export const isPeriod = (value: unknown): value is string => typeof value === 'string' && PERIOD.test(value);

// Today in the business time zone (a sale at 8 p.m. in Bogotá belongs to that day)
export const today = (timeZone: string, now = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);

export const periodOf = (date: string) => date.slice(0, 7);

export const toDbDate = (date: string) => new Date(`${date}T00:00:00.000Z`);

export const fromDbDate = (date: Date) => date.toISOString().slice(0, 10);

export const addDays = (date: string, days: number) => {
  const result = toDbDate(date);
  result.setUTCDate(result.getUTCDate() + days);
  return fromDbDate(result);
};

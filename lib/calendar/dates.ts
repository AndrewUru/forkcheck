import { z } from 'zod';

export const calendarFilters = z.object({
  date: z.iso.date().optional(),
  scheduledPage: z.coerce.number().int().min(1).max(100000).default(1),
  completedPage: z.coerce.number().int().min(1).max(100000).default(1),
});

export function shiftDate(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/** Locate local date boundaries rather than assuming every day lasts 24 hours. */
export function dayBounds(date: string, timeZone: string) {
  z.iso.date().parse(date);
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const boundary = (target: string) => {
    const center = Date.parse(`${target}T00:00:00Z`);
    let low = center - 36 * 60 * 60 * 1000;
    let high = center + 36 * 60 * 60 * 1000;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (formatter.format(new Date(middle)) < target) low = middle + 1;
      else high = middle;
    }
    return new Date(low).toISOString();
  };
  return { start: boundary(date), end: boundary(shiftDate(date, 1)) };
}

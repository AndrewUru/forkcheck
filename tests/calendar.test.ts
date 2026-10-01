import { describe, expect, it } from 'vitest';
import { calendarFilters, dayBounds, shiftDate } from '../lib/calendar/dates';

describe('calendar dates', () => {
  it('uses the organization local day rather than UTC', () => {
    expect(dayBounds('2026-10-01', 'Europe/Madrid')).toEqual({
      start: '2026-09-30T22:00:00.000Z', end: '2026-10-01T22:00:00.000Z',
    });
  });
  it('handles both daylight saving transitions', () => {
    const spring = dayBounds('2026-03-29', 'Europe/Madrid');
    const autumn = dayBounds('2026-10-25', 'Europe/Madrid');
    expect(Date.parse(spring.end) - Date.parse(spring.start)).toBe(23 * 3600000);
    expect(Date.parse(autumn.end) - Date.parse(autumn.start)).toBe(25 * 3600000);
  });
  it('handles time zones across the date line and leap days', () => {
    expect(dayBounds('2026-10-01', 'Pacific/Kiritimati').start).toBe('2026-09-30T10:00:00.000Z');
    expect(shiftDate('2028-02-28', 1)).toBe('2028-02-29');
    expect(shiftDate('2026-01-01', -1)).toBe('2025-12-31');
  });
  it('rejects invalid dates and pagination', () => {
    expect(calendarFilters.safeParse({ date: '2026-02-30' }).success).toBe(false);
    expect(calendarFilters.safeParse({ scheduledPage: 0 }).success).toBe(false);
  });
});

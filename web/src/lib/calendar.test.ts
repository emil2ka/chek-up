import { describe, expect, it } from 'vitest';
import { addDays, addMonths, daysBetween, daysInMonth, dowOf, endOfDay, isIso, todayIso, weekDays, weekOf, weekTxt } from './calendar';

describe('даты Казахстана', () => {
  it('день меняется в полночь по UTC+5', () => {
    expect(todayIso(Date.UTC(2026, 10, 22, 18, 59))).toBe('2026-11-22');
    expect(todayIso(Date.UTC(2026, 10, 22, 19, 0))).toBe('2026-11-23');
    expect(endOfDay('2026-11-22')).toBe(Date.UTC(2026, 10, 22, 19, 0));
  });
  it('неделя начинается в понедельник', () => {
    expect(dowOf('2026-11-23')).toBe(0);
    expect(weekOf('2026-11-23')).toBe('2026-11-23');
    expect(weekOf('2026-11-29')).toBe('2026-11-23');
    expect(weekDays('2026-11-23')[6]).toBe('2026-11-29');
  });
  it('арифметика через границы месяца и года', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(daysBetween('2026-02-27', '2026-03-01')).toBe(2);
    expect(addMonths('2026-12', 1)).toBe('2027-01');
    expect(daysInMonth('2028-02')).toBe(29);
  });
  it('подписи и проверка', () => {
    expect(weekTxt('2026-11-16')).toBe('16–22 ноября');
    expect(weekTxt('2026-11-30')).toBe('30 ноября – 6 декабря');
    expect(isIso('2026-02-30')).toBe(false);
    expect(isIso('2026-11-22')).toBe(true);
  });
});

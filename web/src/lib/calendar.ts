// Даты и недели «Чек-апа». Неделя — с понедельника по воскресенье по времени Казахстана (UTC+5 на всей территории с 2024 года),
// чтобы у всех участников семьи и на сервере границы недели совпадали.
// Зеркало на Dart — mobile/lib/core/calendar.dart.

import { currentLang, t } from './i18n';

export const TZ_OFFSET_MIN = 300;
const DAY = 86_400_000;

/** YYYY-MM-DD в Казахстане для момента времени. */
export const isoOf = (at: number | Date): string => new Date((typeof at === 'number' ? at : at.getTime()) + TZ_OFFSET_MIN * 60_000).toISOString().slice(0, 10);
export const todayIso = (now: number | Date = Date.now()): string => isoOf(now);

const utc = (iso: string): number => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
export const isIso = (s: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(utc(s)).toISOString().slice(0, 10) === s;
export const addDays = (iso: string, n: number): string => new Date(utc(iso) + n * DAY).toISOString().slice(0, 10);
/** Сколько дней от a до b (b − a). */
export const daysBetween = (a: string, b: string): number => Math.round((utc(b) - utc(a)) / DAY);
/** 0 — понедельник … 6 — воскресенье. */
export const dowOf = (iso: string): number => (new Date(utc(iso)).getUTCDay() + 6) % 7;

/** Понедельник недели, в которую входит дата. Этой строкой неделя и называется. */
export const weekOf = (iso: string): string => addDays(iso, -dowOf(iso));
export const weekDays = (week: string): string[] => Array.from({ length: 7 }, (_, i) => addDays(week, i));
export const nextWeek = (week: string): string => addDays(week, 7);
export const prevWeek = (week: string): string => addDays(week, -7);

/** Момент (мс), когда заканчивается день `iso` в Казахстане. */
export const endOfDay = (iso: string): number => utc(iso) + DAY - TZ_OFFSET_MIN * 60_000;

export const DOW_SHORT = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'] as const;
const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
export const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];

/** «16 ноября» */
export const dayTxt = (iso: string): string => `${+iso.slice(8, 10)} ${t(MONTHS_GEN[+iso.slice(5, 7) - 1])}`;
/** «16–22 ноября», «30 ноября – 6 декабря» */
export function weekTxt(week: string): string {
  const end = addDays(week, 6);
  return week.slice(0, 7) === end.slice(0, 7)
    ? `${+week.slice(8, 10)}–${dayTxt(end)}`
    : `${dayTxt(week)} – ${dayTxt(end)}`;
}
/** «Ноябрь 2026» из YYYY-MM */
export const monthTxt = (ym: string): string => {
  const m = t(MONTHS[+ym.slice(5, 7) - 1]);
  return currentLang() === 'kk' ? `${ym.slice(0, 4)} ж. ${m.toLowerCase()}` : `${m} ${ym.slice(0, 4)}`;
};
export const monthOf = (iso: string): string => iso.slice(0, 7);
export const addMonths = (ym: string, n: number): string => new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7) - 1 + n, 1)).toISOString().slice(0, 7);
export const daysInMonth = (ym: string): number => new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7), 0)).getUTCDate();

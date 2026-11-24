// Стрик «недели подряд». Неделя засчитана, если семья закрыла её: внесла чеки и нажала «это все» или отметила «покупок не было».
// Количество сахара на стрик не влияет (иначе люди прятали бы чеки) — только на цвет кубика недели.
// Чистые функции; считает сервер, клиенты повторяют расчёт для мгновенного отклика. Зеркало на Dart — mobile/lib/core/streak.dart.
import { addDays, endOfDay, nextWeek, todayIso, weekOf } from './calendar';

/** Закрытие недели семьёй. */
export type WeekMark = {
  /** понедельник недели */
  week: string;
  /** closed — «внёс все чеки», none — «покупок не было», open — закрытие отменили */
  state: 'closed' | 'none' | 'open';
  updatedAt: number;
};

/** Что известно о неделе из журнала. */
export type WeekFact = { receipts: number; ratio: number };

export const FREEZE_EVERY = 4;   // заморозка за каждые 4 засчитанные недели
export const FREEZE_MAX = 2;     // больше двух не копится
export const MILESTONES = [4, 12, 26, 52] as const;
/** До конца понедельника можно закрыть прошлую неделю. */
export const closeDeadline = (week: string): number => endOfDay(addDays(week, 7));
/** Сервер принимает ещё двое суток: закрыли вовремя, но телефон был без сети. */
export const OFFLINE_GRACE_MS = 2 * 86_400_000;

/** full — в норме, outline — выше нормы, none — без покупок, frozen — пропуск на заморозке, miss — сгорела, now — идёт, late — ещё можно закрыть */
export type WeekCell = { week: string; kind: 'full' | 'outline' | 'none' | 'frozen' | 'miss' | 'now' | 'late'; closed: boolean };

export type Streak = {
  /** недель подряд */
  current: number;
  best: number;
  /** заморозок в запасе */
  freezes: number;
  /** всего засчитано недель */
  total: number;
  /** последняя веха, которую прошёл текущий или лучший стрик (для вида кубиков): 0, 4, 12, 26, 52 */
  level: number;
  /** следующая веха или null */
  next: number | null;
  cells: WeekCell[];
};

export function weekKind(mark: WeekMark | undefined, fact: WeekFact | undefined): 'full' | 'outline' | 'none' | null {
  if (mark?.state === 'none' && !fact?.receipts) return 'none';
  // отметили «не было», а потом чек нашёлся — неделя всё равно закрыта, судим по чекам
  if ((mark?.state === 'closed' || mark?.state === 'none') && fact?.receipts) return fact.ratio <= 1 ? 'full' : 'outline';
  return null;
}

/**
 * @param marks  отметки закрытия
 * @param facts  сколько чеков и какая доля нормы сахара по неделям
 * @param now    момент времени
 * @param show   сколько последних недель вернуть в cells
 */
export function computeStreak(marks: WeekMark[], facts: Map<string, WeekFact>, now: number = Date.now(), show = 12): Streak {
  const byWeek = new Map(marks.map(m => [m.week, m]));
  const thisWeek = weekOf(todayIso(now));
  const counted = marks.filter(m => m.week <= thisWeek && weekKind(m, facts.get(m.week))).map(m => m.week).sort();
  let current = 0, best = 0, freezes = 0, total = 0;
  const cells: WeekCell[] = [];

  if (counted.length) {
    for (let w = counted[0]; w <= thisWeek; w = nextWeek(w)) {
      const kind = weekKind(byWeek.get(w), facts.get(w));
      if (kind) {
        current++; total++;
        if (current % FREEZE_EVERY === 0) freezes = Math.min(FREEZE_MAX, freezes + 1);
        best = Math.max(best, current);
        cells.push({ week: w, kind, closed: true });
      } else if (w === thisWeek) {
        cells.push({ week: w, kind: 'now', closed: false });
      } else if (now <= closeDeadline(w)) {
        cells.push({ week: w, kind: 'late', closed: false }); // понедельник: ещё можно дозаписать, стрик не трогаем
      } else if (freezes > 0 && current > 0) {
        freezes--;
        cells.push({ week: w, kind: 'frozen', closed: false });
      } else {
        current = 0; freezes = 0;
        cells.push({ week: w, kind: 'miss', closed: false });
      }
    }
  } else {
    cells.push({ week: thisWeek, kind: 'now', closed: false });
  }

  const level = [...MILESTONES].reverse().find(m => best >= m) ?? 0;
  return { current, best, freezes, total, level, next: MILESTONES.find(m => m > current) ?? null, cells: cells.slice(-show) };
}

/** Какую неделю сейчас предлагаем закрыть: в понедельник — прошлую, если она открыта, иначе текущую. */
export function weekToClose(marks: WeekMark[], facts: Map<string, WeekFact>, now: number = Date.now()): string {
  const thisWeek = weekOf(todayIso(now));
  const prev = addDays(thisWeek, -7);
  const byWeek = new Map(marks.map(m => [m.week, m]));
  const open = !weekKind(byWeek.get(prev), facts.get(prev));
  const started = marks.some(m => m.week < thisWeek && m.state !== 'open') || (facts.get(prev)?.receipts ?? 0) > 0;
  return open && started && now <= closeDeadline(prev) ? prev : thisWeek;
}

/** Можно ли закрывать неделю: началась, не позже срока (с запасом для офлайна). */
export const canClose = (week: string, now: number = Date.now(), grace = 0): boolean =>
  weekOf(week) === week && week <= weekOf(todayIso(now)) && now <= closeDeadline(week) + grace;

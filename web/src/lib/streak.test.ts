import { describe, expect, it } from 'vitest';
import { addDays } from './calendar';
import { canClose, closeDeadline, computeStreak, OFFLINE_GRACE_MS, weekToClose, type WeekFact, type WeekMark } from './streak';

const W0 = '2026-09-07'; // понедельник
const w = (n: number) => addDays(W0, n * 7);
const mark = (n: number, state: WeekMark['state'] = 'closed'): WeekMark => ({ week: w(n), state, updatedAt: 1 });
const facts = (m: Record<number, [number, number]>) => new Map<string, WeekFact>(Object.entries(m).map(([n, [receipts, ratio]]) => [w(+n), { receipts, ratio }]));
/** среда недели n, полдень Казахстана */
const wed = (n: number) => Date.parse(addDays(w(n), 2) + 'T07:00:00Z');
/** понедельник недели n, полдень */
const mon = (n: number) => Date.parse(w(n) + 'T07:00:00Z');

const full = (n: number): Record<number, [number, number]> => Object.fromEntries(Array.from({ length: n }, (_, i) => [i, [3, 0.8]]));
const closed = (n: number) => Array.from({ length: n }, (_, i) => mark(i));

describe('computeStreak', () => {
  it('пусто — ноль, текущая неделя идёт', () => {
    const s = computeStreak([], new Map(), wed(0));
    expect(s).toMatchObject({ current: 0, best: 0, freezes: 0, total: 0, level: 0, next: 4 });
    expect(s.cells).toEqual([{ week: w(0), kind: 'now', closed: false }]);
  });

  it('первая неделя засчитывается сразу после закрытия', () => {
    expect(computeStreak([mark(0)], facts({ 0: [1, 0.5] }), wed(0)).current).toBe(1);
  });

  it('много сахара не сжигает стрик, меняется только кубик', () => {
    const s = computeStreak([mark(0), mark(1)], facts({ 0: [2, 0.9], 1: [2, 3.5] }), wed(1));
    expect(s.current).toBe(2);
    expect(s.cells.map(c => c.kind)).toEqual(['full', 'outline']);
  });

  it('«покупок не было» засчитывается, а без чеков и без этой отметки — нет', () => {
    expect(computeStreak([mark(0, 'none')], new Map(), wed(0)).current).toBe(1);
    expect(computeStreak([mark(0, 'closed')], new Map(), wed(0)).current).toBe(0); // чек удалили — неделя пересчиталась
  });

  it('текущая незакрытая неделя стрик не рвёт', () => {
    const s = computeStreak(closed(3), facts(full(3)), wed(3));
    expect(s.current).toBe(3);
    expect(s.cells.at(-1)!.kind).toBe('now');
  });

  it('в понедельник ещё можно дозаписать, во вторник неделя сгорает', () => {
    expect(computeStreak(closed(2), facts(full(2)), mon(3)).current).toBe(2);
    expect(computeStreak(closed(2), facts(full(2)), mon(3)).cells.at(-2)!.kind).toBe('late');
    const tue = computeStreak(closed(2), facts(full(2)), mon(3) + 86_400_000);
    expect(tue.current).toBe(0);
    expect(tue.best).toBe(2);
    expect(tue.cells.at(-2)!.kind).toBe('miss');
  });

  it('заморозка копится за 4 недели, тратится сама и не увеличивает стрик', () => {
    const s = computeStreak([...closed(4), mark(5)], facts({ ...full(4), 5: [1, 0.5] }), wed(5));
    expect(s.current).toBe(5);
    expect(s.freezes).toBe(0);
    expect(s.cells[4].kind).toBe('frozen');
  });

  it('больше двух заморозок не копится; два пропуска подряд закрывают, третий сжигает', () => {
    const base = closed(12), f = facts(full(12));
    expect(computeStreak(base, f, wed(11)).freezes).toBe(2);
    expect(computeStreak(base, f, wed(14)).current).toBe(12);
    expect(computeStreak(base, f, wed(15)).current).toBe(0);
    expect(computeStreak(base, f, wed(15)).best).toBe(12);
  });

  it('после сгорания новый стрик начинается без заморозок', () => {
    const s = computeStreak([mark(0), mark(2)], facts({ 0: [1, 0.5], 2: [1, 0.5] }), wed(2));
    expect(s).toMatchObject({ current: 1, best: 1, freezes: 0, total: 2 });
  });

  it('вехи и ограничение ряда', () => {
    const s = computeStreak(closed(13), facts(full(13)), wed(12));
    expect(s.level).toBe(12);
    expect(s.next).toBe(26);
    expect(s.cells).toHaveLength(12);
  });

  it('отменённое закрытие и отметка из будущего не считаются', () => {
    expect(computeStreak([mark(0, 'open')], facts(full(1)), wed(0)).current).toBe(0);
    expect(computeStreak([mark(5)], facts({ 5: [2, 0.5] }), wed(0)).current).toBe(0);
  });
});

describe('закрытие недели', () => {
  it('срок — конец понедельника по Казахстану, серверу даём запас на офлайн', () => {
    expect(closeDeadline(w(0))).toBe(Date.parse('2026-09-14T19:00:00Z'));
    expect(canClose(w(0), closeDeadline(w(0)))).toBe(true);
    expect(canClose(w(0), closeDeadline(w(0)) + 1)).toBe(false);
    expect(canClose(w(0), closeDeadline(w(0)) + 1, OFFLINE_GRACE_MS)).toBe(true);
    expect(canClose(addDays(w(0), 1), wed(0))).toBe(false); // не понедельник
    expect(canClose(w(1), wed(0))).toBe(false);             // ещё не началась
  });
  it('в понедельник предлагаем прошлую неделю, потом текущую', () => {
    const f = facts({ 0: [2, 0.5] });
    expect(weekToClose([], f, mon(1))).toBe(w(0));
    expect(weekToClose([mark(0)], f, mon(1))).toBe(w(1));
    expect(weekToClose([], f, wed(1))).toBe(w(1));
    expect(weekToClose([], new Map(), mon(1))).toBe(w(1));
  });
});

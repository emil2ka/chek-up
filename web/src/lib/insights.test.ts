import { describe, expect, it } from 'vitest';
import { CATALOG, searchCatalog } from './catalog';
import { addDays } from './calendar';
import { analyze } from './engine';
import { RECEIPTS } from './data';
import { badges, completeness, goalState, monthStats, weekFacts, weekStats } from './insights';
import { familyDailyCubes, familyDailyG } from './profile';
import type { WeekMark } from './streak';
import type { HistoryEntry, Receipt, ReceiptItem } from './types';

const NOW = Date.parse('2026-11-18T07:00:00Z'); // среда
const WEEK = '2026-11-16';
const solo = { adults: 1, kids: 0 };
const cola: ReceiptItem = { n: 'Кола, 1 л', p: 620, s: 106, k: 420, junk: 1, swap: { n: 'Минералка, 1 л', p: 280, s: 0 } };
const bread: ReceiptItem = { n: 'Хлеб ржаной', p: 300, s: 4, k: 900 };
const sugar: ReceiptItem = { n: 'Сахар-песок 1 кг', p: 500, s: 1000, k: 4000, w: 8 };
const soap: ReceiptItem = { n: 'Порошок стиральный', p: 3000, s: 0, nf: 1 };

let seq = 0;
const entry = (date: string, items: ReceiptItem[], extra: Partial<HistoryEntry> = {}, rec: Partial<Receipt> = {}): HistoryEntry => {
  const id = `e${++seq}`;
  return { id, receiptId: `r${id}`, store: 'Magnum', date, cubes: 0, score: 0, swaps: [], savedAt: seq, ...extra, receipt: { id: `r${id}`, title: 'Чек', store: 'Magnum', date, items, approx: true, ...rec } };
};
const demo = (receiptId: string): HistoryEntry => {
  const r = RECEIPTS.find(x => x.id === receiptId)!;
  return { id: `d-${receiptId}`, receiptId, store: r.store, date: r.date, cubes: 0, score: 0, swaps: [], savedAt: 0 };
};
const closed = (...weeks: string[]): WeekMark[] => weeks.map(week => ({ week, state: 'closed', updatedAt: 1 }));
const back = (n: number) => addDays(WEEK, -7 * n);

describe('норма семьи', () => {
  it('складывает взрослых и детей', () => {
    expect(familyDailyG({ adults: 2, kids: 1 })).toBe(130);
    expect(familyDailyCubes({ adults: 2, kids: 1 })).toBe(26);
  });
});

describe('weekStats', () => {
  it('пустой журнал — семь дней с понедельника и нули', () => {
    const w = weekStats([], solo, { now: NOW });
    expect(w.days.map(d => d.iso)).toEqual(['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22']);
    expect(w.days[2].today).toBe(true);
    expect(w.days[3].future).toBe(true);
    expect(w.cubes).toBe(0);
    expect(w.normCubes).toBe(70);
  });

  it('включённая замена не меняет факт', () => {
    const a = weekStats([entry('2026-11-16', [cola, bread])], solo, { now: NOW });
    const b = weekStats([entry('2026-11-16', [cola, bread], { swaps: [0] })], solo, { now: NOW });
    expect(a.metrics.sugar.total).toBe(110);
    expect(b.metrics.sugar.total).toBe(110);
    expect(b.saved).toBe(0);
    expect(b.total).toBe(920);
  });

  it('подтверждённая замена попадает в неделю, когда её подтвердили', () => {
    const list = [entry('2026-11-10', [cola], { swaps: [0] }), entry('2026-11-17', [{ n: 'Вода минеральная 1 л', p: 300, s: 0 }])];
    const w = weekStats(list, solo, { now: NOW });
    expect(w.saved).toBe(320);
    expect(w.cubesSaved).toBe(21);
    expect(weekStats(list, solo, { week: back(1) }).saved).toBe(0);
  });

  it('запас растягивается на недели, а деньги — на неделю покупки', () => {
    const list = [entry('2026-11-16', [sugar])];
    expect(weekStats(list, solo, { now: NOW }).metrics.sugar.total).toBe(125);
    expect(weekStats(list, solo, { now: NOW }).total).toBe(500);
    const later = weekStats(list, solo, { week: addDays(WEEK, 49) });
    expect(later.metrics.sugar.total).toBe(125);
    expect(later.metrics.sugar.fromStock).toBe(125);
    expect(later.total).toBe(0);
    expect(weekStats(list, solo, { week: addDays(WEEK, 56) }).metrics.sugar.total).toBe(0);
    const all = Array.from({ length: 9 }, (_, i) => weekStats([entry('2026-11-19', [sugar])], solo, { week: addDays(WEEK, i * 7) }).metrics.sugar.total);
    expect(Math.round(all.reduce((a, b) => a + b, 0))).toBe(1000); // ничего не потерялось и не задвоилось
  });

  it('возврат вычитается и из денег, и из показателей', () => {
    const w = weekStats([entry('2026-11-16', [cola, bread]), entry('2026-11-17', [cola], {}, { refund: true })], solo, { now: NOW });
    expect(w.total).toBe(300);
    expect(w.metrics.sugar.total).toBe(4);
    expect(w.receipts).toHaveLength(1);
    expect(w.refunds).toHaveLength(1);
  });

  it('«не для нас», «гости» и не-еда', () => {
    const off = weekStats([entry('2026-11-16', [cola, bread], { off: [0] })], solo, { now: NOW });
    expect(off.metrics.sugar.total).toBe(4);
    expect(off.total).toBe(300);
    const guests = weekStats([entry('2026-11-16', [cola], { tag: 'guests' })], solo, { now: NOW });
    expect(guests.metrics.sugar.total).toBe(0);
    expect(guests.total).toBe(620);
    expect(guests.guests).toBe(1);
    const nf = weekStats([entry('2026-11-16', [bread, soap])], solo, { now: NOW });
    expect(nf.total).toBe(3300);
    expect(nf.food).toBe(300);
  });

  it('дни вне недели и битые даты не считаются', () => {
    const w = weekStats([entry('2026-11-15', [cola]), entry('2026-11-23', [cola]), entry('мусор', [cola])], solo, { now: NOW });
    expect(w.receipts).toHaveLength(0);
    expect(w.metrics.sugar.total).toBe(0);
  });
});

describe('weekFacts и полнота', () => {
  it('демо-чеки в стрик не идут', () => {
    expect(weekFacts([demo('week'), demo('party')], solo).size).toBe(0);
    expect(weekFacts([entry('2026-11-16', [cola])], solo).get(WEEK)).toMatchObject({ receipts: 1 });
  });
  it('быстрый расчёт совпадает с подробной неделей, в том числе с запасами', () => {
    const list = [entry('2026-11-05', [sugar, bread]), entry('2026-11-12', [cola]), entry(WEEK, [bread], { off: [] }), entry('2026-11-17', [cola], { tag: 'guests' }), entry('2026-11-18', [bread], {}, { refund: true })];
    for (const [week, f] of weekFacts(list, solo)) {
      const s = weekStats(list, solo, { week });
      expect(f.receipts).toBe(s.receipts.length);
      expect(f.ratio).toBeCloseTo(s.ratio, 5);
    }
  });
  it('«обычно» — среднее по закрытым неделям', () => {
    const list = [entry(back(1), [cola]), entry(back(1), [bread]), entry(back(2), [cola]), entry(back(2), [bread]), entry(WEEK, [cola])];
    expect(completeness(list, closed(back(1), back(2)), WEEK)).toEqual({ now: 1, usual: 2 });
    expect(completeness(list, [], WEEK)).toEqual({ now: 1, usual: 0 });
  });
});

describe('цель', () => {
  it('считается от среднего закрытых недель, без них не появляется', () => {
    const list = [entry(back(1), [cola]), entry(back(2), [cola, cola]), entry(WEEK, [bread])];
    expect(goalState(list, solo, [], 10, { now: NOW }).base).toBe(0);
    const g = goalState(list, solo, closed(back(1), back(2)), 10, { now: NOW });
    expect(g).toMatchObject({ base: 2, average: 32, target: 29, now: 1 });
  });
});

describe('месяц', () => {
  it('суммирует по датам покупки и по магазинам', () => {
    const m = monthStats([entry('2026-11-03', [cola, soap]), entry('2026-11-20', [bread]), entry('2026-10-31', [cola]), entry('2026-11-21', [bread], {}, { refund: true })], '2026-11');
    expect(m).toMatchObject({ receipts: 2, total: 3620, food: 620, junk: 620, cubes: 21 });
    expect(m.stores[0]).toEqual({ name: 'Magnum', total: 3620, n: 2 });
  });
});

describe('достижения', () => {
  const get = (list: ReturnType<typeof badges>, id: string) => list.find(b => b.id === id)!;
  it('нажатия и демо-чеки ничего не дают', () => {
    expect(badges([demo('week'), demo('fit')], solo, [], 0).every(b => !b.done)).toBe(true);
    expect(get(badges([entry(WEEK, [cola], { swaps: [0] })], solo, [], 0), 'swap').done).toBe(false);
  });
  it('подтверждённая замена, чистая корзина, неделя в норме и стрик', () => {
    const list = [entry(back(1), [cola], { swaps: [0] }), entry(WEEK, [{ n: 'Вода минеральная', p: 300, s: 0 }, { ...bread }]), entry(WEEK, [bread])];
    const b = badges(list, solo, closed(WEEK), 5);
    expect(get(b, 'swap').done).toBe(true);
    expect(get(b, 'clean').done).toBe(true);
    expect(get(b, 'norm').done).toBe(true);
    expect(get(b, 'streak4').done).toBe(true);
    expect(get(b, 'streak12').progress).toEqual([5, 12]);
    expect(get(b, 'saver').progress).toEqual([320, 1000]);
  });
});

describe('справочник продуктов', () => {
  it('уникальные id и поиск без учёта регистра и ё', () => {
    expect(new Set(CATALOG.map(c => c.id)).size).toBe(CATALOG.length);
    expect(searchCatalog('КОЛА', 'all').length).toBeGreaterThanOrEqual(2);
    expect(searchCatalog('мед', 'all').some(c => c.id === 'honey')).toBe(true);
    expect(searchCatalog('такогонет', 'all')).toHaveLength(0);
  });
});

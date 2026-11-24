// Сверка с мобильным приложением: одни и те же случайные (но постоянные) данные считают оба языка.
// Эталон — mobile/test/golden.json; его же читает mobile/test/golden_test.dart.
// Изменил формулы: UPDATE_GOLDEN=1 pnpm test golden — и поправь Dart, пока его тест не сойдётся.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { addDays } from './calendar';
import { advise, cartAnalysis, cartMoney, decide, moves, weekAdd } from './cart';
import { analyze } from './engine';
import { completeness, goalState, monthStats, receiptOf, weekFacts, weekStats } from './insights';
import { confirmedSwaps, findDuplicate, sameFood } from './plan';
import { computeStreak, weekToClose, type WeekMark } from './streak';
import type { Cart, HistoryEntry, Receipt, ReceiptItem } from './types';

let seed = 20261124;
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const int = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
const pick = <T,>(l: readonly T[]): T => l[int(0, l.length - 1)];
const NOW = Date.parse('2026-11-24T07:00:00Z');

const FOODS = ['Кола 1 л', 'Минералка с лимоном, 1 л', 'Хлеб ржаной 400 г', 'Чипсы 150 г', 'Сахар-песок 1 кг', 'Йогурт питьевой 270 г', 'Кефир 1%, 900 мл', 'Пиво светлое 0,5 л', 'Порошок стиральный', 'Яблоки весовые 1,2 кг', 'Шоколад молочный 90 г', 'Орехи и сухофрукты, 90 г'];
const item = (): ReceiptItem => {
  const n = pick(FOODS), nf = n === 'Порошок стиральный';
  if (nf) return { n, p: int(500, 5000), s: 0, nf: 1 };
  return {
    n, p: int(100, 3000), s: int(0, 120), t: int(0, 40) / 10, f: int(0, 300) / 10, k: int(0, 1200), c: int(0, 200), b: int(0, 60),
    ...(rnd() < 0.3 ? { junk: 1 as const } : {}), ...(n.startsWith('Пиво') ? { x: 'alcohol' as const } : {}), ...(n.startsWith('Сахар') ? { w: int(2, 10) } : {}),
    ...(rnd() < 0.4 ? { swap: { n: pick(FOODS), p: int(100, 2000), s: int(0, 30), t: int(0, 10) / 10, f: int(0, 50) / 10, k: int(0, 400), c: int(0, 60), b: int(0, 30) } } : {}),
  };
};
const receipt = (id: string, date: string): Receipt => ({
  id, title: 'Чек', store: pick(['Magnum', 'Small', 'Galmart']), date, items: Array.from({ length: int(1, 9) }, item), approx: true,
  ...(rnd() < 0.1 ? { refund: true } : {}),
});
const entry = (i: number): HistoryEntry => {
  const date = addDays('2026-09-07', int(0, 84)), r = receipt(`r${i}`, date);
  const any = () => r.items.flatMap((_, k) => (rnd() < 0.2 ? [k] : []));
  return { id: `e${String(i).padStart(3, '0')}`, receiptId: r.id, store: r.store, date, cubes: 0, score: 0, swaps: any(), off: any(), ...(rnd() < 0.1 ? { tag: 'guests' as const } : {}), savedAt: i, receipt: r };
};

function build() {
  const entries = Array.from({ length: 60 }, (_, i) => entry(i));
  const p = { adults: 2, kids: 1 };
  const marks: WeekMark[] = Array.from({ length: 11 }, (_, i) => ({ week: addDays('2026-09-07', i * 7), state: pick(['closed', 'closed', 'closed', 'none', 'open'] as const), updatedAt: i }));
  const facts = weekFacts(entries, p);
  const weeks = ['2026-09-14', '2026-10-05', '2026-11-16', '2026-11-23'];
  const dup = entries.slice(0, 12).map(e => ({ ...e.receipt!, id: `${e.receiptId}-copy`, items: e.receipt!.items.map((it, k) => (k === 0 && rnd() < 0.5 ? { ...it, p: it.p + 1 } : it)) }));
  return JSON.parse(JSON.stringify({
    now: NOW, profile: p, entries, marks, dup,
    analyze: entries.map(e => { const a = analyze(e.receipt!, e.swaps, e.off); return { score: a.score, total: a.total, food: a.food, junk: a.junk, off: a.offCount, totals: a.totals, cubes: a.cubesBy, flagged: a.flagged.sum, why: a.why.map(w => [w.k, w.pts]) }; }),
    facts: Object.fromEntries([...facts].map(([w, f]) => [w, [f.receipts, Math.round(f.ratio * 1e6) / 1e6]])),
    weeks: weeks.map(week => { const s = weekStats(entries, p, { week, now: NOW }); return { week, total: s.total, food: s.food, junk: s.junk, flagged: s.flagged, saved: s.saved, cubesSaved: s.cubesSaved, guests: s.guests, n: s.receipts.length, refunds: s.refunds.length, sugar: s.metrics.sugar.total, salt: s.metrics.salt.total, stock: s.metrics.sugar.fromStock, sources: s.metrics.sugar.sources.map(x => [x.name, x.value]), days: s.days.map(d => d.amounts.sugar) }; }),
    month: (() => { const m = monthStats(entries, '2026-10'); return { receipts: m.receipts, total: m.total, food: m.food, junk: m.junk, cubes: m.cubes, saved: m.saved, stores: m.stores.map(s => [s.name, s.total, s.n]) }; })(),
    confirmed: confirmedSwaps(entries, receiptOf).map(c => [c.planId, c.i, c.factId, c.money, c.saved.sugar]),
    streak: (() => { const s = computeStreak(marks, facts, NOW); return { current: s.current, best: s.best, freezes: s.freezes, total: s.total, level: s.level, next: s.next, cells: s.cells.map(c => [c.week, c.kind]) }; })(),
    streakEdges: ['2026-11-23T10:00:00Z', '2026-11-23T18:59:00Z', '2026-11-23T19:01:00Z', '2026-11-29T18:00:00Z'].map(at => { const ms = Date.parse(at), s = computeStreak(marks, facts, ms); return [ms, s.current, s.freezes, s.cells.map(c => c.kind).join(), weekToClose(marks, facts, ms)]; }),
    goal: goalState(entries, p, marks, 10, { week: '2026-11-23', now: NOW }),
    completeness: completeness(entries, marks, '2026-11-16'),
    duplicates: dup.map(r => findDuplicate(r, entries, receiptOf)?.id ?? null),
    cart: entries.slice(0, 24).map((e, k) => {
      const items = e.receipt!.items.map(it => (k % 2 ? { ...it, p: 0, ...(it.swap ? { swap: { ...it.swap, p: 0 } } : {}) } : it));
      const c: Cart = { id: e.id, createdAt: 0, date: e.date, kind: 'basket', store: '', hidden: false, items, out: [], swaps: [] };
      const list = moves(items), d = decide(list), a = advise(c), done = { ...c, ...d };
      return { moves: list.map(m => [m.i, m.kind, m.metric, m.gain]), enough: a.enough, metric: a.metric, cubes: [a.before.cubes, a.after.cubes], score: [cartAnalysis(c).score, cartAnalysis(done).score], money: cartMoney(done), week: Math.round(weekAdd(done, d.out, d.swaps, 'sugar') * 1000) / 1000 };
    }),
    same: FOODS.flatMap(a => FOODS.map(b => (sameFood(a, b) ? 1 : 0))),
  }));
}

it('совпадает с эталоном для мобильного приложения', () => {
  const file = join(__dirname, '../../../mobile/test/golden.json');
  const got = build();
  if (process.env.UPDATE_GOLDEN || !existsSync(file)) writeFileSync(file, JSON.stringify(got));
  expect(got).toEqual(JSON.parse(readFileSync(file, 'utf8')));
});

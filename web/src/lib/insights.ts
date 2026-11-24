// Неделя и достижения: чистые расчёты поверх истории чеков (без DOM).
import { RECEIPTS } from './data';
import { analyze, cubesOfValue, METRIC_IDS, valueOf } from './engine';
import { familyDaily, type Profile } from './profile';
import type { Analysis, HistoryEntry, MetricId, Receipt } from './types';

export const receiptOf = (e: HistoryEntry): Receipt | null => e.receipt ?? RECEIPTS.find(r => r.id === e.receiptId) ?? null;

const DOW = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
const isoOf = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export type DayStat = {
  iso: string; label: string; day: number;
  /** кубиков сахара за день (как раньше) */
  cubes: number;
  /** кубиков по каждому показателю */
  by: Record<MetricId, number>;
  amounts: Record<MetricId, number>;
  today: boolean;
};
export type WeekReceipt = { entry: HistoryEntry; receipt: Receipt; analysis: Analysis; base: Analysis };

/** Неделя по одному показателю. */
export type MetricWeek = {
  /** всего за неделю: г (сахар, соль, жиры) или ккал */
  total: number;
  cubes: number;
  /** норма семьи на 7 дней, кубиков */
  normCubes: number;
  norm: number;
  /** доля от недельной нормы, 0..∞ */
  ratio: number;
  /** главные источники: название и количество */
  sources: { name: string; value: number }[];
  /** на сколько кубиков заменами стало меньше */
  cubesSaved: number;
  amountSaved: number;
};

export type WeekStats = {
  days: DayStat[];
  receipts: WeekReceipt[];
  /** добавленный сахар за неделю, г */
  sugar: number;
  cubes: number;
  /** потрачено на вредное, ₸ */
  junk: number;
  total: number;
  /** на алкоголь и энергетики, ₸ */
  flagged: number;
  /** сэкономлено заменами, ₸ (может быть отрицательным) */
  saved: number;
  cubesSaved: number;
  /** норма семьи на 7 дней, кубиков (сахар) */
  normCubes: number;
  /** доля от недельной нормы, 0..∞ (сахар) */
  ratio: number;
  sources: { name: string; grams: number }[];
  /** то же самое по каждому показателю */
  metrics: Record<MetricId, MetricWeek>;
  from: string;
  to: string;
};

/** Последние 7 дней, включая сегодня; чек относится к дню своей даты. */
export function weekStats(entries: HistoryEntry[], p: Pick<Profile, 'adults' | 'kids'>, now = new Date()): WeekStats {
  const zero = (): Record<MetricId, number> => ({ sugar: 0, salt: 0, fat: 0, kcal: 0, carbs: 0, protein: 0 });
  const days: DayStat[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    days.push({ iso: isoOf(d), label: DOW[d.getDay()], day: d.getDate(), cubes: 0, by: zero(), amounts: zero(), today: i === 0 });
  }
  const byIso = new Map(days.map(d => [d.iso, d]));

  const receipts: WeekReceipt[] = [];
  const bySource = Object.fromEntries(METRIC_IDS.map(m => [m, new Map<string, number>()])) as Record<MetricId, Map<string, number>>;
  const amount = zero(), cubesSavedBy = zero(), amountSaved = zero();
  let junk = 0, total = 0, saved = 0, flagged = 0;

  for (const entry of entries) {
    const day = byIso.get(entry.date);
    const receipt = receiptOf(entry);
    if (!day || !receipt) continue;
    const analysis = analyze(receipt, entry.swaps);
    const base = analyze(receipt, []);
    receipts.push({ entry, receipt, analysis, base });
    junk += analysis.junk; total += analysis.total; flagged += analysis.flagged.sum;
    saved += base.total - analysis.total;
    for (const m of METRIC_IDS) {
      amount[m] += analysis.totals[m];
      day.by[m] += analysis.cubesBy[m];
      day.amounts[m] += analysis.totals[m];
      amountSaved[m] += base.totals[m] - analysis.totals[m];
      cubesSavedBy[m] += base.cubesBy[m] - analysis.cubesBy[m];
      for (const it of analysis.items) {
        const v = valueOf(it.active, m);
        if (v > 0) bySource[m].set(it.active.n, (bySource[m].get(it.active.n) ?? 0) + v);
      }
    }
    day.cubes = day.by.sugar;
  }

  const metrics = Object.fromEntries(METRIC_IDS.map(m => {
    const norm = familyDaily(p, m) * 7;
    const normCubes = cubesOfValue(norm, m);
    const cubes = cubesOfValue(amount[m], m);
    const sources = [...bySource[m]].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 4);
    return [m, { total: Math.round(amount[m] * 10) / 10, cubes, normCubes, norm, ratio: norm ? amount[m] / norm : 0, sources, cubesSaved: cubesSavedBy[m], amountSaved: amountSaved[m] } satisfies MetricWeek];
  })) as Record<MetricId, MetricWeek>;

  const sugar = metrics.sugar;
  return {
    days, receipts, sugar: sugar.total, cubes: sugar.cubes, junk, total, flagged, saved, cubesSaved: sugar.cubesSaved,
    normCubes: sugar.normCubes, ratio: sugar.ratio,
    sources: sugar.sources.map(s => ({ name: s.name, grams: s.value })),
    metrics, from: days[0].iso, to: days[6].iso,
  };
}

// ── Достижения ──
export type Badge = {
  id: string;
  title: string;
  desc: string;
  done: boolean;
  /** прогресс для накопительных: [сейчас, цель] */
  progress?: [number, number];
  icon: 'receipt' | 'stack' | 'swap' | 'leaf' | 'bomb' | 'coin' | 'minus' | 'shield' | 'crown';
};

export function badges(entries: HistoryEntry[], p: Pick<Profile, 'adults' | 'kids'>, now = new Date()): Badge[] {
  let saved = 0, cubesSaved = 0, swapped = false, clean = false, bomb = false;
  for (const e of entries) {
    const r = receiptOf(e);
    if (!r) continue;
    const a = analyze(r, e.swaps), b = analyze(r, []);
    saved += b.total - a.total;
    cubesSaved += b.cubes - a.cubes;
    if (e.swaps.length) swapped = true;
    if (a.score >= 80) clean = true;
    if (b.score < 40) bomb = true;
  }
  const w = weekStats(entries, p, now);
  const n = entries.length;
  const cap = (v: number, goal: number): [number, number] => [Math.max(0, Math.min(goal, Math.round(v))), goal];

  return [
    { id: 'first', icon: 'receipt', title: 'Первый чек', desc: 'Посмотри сахар в первом чеке', done: n >= 1 },
    { id: 'swap', icon: 'swap', title: 'Первая замена', desc: 'Включи замену в любом чеке', done: swapped },
    { id: 'three', icon: 'stack', title: 'Три чека', desc: 'Собери три чека в истории', done: n >= 3, progress: cap(n, 3) },
    { id: 'clean', icon: 'leaf', title: 'Чистая корзина', desc: 'Чек с оценкой 80 и выше', done: clean },
    { id: 'bomb', icon: 'bomb', title: 'Корзина-бомба', desc: 'Найди чек с оценкой ниже 40', done: bomb },
    { id: 'minus50', icon: 'minus', title: 'Минус 50 кубиков', desc: 'Убери заменами 50 кубиков сахара', done: cubesSaved >= 50, progress: cap(cubesSaved, 50) },
    { id: 'saver', icon: 'coin', title: 'Экономист', desc: 'Сэкономь заменами 1 000 ₸', done: saved >= 1000, progress: cap(saved, 1000) },
    { id: 'norm', icon: 'shield', title: 'Неделя в норме', desc: 'Два чека за неделю и сахар не выше нормы семьи', done: w.receipts.length >= 2 && w.ratio <= 1 },
    { id: 'ten', icon: 'crown', title: 'Десять чеков', desc: 'Десять чеков в истории', done: n >= 10, progress: cap(n, 10) },
  ];
}

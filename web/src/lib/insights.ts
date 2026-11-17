// Неделя и достижения: чистые расчёты поверх истории чеков (без DOM).
import { RECEIPTS } from './data';
import { analyze, CUBE_G } from './engine';
import { familyDailyG, type Profile } from './profile';
import type { Analysis, HistoryEntry, Receipt } from './types';

export const receiptOf = (e: HistoryEntry): Receipt | null => e.receipt ?? RECEIPTS.find(r => r.id === e.receiptId) ?? null;

const DOW = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
const isoOf = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export type DayStat = { iso: string; label: string; day: number; cubes: number; today: boolean };
export type WeekReceipt = { entry: HistoryEntry; receipt: Receipt; analysis: Analysis; base: Analysis };
export type WeekStats = {
  days: DayStat[];
  receipts: WeekReceipt[];
  /** добавленный сахар за неделю, г */
  sugar: number;
  cubes: number;
  /** потрачено на вредное, ₸ */
  junk: number;
  total: number;
  /** сэкономлено заменами, ₸ (может быть отрицательным) */
  saved: number;
  cubesSaved: number;
  /** норма семьи на 7 дней, кубиков */
  normCubes: number;
  /** доля от недельной нормы, 0..∞ */
  ratio: number;
  sources: { name: string; grams: number }[];
  from: string;
  to: string;
};

/** Последние 7 дней, включая сегодня; чек относится к дню своей даты. */
export function weekStats(entries: HistoryEntry[], p: Pick<Profile, 'adults' | 'kids'>, now = new Date()): WeekStats {
  const days: DayStat[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    days.push({ iso: isoOf(d), label: DOW[d.getDay()], day: d.getDate(), cubes: 0, today: i === 0 });
  }
  const byIso = new Map(days.map(d => [d.iso, d]));

  const receipts: WeekReceipt[] = [];
  const bySource = new Map<string, number>();
  let sugar = 0, junk = 0, total = 0, saved = 0, cubesSaved = 0;

  for (const entry of entries) {
    const day = byIso.get(entry.date);
    const receipt = receiptOf(entry);
    if (!day || !receipt) continue;
    const analysis = analyze(receipt, entry.swaps);
    const base = analyze(receipt, []);
    receipts.push({ entry, receipt, analysis, base });
    day.cubes += analysis.cubes;
    sugar += analysis.sugar; junk += analysis.junk; total += analysis.total;
    saved += base.total - analysis.total;
    cubesSaved += base.cubes - analysis.cubes;
    for (const it of analysis.items) {
      if (it.active.s > 0) bySource.set(it.active.n, (bySource.get(it.active.n) ?? 0) + it.active.s);
    }
  }

  const normCubes = Math.round(familyDailyG(p) * 7 / CUBE_G);
  const cubes = Math.round(sugar / CUBE_G);
  const sources = [...bySource].map(([name, grams]) => ({ name, grams })).sort((a, b) => b.grams - a.grams).slice(0, 4);

  return {
    days, receipts, sugar, cubes, junk, total, saved, cubesSaved, normCubes,
    ratio: normCubes ? cubes / normCubes : 0,
    sources, from: days[0].iso, to: days[6].iso,
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
    { id: 'bomb', icon: 'bomb', title: 'Сахарная бомба', desc: 'Найди чек с оценкой ниже 40', done: bomb },
    { id: 'minus50', icon: 'minus', title: 'Минус 50 кубиков', desc: 'Убери заменами 50 кубиков сахара', done: cubesSaved >= 50, progress: cap(cubesSaved, 50) },
    { id: 'saver', icon: 'coin', title: 'Экономист', desc: 'Сэкономь заменами 1 000 ₸', done: saved >= 1000, progress: cap(saved, 1000) },
    { id: 'norm', icon: 'shield', title: 'Неделя в норме', desc: 'Два чека за неделю и сахар не выше нормы семьи', done: w.receipts.length >= 2 && w.ratio <= 1 },
    { id: 'ten', icon: 'crown', title: 'Десять чеков', desc: 'Десять чеков в истории', done: n >= 10, progress: cap(n, 10) },
  ];
}

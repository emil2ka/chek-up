// Учёт: неделя, месяц, цель и достижения — чистые расчёты поверх журнала чеков (без DOM).
// Везде считаем ФАКТ: что куплено. Включённые замены — план, они попадают в экономию, только когда их подтвердил следующий чек (plan.ts).
// Зеркало на Dart — mobile/lib/core/insights.dart.
import { addDays, daysBetween, DOW_SHORT, isIso, monthOf, todayIso, weekDays, weekOf } from './calendar';
import { RECEIPTS } from './data';
import { cubesOfValue, METRIC_IDS, valueOf, weeksOf } from './engine';
import { confirmedSwaps, factOf, type ConfirmedSwap } from './plan';
import { familyDaily, type Profile } from './profile';
import type { WeekFact, WeekMark } from './streak';
import type { Analysis, HistoryEntry, MetricId, Receipt } from './types';

export const receiptOf = (e: HistoryEntry): Receipt | null => e.receipt ?? RECEIPTS.find(r => r.id === e.receiptId) ?? null;
/** Демо-чеки учим показывать, но в стрик, цель и достижения они не идут. */
export const isDemo = (e: HistoryEntry): boolean => !e.receipt && RECEIPTS.some(r => r.id === e.receiptId);

type Norm = Pick<Profile, 'adults' | 'kids'>;
const zero = (): Record<MetricId, number> => ({ sugar: 0, salt: 0, fat: 0, kcal: 0, carbs: 0, protein: 0 });
const round1 = (v: number) => Math.round(v * 10) / 10;

export type DayStat = {
  iso: string; label: string; day: number;
  /** кубиков сахара за день */
  cubes: number;
  amounts: Record<MetricId, number>;
  receipts: number;
  today: boolean;
  future: boolean;
};
export type WeekReceipt = { entry: HistoryEntry; receipt: Receipt; analysis: Analysis };

/** Неделя по одному показателю. */
export type MetricWeek = {
  /** всего за неделю: г или ккал */
  total: number;
  cubes: number;
  /** норма семьи на 7 дней */
  norm: number;
  normCubes: number;
  /** доля от недельной нормы, 0..∞ */
  ratio: number;
  /** главные источники */
  sources: { name: string; value: number }[];
  /** из них пришло из запасов, купленных раньше */
  fromStock: number;
};

export type WeekStats = {
  week: string;
  to: string;
  days: DayStat[];
  /** чеки этой недели (без возвратов — они отдельно) */
  receipts: WeekReceipt[];
  refunds: WeekReceipt[];
  cubes: number;
  normCubes: number;
  ratio: number;
  /** деньги по фактам, ₸ (возвраты вычтены) */
  total: number;
  food: number;
  junk: number;
  flagged: number;
  /** подтверждённые на этой неделе замены */
  confirmed: ConfirmedSwap[];
  saved: number;
  cubesSaved: number;
  /** показатели посчитаны не для всех чеков (есть «гости») */
  guests: number;
  metrics: Record<MetricId, MetricWeek>;
};

/** Доля позиции, приходящаяся на день, отстоящий от покупки на `age` дней. */
function dayShare(weeks: number, age: number): number {
  if (weeks <= 1) return age === 0 ? 1 : 0;
  return age >= 0 && age < weeks * 7 ? 1 / (weeks * 7) : 0;
}

/** Календарная неделя (понедельник–воскресенье) по факту. */
export function weekStats(entries: HistoryEntry[], p: Norm, opts: { week?: string; now?: number } = {}): WeekStats {
  const today = todayIso(opts.now);
  const week = opts.week ?? weekOf(today);
  const isos = weekDays(week), to = isos[6];
  const days: DayStat[] = isos.map((iso, i) => ({
    iso, label: DOW_SHORT[i], day: +iso.slice(8, 10), cubes: 0, amounts: zero(), receipts: 0, today: iso === today, future: iso > today,
  }));
  const receipts: WeekReceipt[] = [], refunds: WeekReceipt[] = [];
  const bySource = Object.fromEntries(METRIC_IDS.map(m => [m, new Map<string, number>()])) as Record<MetricId, Map<string, number>>;
  const amount = zero(), stock = zero();
  let total = 0, food = 0, junk = 0, flagged = 0, guests = 0;

  for (const entry of entries) {
    if (!isIso(entry.date) || entry.date > to) continue;
    const receipt = receiptOf(entry);
    if (!receipt) continue;
    const inWeek = entry.date >= week;
    const hasStock = receipt.items.some(it => weeksOf(it) > 1);
    if (!inWeek && !hasStock) continue;
    const analysis = factOf(entry, receipt);
    const sign = receipt.refund ? -1 : 1;
    if (inWeek) {
      (receipt.refund ? refunds : receipts).push({ entry, receipt, analysis });
      total += sign * analysis.total; food += sign * analysis.food; junk += sign * analysis.junk; flagged += sign * analysis.flagged.sum;
      if (entry.tag === 'guests') guests++;
      const day = days[daysBetween(week, entry.date)];
      if (!receipt.refund) day.receipts++;
    }
    if (entry.tag === 'guests') continue; // деньги посчитали, показатели — нет
    for (const it of analysis.items) {
      if (it.off || it.nf) continue;
      const weeks = weeksOf(it);
      for (let d = 0; d < 7; d++) {
        const share = dayShare(weeks, daysBetween(entry.date, isos[d])) * sign;
        if (!share) continue;
        for (const m of METRIC_IDS) {
          const v = valueOf(it, m) * share;
          if (!v) continue;
          amount[m] += v;
          days[d].amounts[m] += v;
          if (!inWeek) stock[m] += v;
          bySource[m].set(it.n, (bySource[m].get(it.n) ?? 0) + v);
        }
      }
    }
  }
  for (const d of days) {
    for (const m of METRIC_IDS) d.amounts[m] = Math.max(0, round1(d.amounts[m]));
    d.cubes = cubesOfValue(d.amounts.sugar, 'sugar');
  }

  const metrics = Object.fromEntries(METRIC_IDS.map(m => {
    const norm = familyDaily(p, m) * 7;
    const sum = Math.max(0, amount[m]);
    const sources = [...bySource[m]].map(([name, value]) => ({ name, value: round1(value) })).filter(s => s.value > 0).sort((a, b) => b.value - a.value).slice(0, 4);
    return [m, { total: round1(sum), cubes: cubesOfValue(sum, m), norm, normCubes: cubesOfValue(norm, m), ratio: norm ? sum / norm : 0, sources, fromStock: Math.max(0, round1(stock[m])) } satisfies MetricWeek];
  })) as Record<MetricId, MetricWeek>;

  const confirmed = confirmedSwaps(entries.filter(e => !isDemo(e)), receiptOf).filter(c => c.date >= week && c.date <= to);
  const byDate = (a: WeekReceipt, b: WeekReceipt) => b.entry.date.localeCompare(a.entry.date) || b.entry.savedAt - a.entry.savedAt;
  return {
    week, to, days, receipts: receipts.sort(byDate), refunds: refunds.sort(byDate),
    cubes: metrics.sugar.cubes, normCubes: metrics.sugar.normCubes, ratio: metrics.sugar.ratio,
    total: Math.round(total), food: Math.round(food), junk: Math.max(0, Math.round(junk)), flagged: Math.max(0, Math.round(flagged)),
    confirmed, saved: Math.round(confirmed.reduce((n, c) => n + c.money, 0)),
    cubesSaved: cubesOfValue(confirmed.reduce((n, c) => n + c.saved.sugar, 0), 'sugar'),
    guests, metrics,
  };
}

/** Что стрику нужно знать о каждой неделе: сколько чеков и какая доля нормы сахара. Демо-чеки не считаются. Один проход по журналу. */
export function weekFacts(entries: HistoryEntry[], p: Norm): Map<string, WeekFact> {
  const sugar = new Map<string, number>(), count = new Map<string, number>();
  for (const e of entries) {
    if (!isIso(e.date) || isDemo(e)) continue;
    const r = receiptOf(e);
    if (!r) continue;
    const first = weekOf(e.date), sign = r.refund ? -1 : 1;
    if (!r.refund) count.set(first, (count.get(first) ?? 0) + 1);
    if (e.tag === 'guests') continue;
    const off = new Set(e.off ?? []);
    r.items.forEach((it, i) => {
      if (off.has(i) || it.nf || !it.s) return;
      const weeks = weeksOf(it);
      if (weeks <= 1) { sugar.set(first, (sugar.get(first) ?? 0) + sign * it.s); return; }
      for (let d = 0; d < weeks * 7;) {
        const day = addDays(e.date, d), w = weekOf(day);
        const n = Math.min(weeks * 7 - d, 7 - daysBetween(w, day)); // сколько дней запаса приходится на эту неделю
        sugar.set(w, (sugar.get(w) ?? 0) + sign * it.s * n / (weeks * 7));
        d += n;
      }
    });
  }
  const norm = familyDaily(p, 'sugar') * 7;
  return new Map([...count].map(([w, receipts]) => [w, { receipts, ratio: norm ? Math.max(0, sugar.get(w) ?? 0) / norm : 0 }]));
}

// ── личная цель ──
export const GOALS = [5, 10, 20] as const;
export type GoalPct = (typeof GOALS)[number];
export type GoalState = {
  /** недель в основе (0..4); меньше двух — рано ставить цель */
  base: number;
  /** среднее кубиков за неделю */
  average: number;
  target: number;
  now: number;
};

const closedSet = (marks: WeekMark[]) => new Set(marks.filter(m => m.state !== 'open').map(m => m.week));

/** Цель: столько-то процентов от среднего за последние 4 ЗАКРЫТЫЕ недели до текущей. */
export function goalState(entries: HistoryEntry[], p: Norm, marks: WeekMark[], pct: number, opts: { week?: string; now?: number } = {}): GoalState {
  const week = opts.week ?? weekOf(todayIso(opts.now));
  const real = entries.filter(e => !isDemo(e));
  const base = [...closedSet(marks)].filter(w => w < week).sort().slice(-4);
  const sum = base.reduce((n, w) => n + weekStats(real, p, { week: w }).metrics.sugar.total, 0);
  const average = base.length ? cubesOfValue(sum / base.length, 'sugar') : 0;
  return { base: base.length, average, target: Math.round(average * (1 - pct / 100)), now: weekStats(real, p, { week }).cubes };
}

/** Полнота: сколько чеков внесено и сколько бывает обычно (среднее за последние 4 закрытые недели). */
export function completeness(entries: HistoryEntry[], marks: WeekMark[], week: string): { now: number; usual: number } {
  const real = entries.filter(e => !isDemo(e) && isIso(e.date) && receiptOf(e) && !receiptOf(e)!.refund);
  const count = (w: string) => real.filter(e => weekOf(e.date) === w).length;
  const base = [...closedSet(marks)].filter(w => w < week).sort().slice(-4);
  return { now: count(week), usual: base.length ? Math.round(base.reduce((n, w) => n + count(w), 0) / base.length) : 0 };
}

// ── месяц и год ──
export type PeriodStats = {
  receipts: number;
  total: number;
  food: number;
  junk: number;
  flagged: number;
  cubes: number;
  /** сэкономлено подтверждёнными заменами */
  saved: number;
  stores: { name: string; total: number; n: number }[];
};

/** Итог за произвольный период (включительно). Показатели — по дате покупки, без растягивания запасов. */
export function periodStats(entries: HistoryEntry[], from: string, to: string): PeriodStats {
  const out: PeriodStats = { receipts: 0, total: 0, food: 0, junk: 0, flagged: 0, cubes: 0, saved: 0, stores: [] };
  const stores = new Map<string, { total: number; n: number }>();
  let sugar = 0;
  for (const e of entries) {
    if (e.date < from || e.date > to) continue;
    const r = receiptOf(e);
    if (!r) continue;
    const a = factOf(e, r), sign = r.refund ? -1 : 1;
    if (!r.refund) out.receipts++;
    out.total += sign * a.total; out.food += sign * a.food; out.junk += sign * a.junk; out.flagged += sign * a.flagged.sum;
    if (e.tag !== 'guests') sugar += sign * a.sugar;
    const s = stores.get(r.store) ?? { total: 0, n: 0 };
    stores.set(r.store, { total: s.total + sign * a.total, n: s.n + (r.refund ? 0 : 1) });
  }
  out.cubes = Math.max(0, cubesOfValue(sugar, 'sugar'));
  out.total = Math.round(out.total); out.food = Math.round(out.food); out.junk = Math.max(0, Math.round(out.junk)); out.flagged = Math.max(0, Math.round(out.flagged));
  out.saved = Math.round(confirmedSwaps(entries.filter(e => !isDemo(e)), receiptOf).filter(c => c.date >= from && c.date <= to).reduce((n, c) => n + c.money, 0));
  out.stores = [...stores].map(([name, v]) => ({ name, ...v, total: Math.round(v.total) })).sort((a, b) => b.total - a.total).slice(0, 5);
  return out;
}
export const monthStats = (entries: HistoryEntry[], ym: string): PeriodStats => periodStats(entries, `${ym}-01`, `${ym}-31`);

/** Журнал по дням для календаря месяца. */
export function monthDays(entries: HistoryEntry[], ym: string): Map<string, { n: number; cubes: number }> {
  const out = new Map<string, { n: number; cubes: number }>();
  for (const e of entries) {
    if (monthOf(e.date) !== ym) continue;
    const r = receiptOf(e);
    if (!r || r.refund) continue;
    const d = out.get(e.date) ?? { n: 0, cubes: 0 };
    out.set(e.date, { n: d.n + 1, cubes: d.cubes + factOf(e, r).cubes });
  }
  return out;
}

// ── достижения ──
export type Badge = {
  id: string;
  title: string;
  desc: string;
  done: boolean;
  /** прогресс для накопительных: [сейчас, цель] */
  progress?: [number, number];
  icon: 'receipt' | 'stack' | 'swap' | 'leaf' | 'coin' | 'minus' | 'shield' | 'crown' | 'flame';
};

/** Достижения только за подтверждённое: не за нажатия и не за демо-чеки. */
export function badges(entries: HistoryEntry[], p: Norm, marks: WeekMark[], bestStreak: number): Badge[] {
  const real = entries.filter(e => !isDemo(e) && receiptOf(e));
  const done = confirmedSwaps(real, receiptOf);
  const saved = done.reduce((n, c) => n + c.money, 0);
  const cubes = cubesOfValue(done.reduce((n, c) => n + c.saved.sugar, 0), 'sugar');
  const clean = real.some(e => { const a = factOf(e, receiptOf(e)!); return a.food > 0 && a.score >= 80; });
  const facts = weekFacts(real, p);
  const inNorm = marks.some(m => m.state !== 'open' && (facts.get(m.week)?.receipts ?? 0) >= 2 && facts.get(m.week)!.ratio <= 1);
  const n = real.length;
  const cap = (v: number, goal: number): [number, number] => [Math.max(0, Math.min(goal, Math.round(v))), goal];
  return [
    { id: 'first', icon: 'receipt', title: 'Первый чек', desc: 'Внеси первый настоящий чек', done: n >= 1 },
    { id: 'swap', icon: 'swap', title: 'Замена сработала', desc: 'Следующий чек подтвердил замену', done: done.length >= 1 },
    { id: 'clean', icon: 'leaf', title: 'Чистая корзина', desc: 'Чек с оценкой 80 и выше', done: clean },
    { id: 'norm', icon: 'shield', title: 'Неделя в норме', desc: 'Закрытая неделя с двумя чеками и сахаром не выше нормы семьи', done: inNorm },
    { id: 'minus50', icon: 'minus', title: 'Минус 50 кубиков', desc: 'Подтверждённые замены убрали 50 кубиков сахара', done: cubes >= 50, progress: cap(cubes, 50) },
    { id: 'saver', icon: 'coin', title: 'Экономист', desc: 'Подтверждённые замены сэкономили 1 000 ₸', done: saved >= 1000, progress: cap(saved, 1000) },
    { id: 'streak4', icon: 'flame', title: 'Месяц учёта', desc: 'Четыре недели подряд', done: bestStreak >= 4, progress: cap(bestStreak, 4) },
    { id: 'streak12', icon: 'crown', title: 'Три месяца учёта', desc: 'Двенадцать недель подряд', done: bestStreak >= 12, progress: cap(bestStreak, 12) },
    { id: 'ten', icon: 'stack', title: 'Десять чеков', desc: 'Десять настоящих чеков в журнале', done: n >= 10, progress: cap(n, 10) },
  ];
}

/** Неделя назад от даты — для подписи «на прошлой неделе». */
export const weeksAgo = (week: string, now?: number): number => Math.round(daysBetween(week, weekOf(todayIso(now))) / 7);
export const shiftWeek = (week: string, n: number): string => addDays(week, n * 7);

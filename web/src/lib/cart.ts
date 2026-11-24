// Корзина до кассы: что убрать и что заменить, пока не купил; потом сверка с чеком.
// Чистые расчёты; хранилище — cartStore.ts. Зеркало на Dart — mobile/lib/core/cart.dart.
import { daysBetween } from './calendar';
import { analyze, cubesOfValue, METRIC_IDS, valueOf, weeksOf } from './engine';
import { words } from './plan';
import { findReference } from './scan/reference';
import type { Analysis, Cart, CartFact, MetricId, Receipt, ReceiptItem, SwapItem } from './types';

const round1 = (v: number) => Math.round(v * 10) / 10;
const zero = (): Record<MetricId, number> => ({ sugar: 0, salt: 0, fat: 0, kcal: 0, carbs: 0, protein: 0 });

/** Корзина в виде чека — для общих расчётов и правки. */
export const cartReceipt = (c: Pick<Cart, 'id' | 'store' | 'date' | 'items'>): Receipt =>
  ({ id: c.id, title: 'Корзина', store: c.store || 'Корзина', date: c.date, items: c.items, approx: true, via: 'photo' });

/** Все ли цены известны: на фото корзины их обычно нет. */
export const priced = (items: readonly ReceiptItem[]): boolean => items.length > 0 && items.every(it => it.p > 0);

/** Расчёт корзины с решениями. Без цен доля вредного считается по числу позиций. */
export function cartAnalysis(c: Cart, out: readonly number[] = c.out, swaps: readonly number[] = c.swaps): Analysis {
  const r = cartReceipt(c);
  const a = analyze(r, swaps, out);
  if (priced(c.items)) return a;
  const one = <T extends SwapItem>(it: T): T => ({ ...it, p: 1 });
  const flat = analyze({ ...r, items: r.items.map(it => ({ ...one(it), ...(it.swap ? { swap: one(it.swap) } : {}) })) }, swaps, out);
  return { ...a, score: flat.score, why: flat.why, share: flat.share };
}

/** Вред позиции в «кубиках» по сахару, соли и жирам; запас растянут на недели. */
const harmOf = (it: SwapItem, weeks = 1): number => (it.s / 5 + (it.t ?? 0) / 0.5 + (it.f ?? 0) / 2) / weeks;
/** Алкоголь и энергетики почти не дают сахара, но советовать их убрать надо. */
const FLAG_HARM = 8;
/** Меньше этого совет не стоит внимания. */
const MIN_GAIN = 2;
/** Замена годится вместо «убрать», если снимает хотя бы столько вреда. */
const SWAP_ENOUGH = 0.6;

/** Решение по позиции. */
export type Move = {
  i: number;
  kind: 'out' | 'swap';
  /** что сильнее всего уменьшится */
  metric: MetricId;
  /** на сколько, г */
  delta: number;
  /** сколько вреда уходит, «кубиков» */
  gain: number;
};

/** Советы по корзине, самые полезные сверху. Обычную еду убирать не советуем: только вредное или с готовой заменой. */
export function moves(items: readonly ReceiptItem[]): Move[] {
  const list: Move[] = [];
  items.forEach((it, i) => {
    const weeks = weeksOf(it);
    if (it.nf || weeks > 1) return; // не еду и запасы не трогаем
    const own = harmOf(it) + (it.x ? FLAG_HARM : 0);
    const left = it.swap ? harmOf(it.swap) : Infinity;
    const swapGain = own - left;
    const good = !!it.swap && swapGain >= own * SWAP_ENOUGH;
    const kind: Move['kind'] | null = good ? 'swap' : it.junk || it.x ? 'out' : it.swap && swapGain >= MIN_GAIN ? 'swap' : null;
    if (!kind) return;
    const gain = kind === 'swap' ? swapGain : own;
    if (gain < MIN_GAIN) return;
    const to: Partial<SwapItem> = kind === 'swap' ? it.swap! : {};
    const metric = (['sugar', 'salt', 'fat'] as const)
      .map(m => ({ m, d: valueOf(it, m) - valueOf(to, m), c: (valueOf(it, m) - valueOf(to, m)) / (m === 'sugar' ? 5 : m === 'salt' ? 0.5 : 2) }))
      .sort((a, b) => b.c - a.c)[0];
    list.push({ i, kind, metric: metric.m, delta: round1(metric.d), gain: Math.round(gain * 10) / 10 });
  });
  return list.sort((a, b) => b.gain - a.gain || a.i - b.i);
}

/** Сколько советов показываем сразу. */
export const TOP_MOVES = 4;
/** Оценка, при которой корзину можно не трогать. */
const GOOD_SCORE = 80;
const FINE_SCORE = 60;

export type Advice = {
  moves: Move[];
  /** первые N решений, которых хватит */
  enough: number;
  before: Analysis;
  /** если сделать первые enough */
  after: Analysis;
  tone: 'good' | 'fix';
  /** о каком показателе говорить в заголовке */
  metric: MetricId;
};

export const decide = (list: readonly Move[]): { out: number[]; swaps: number[] } => ({
  out: list.filter(m => m.kind === 'out').map(m => m.i).sort((a, b) => a - b),
  swaps: list.filter(m => m.kind === 'swap').map(m => m.i).sort((a, b) => a - b),
});

/** Самое малое число решений, после которого корзина становится нормальной (или вреда вдвое меньше). Не больше трёх. */
export function advise(c: Cart): Advice {
  const list = moves(c.items);
  const before = cartAnalysis(c, [], []);
  const total = c.items.reduce((n, it) => n + (it.nf ? 0 : harmOf(it, weeksOf(it))), 0);
  let enough = 0, gone = 0, after = before;
  while (enough < Math.min(3, list.length)) {
    if (enough > 0 && (after.score >= FINE_SCORE && gone >= total * 0.4)) break;
    gone += list[enough].gain;
    enough++;
    const d = decide(list.slice(0, enough));
    after = cartAnalysis(c, d.out, d.swaps);
  }
  const drop = (m: MetricId) => (before.totals[m] ? (before.totals[m] - after.totals[m]) / before.totals[m] : 0);
  const metric = cubesOfValue(before.totals.sugar - after.totals.sugar, 'sugar') >= 3 ? 'sugar' : (['sugar', 'salt', 'fat'] as const).reduce((x, y) => (drop(y) > drop(x) ? y : x));
  return { moves: list, enough, before, after, tone: !list.length || before.score >= GOOD_SCORE ? 'good' : 'fix', metric };
}

/** На сколько корзина стала дешевле; null — цены известны не у всех. */
export function cartMoney(c: Cart): number | null {
  const touched = [...c.out, ...c.swaps];
  if (!touched.length || touched.some(i => !c.items[i]?.p)) return null;
  return c.out.reduce((n, i) => n + c.items[i].p, 0) + c.swaps.reduce((n, i) => n + c.items[i].p - (c.items[i].swap?.p || c.items[i].p), 0);
}

/** Сколько корзина добавит к неделе: запасы входят недельной долей. */
export function weekAdd(c: Cart, out: readonly number[], swaps: readonly number[], m: MetricId): number {
  return c.items.reduce((n, it, i) => {
    if (it.nf || out.includes(i)) return n;
    const v = swaps.includes(i) && it.swap ? it.swap : it;
    return n + valueOf(v, m) / weeksOf(it);
  }, 0);
}

// ── сверка с чеком ──
/** Чек должен появиться в тот же день или на следующий. */
const MATCH_DAYS = 1;

/** Слишком широкие категории: одной категории мало, нужны общие слова (яблоки и огурцы — обе «овощи и фрукты»). */
const BROAD = new Set(['veg', 'frozen-veg', 'meat', 'fish', 'grains', 'plain-dairy', 'spices']);
/** Насколько похожи названия товаров: общие слова плюс одна категория справочника. 0 — разные. */
export function likeness(a: string, b: string, strict = true): number {
  const x = new Set(words(a)), y = new Set(words(b));
  let same = 0;
  for (const w of x) if (y.has(w)) same++;
  const union = x.size + y.size - same;
  const ka = findReference(a)?.key, kb = findReference(b)?.key;
  if (strict && ka && kb && ka !== kb) return 0; // «молоко» и «шоколад молочный» — разные вещи
  return (union ? same / union : 0) + (ka && ka === kb && !BROAD.has(ka) ? 0.4 : 0);
}
const ENOUGH_LIKE = 0.34;

/** Сверить чек с корзиной; null — это чек не про эту корзину. */
export function matchCart(c: Cart, receipt: Receipt, entryId: string, off: readonly number[] = []): CartFact | null {
  if (c.demo || c.fact || !c.doneAt || receipt.refund) return null;
  const gap = daysBetween(c.date, receipt.date);
  if (gap < 0 || gap > MATCH_DAYS) return null;

  type Want = { i: number; role: 'keep' | 'from' | 'to'; n: string };
  const wants: Want[] = c.items.flatMap((it, i): Want[] => it.nf ? []
    : c.out.includes(i) ? [{ i, role: 'from', n: it.n }]
      : c.swaps.includes(i) && it.swap ? [{ i, role: 'from', n: it.n }, { i, role: 'to', n: it.swap.n }]
        : [{ i, role: 'keep', n: it.n }]);
  const lines = receipt.items.map((it, k) => ({ it, k })).filter(l => !l.it.nf && !off.includes(l.k));
  // замену узнаём и в другой категории: вместо минералки купили сладкую воду — её сахар вычтем честно
  // каждой строке чека — самый похожий товар корзины, по одному разу
  const pairs = wants.flatMap((w, wi) => lines.map(l => ({ wi, k: l.k, s: likeness(w.n, l.it.n, w.role !== 'to') }))).filter(p => p.s >= ENOUGH_LIKE).sort((a, b) => b.s - a.s || a.wi - b.wi || a.k - b.k);
  const got = new Map<number, number>(), used = new Set<number>();
  for (const p of pairs) if (!got.has(p.wi) && !used.has(p.k)) { got.set(p.wi, p.k); used.add(p.k); }

  const keeps = wants.map((w, wi) => ({ w, wi })).filter(x => x.w.role === 'keep');
  const found = keeps.filter(x => got.has(x.wi)).length;
  const need = keeps.length ? Math.max(1, Math.ceil(keeps.length * 0.4)) : 0;
  if (found < need || (!keeps.length && !got.size)) return null;

  const saved = zero();
  let money = 0, kept = 0;
  const slipped: string[] = [];
  const at = (i: number, role: Want['role']) => got.get(wants.findIndex(w => w.i === i && w.role === role));
  for (const i of [...c.out, ...c.swaps].sort((a, b) => a - b)) {
    const it = c.items[i];
    if (!it || it.nf) continue;
    if (at(i, 'from') !== undefined) { slipped.push(it.n); continue; }
    kept++;
    const k = at(i, 'to'), instead = k === undefined ? null : receipt.items[k];
    for (const m of METRIC_IDS) saved[m] += valueOf(it, m) - (instead ? valueOf(instead, m) : 0);
    if (it.p) money += it.p - (instead?.p ?? 0);
  }
  for (const m of METRIC_IDS) saved[m] = round1(saved[m]);
  return { entryId, planned: kept + slipped.length, kept, saved, money: Math.round(money), slipped };
}

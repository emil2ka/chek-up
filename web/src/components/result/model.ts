// Расчёты экрана результата: чистые функции без DOM.
// Все списки считаются для выбранного показателя: сахар, соль, жиры, калории, углеводы или белки.
import {
  analyze, amountTxt, cubesOfValue, hasMetricData, isCubeMetric, metricTxt, money, pl, valueOf, verdict, weeksOf,
  CUBE_G, CUBES, DAYS, METRICS, METRIC_IDS, type Forms,
} from '@/lib/engine';
import { t } from '@/lib/i18n';
import type { Analysis, MetricId, Receipt, Tone } from '@/lib/types';

export const POINTS: Forms = ['балл', 'балла', 'баллов'];
const JUNK: Forms = ['вредный товар', 'вредных товара', 'вредных товаров'];

export const cubesTxt = (n: number) => `${n} ${pl(n, CUBES)}`;
const signed = (n: number, f: (n: number) => string) => (n > 0 ? '−' : n < 0 ? '+' : '') + f(Math.abs(n));

export type SwapRow = { i: number; from: string; to: string; cubes: string; price: string; /** насколько меньше показателя, в его единицах */ delta: number };

/** Позиции с заменой, которые меняют выбранный показатель: сначала самые полезные. */
export function swapRows(receipt: Receipt, m: MetricId = 'sugar', off: readonly number[] = []): SwapRow[] {
  const rows: SwapRow[] = [];
  receipt.items.forEach((it, i) => {
    if (!it.swap || it.nf || off.includes(i) || !hasMetricData(it, m) || !hasMetricData(it.swap, m)) return;
    const before = valueOf(it, m), after = valueOf(it.swap, m);
    const delta = isCubeMetric(m) ? cubesOfValue(before, m) - cubesOfValue(after, m) : Math.round((before - after) * 10) / 10;
    if (!delta) return;
    rows.push({
      i, delta,
      from: nb(it.n),
      to: nb(it.swap.n),
      cubes: signed(delta, v => isCubeMetric(m) ? cubesTxt(v) : amountTxt(v, m)),
      price: receipt.masked ? '' : signed(it.p - it.swap.p, money), // «−340 ₸» или «+150 ₸»
    });
  });
  return rows.sort((a, b) => b.delta - a.delta);
}

export type SourceRow = {
  i: number;
  name: string;
  amount: string;
  cubes: string;
  /** ширина полосы, % */
  width: number;
  /** клеточек в полосе: одна клеточка — один кубик */
  cells: number;
  /** на сколько недель хватает; 1 — не запас */
  weeks: number;
  swapped: boolean;
  swapTo: string;
};

/** «Цена вреда»: сколько денег ушло на продукты с этим показателем и во сколько обошёлся кубик. */
export type HarmPrice = {
  spend: number;
  total: number;
  perUnit: number;
  top: { name: string; price: number; value: number }[];
};

export function harmPrice(a: Analysis, m: MetricId): HarmPrice {
  const rows = a.items
    .filter(it => !it.off && !it.nf)
    .map(it => ({ name: it.active.n, price: it.active.p, value: valueOf(it.active, m) }))
    .filter(row => isCubeMetric(m) ? cubesOfValue(row.value, m) > 0 : row.value > 0);
  const spend = rows.reduce((sum, row) => sum + row.price, 0);
  const total = rows.reduce((sum, row) => sum + (isCubeMetric(m) ? cubesOfValue(row.value, m) * METRICS[m].cubeG : row.value), 0);
  const units = isCubeMetric(m) ? cubesOfValue(total, m) : total;
  return { spend, total, perUnit: units ? spend / units * (m === 'kcal' ? 100 : 1) : 0, top: [...rows].sort((x, y) => y.price - x.price).slice(0, 3) };
}

/** «Торт бисквитный, 1 кг» → «Торт бисквитный» */
const shortName = (n: string) => n.replace(/,?\s+\d[\d.,]*\s*(?:кг|г|л|мл|шт|уп|пач\S*|бут\S*|бан\S*)\.?(?:\s*[x×х]\s*\d+)?\s*$/i, '').trim() || n;
/** «2 л» не разрывать переносом */
const nb = (s: string) => s.replace(/(\d) (?=\S)/g, '$1\u00A0');

/** Главная мысль о чеке — одной фразой. Считается по тому, что лежит в корзине на самом деле. */
export function conclusion(receipt: Receipt, a: Analysis, tag?: 'guests'): string {
  if (receipt.refund) return t('Это возврат: вычтем его из недели.');
  if (tag === 'guests') return t('Чек для гостей: деньги считаем, норму семьи не трогаем.');
  const food = a.items.filter(it => !it.off && !it.nf);
  if (!food.length) return t('Здесь нет еды, оценивать нечего.');
  const why = a.why[0];
  if (!why) return t('Хорошая корзина: сахара, соли и жиров немного.');
  const top = (m: MetricId) => [...food].sort((x, y) => valueOf(y, m) / weeksOf(y) - valueOf(x, m) / weeksOf(x))[0];
  switch (why.k) {
    case 'sugar': {
      const it = top('sugar'), c = cubesOfValue(it.s, 'sugar');
      if (weeksOf(it) > 1) return t('Больше всего сахара в запасе: {n}. Хватит на {w} нед., так и посчитаем.', { n: shortName(it.n), w: weeksOf(it) });
      const v = { n: shortName(it.n), c, w: pl(c, CUBES), total: a.cubes };
      if (c >= a.cubes) return t('Весь сахар из одной позиции: {n}.', v);
      return c >= a.cubes * 0.5
        ? t('Больше половины сахара даёт одна позиция: {n}, {c} из {total}.', v)
        : c >= a.cubes * 0.25
          ? t('Главный источник сахара: {n}, {c} {w} из {total}.', v)
          : t('Сахар набрался понемногу, больше всего здесь: {n}, {c} {w}.', v);
    }
    case 'fat': return t('Больше всего оценку снизили насыщенные жиры, главный источник: {n}.', { n: shortName(top('fat').n) });
    case 'salt': return t('Больше всего оценку снизила соль, главный источник: {n}.', { n: shortName(top('salt').n) });
    case 'junk': {
      const junk = food.filter(it => it.junk);
      if (receipt.masked) return t('Сладостей и снеков здесь {n}.', { n: junk.length });
      return t('{p}% денег на еду ушло на вредное, больше всего на «{n}».', { p: Math.round(a.share * 100), n: shortName([...junk].sort((x, y) => y.p - x.p)[0]?.n ?? '') });
    }
    case 'flagged': return receipt.masked ? t('Оценку снизили энергетики.') : t('Оценку снизили алкоголь и энергетики: {m}.', { m: money(a.flagged.sum) });
  }
}

export type ResultModel = {
  /** с планом замен */
  analysis: Analysis;
  /** как есть — это и есть факт */
  base: Analysis;
  swaps: number[];
  metric: MetricId;
  available: MetricId[];
  /** под это количество подбирается размер кубика */
  maxCubes: number;
  score: number;
  tone: Tone;
  verdict: string;
  pill: string;
  srLabel: string;
  summary: null | { points: string; kind: 'save' | 'extra' | 'same'; label: string; money: string };
  sources: SourceRow[];
  harm: HarmPrice;
  junk: { sum: string; share: string; tone: Tone; width: number; of: string; days: string };
  /** алкоголь и энергетики; null, если их в чеке нет */
  flagged: null | { sum: string; share: string; lines: { name: string; price: string; kind: 'alcohol' | 'energy' }[] };
  shareText: string;
};

/** Всё, что показывает экран при данном наборе замен и выбранном показателе. */
export function resultModel(receipt: Receipt, swaps: Iterable<number>, metric: MetricId = 'sugar', off: readonly number[] = [], score?: number): ResultModel {
  const on = swaps instanceof Set ? (swaps as Set<number>) : new Set(swaps);
  const base = analyze(receipt, [], off);
  const a = analyze(receipt, on, off);
  const shown = receipt.masked && score !== undefined ? score : base.score;
  const v = verdict(shown);
  const verdictLow = v.label.toLowerCase();
  const m = METRICS[metric];
  const counted = base.items.filter(it => !it.off && !it.nf);
  const available = METRIC_IDS.filter(key => !counted.length || counted.some(item => hasMetricData(item, key)));

  const save = base.total - a.total;
  const summary: ResultModel['summary'] = on.size ? {
    points: `${a.score} ${pl(a.score, POINTS)}`, // «81 балл»
    kind: save > 0 ? 'save' : save < 0 ? 'extra' : 'same',
    label: receipt.masked ? '' : save > 0 ? t('экономия') : save < 0 ? t('доплата') : t('по той же цене'),
    money: save && !receipt.masked ? money(Math.abs(save)) : '',
  } : null;

  const src = counted.filter(it => valueOf(it, metric) > 0).sort((x, y) => valueOf(y, metric) - valueOf(x, metric)).slice(0, 8);
  const maxV = src.length ? valueOf(src[0], metric) : 1;
  const sources = src.map((it): SourceRow => {
    const val = valueOf(it, metric), c = cubesOfValue(val, metric);
    return {
      i: it.i,
      name: nb(it.n),
      amount: amountTxt(val, metric),
      cubes: isCubeMetric(metric) ? (c ? cubesTxt(c) : t('меньше кубика')) : '',
      width: Math.max(4, val / maxV * 100),
      cells: isCubeMetric(metric) ? Math.max(1, c) : 1,
      weeks: weeksOf(it),
      swapped: on.has(it.i) && !!it.swap,
      swapTo: it.swap ? `${it.swap.n}: ${amountTxt(valueOf(it.swap, metric), metric)}` : '',
    };
  });

  const d = Math.round(base.totals[metric] / m.adult);
  const of = { what: t(m.of), d, w: pl(d, DAYS) };
  const junk: ResultModel['junk'] = {
    sum: money(base.junk),
    share: t('{n}% еды', { n: Math.round(base.share * 100) }),
    tone: base.share > 0.3 ? 'bad' : base.share > 0.1 ? 'mid' : 'good',
    width: base.share * 100,
    of: base.junkCount
      ? t('{n} {w} из {m} на еду', { n: base.junkCount, w: pl(base.junkCount, JUNK), m: money(base.food) })
      : t('Вредных товаров нет: все {m} на нормальную еду', { m: money(base.food) }),
    days: d >= 1
      ? t('Здесь {what} на {d} {w} для одного взрослого', of)
      : t('Здесь {what} меньше дневной нормы взрослого', of),
  };

  const flagged: ResultModel['flagged'] = base.flagged.count && !receipt.masked
    ? {
        sum: money(base.flagged.sum),
        share: t('{n}% еды', { n: Math.round(base.flagged.sum / (base.food || 1) * 100) }),
        lines: counted.filter(it => it.x).map(it => ({ name: it.n, price: money(it.p), kind: it.x! })),
      }
    : null;

  const parts = [...new Set<MetricId>(['sugar', 'salt', 'fat', metric])].filter(k => available.includes(k)).map(k => metricTxt(base.totals[k], k));
  const shareText = t('Мой чек в «Чек-ап»: {list}, оценка {n} из 100. А что в твоей корзине?', { list: parts.join(', '), n: shown });

  return {
    analysis: a,
    base,
    swaps: [...on].sort((x, y) => x - y),
    metric,
    available,
    maxCubes: Math.max(1, base.cubesBy[metric], a.cubesBy[metric]),
    score: shown,
    tone: v.tone,
    verdict: verdictLow,
    pill: t('{n} из 100 · {v}', { n: shown, v: verdictLow }),
    srLabel: t('{x}, оценка {n} из 100, {v}', { x: available.includes(metric) ? metricTxt(base.totals[metric], metric) : t('Нет данных об этом показателе'), n: shown, v: verdictLow }),
    summary,
    sources,
    harm: harmPrice(base, metric),
    junk,
    flagged,
    shareText,
  };
}

/** Сторона кубика: чтобы куча поместилась под цифрой, а маленькая куча была крупной. */
export function cubeSize(width: number, avail: number, count: number): number {
  const s = Math.sqrt(0.64 * width * Math.max(80, avail) / Math.max(1, count));
  return Math.round(Math.max(12, Math.min(s, width / 7.4, 56)) * 2) / 2;
}

export { CUBE_G };

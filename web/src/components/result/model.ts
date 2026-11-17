// Расчёты экрана результата: чистые функции без DOM (перенос prototype/src/result-model.js).
// Все списки считаются для выбранного показателя: сахар, соль, жиры или калории.
import {
  analyze, amountTxt, cubeLabel, cubesOfValue, money, pl, valueOf, verdict,
  CUBE_G, CUBES, DAILY_G, DAYS, METRICS, METRIC_IDS, type Forms,
} from '@/lib/engine';
import type { Analysis, MetricId, Receipt, Tone } from '@/lib/types';

export const POINTS: Forms = ['балл', 'балла', 'баллов'];
export const JUNK: Forms = ['вредный товар', 'вредных товара', 'вредных товаров'];
export const NOTE = `Кубик у каждого показателя свой: ${METRIC_IDS.map(cubeLabel).join(', ')}. Норма взрослого — около 10 кубиков в день по каждому (ориентир ВОЗ; сахар — до ${DAILY_G} г). Оценка примерная и не заменяет консультацию врача.`;

export const cubesTxt = (n: number) => `${n} ${pl(n, CUBES)}`;
const signed = (n: number, f: (n: number) => string) => (n > 0 ? '−' : n < 0 ? '+' : '') + f(Math.abs(n));
/** «Соли в чеке…» — родительный падеж с заглавной буквы */
const Of = (m: MetricId) => METRICS[m].of[0].toUpperCase() + METRICS[m].of.slice(1);

export type SwapRow = { i: number; from: string; to: string; cubes: string; price: string };

/** Позиции с заменой, которые меняют выбранный показатель, — неизменны для чека. */
export function swapRows(receipt: Receipt, m: MetricId = 'sugar'): SwapRow[] {
  const rows: SwapRow[] = [];
  receipt.items.forEach((it, i) => {
    if (!it.swap) return;
    const delta = cubesOfValue(valueOf(it, m), m) - cubesOfValue(valueOf(it.swap, m), m);
    if (!delta) return;
    rows.push({
      i,
      from: it.n,
      to: it.swap.n,
      cubes: signed(delta, cubesTxt), // «−21 кубик»
      price: signed(it.p - it.swap.p, money), // «−340 ₸» или «+150 ₸»
    });
  });
  return rows;
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
  off: boolean;
  swapTo: string;
};

/** «Цена вреда»: сколько денег ушло на продукты с этим показателем и во сколько обошёлся кубик. */
export type HarmPrice = {
  /** ₸ на позиции, где есть хотя бы кубик показателя */
  spend: number;
  cubes: number;
  /** ₸ за один кубик */
  perCube: number;
  /** самые дорогие покупки */
  top: { name: string; price: number; cubes: number }[];
};

export function harmPrice(a: Analysis, m: MetricId): HarmPrice {
  const rows = a.items
    .map(it => ({ name: it.active.n, price: it.active.p, cubes: cubesOfValue(valueOf(it.active, m), m) }))
    .filter(r => r.cubes >= 1);
  const spend = rows.reduce((s, r) => s + r.price, 0);
  const cubes = rows.reduce((s, r) => s + r.cubes, 0);
  return { spend, cubes, perCube: cubes ? spend / cubes : 0, top: [...rows].sort((x, y) => y.price - x.price).slice(0, 3) };
}

export type ResultModel = {
  analysis: Analysis;
  base: Analysis;
  swaps: number[];
  metric: MetricId;
  /** под это количество подбирается размер кубика */
  maxCubes: number;
  tone: Tone;
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
export function resultModel(receipt: Receipt, swaps: Iterable<number>, metric: MetricId = 'sugar'): ResultModel {
  const on = swaps instanceof Set ? (swaps as Set<number>) : new Set(swaps);
  const base = analyze(receipt, []);
  const a = analyze(receipt, on);
  const v = verdict(a.score);
  const verdictLow = v.label.toLowerCase();
  const m = METRICS[metric];

  const save = base.total - a.total;
  const summary: ResultModel['summary'] = on.size ? {
    points: `${a.score} ${pl(a.score, POINTS)}`, // «81 балл»
    kind: save > 0 ? 'save' : save < 0 ? 'extra' : 'same',
    label: save > 0 ? 'экономия' : save < 0 ? 'доплата' : 'по той же цене',
    money: save ? money(Math.abs(save)) : '',
  } : null;

  const src = receipt.items.map((it, i) => ({ it, i })).filter(({ it }) => valueOf(it, metric) > 0).sort((x, y) => valueOf(y.it, metric) - valueOf(x.it, metric)).slice(0, 8);
  const maxV = src.length ? valueOf(src[0].it, metric) : 1;
  const sources = src.map(({ it, i }): SourceRow => {
    const val = valueOf(it, metric), c = cubesOfValue(val, metric);
    return {
      i,
      name: it.n,
      amount: amountTxt(val, metric),
      cubes: c ? cubesTxt(c) : 'меньше кубика',
      width: Math.max(4, val / maxV * 100),
      cells: Math.max(1, c),
      off: a.items[i].swapped,
      swapTo: it.swap ? `${it.swap.n} — ${amountTxt(valueOf(it.swap, metric), metric)}` : '',
    };
  });

  const d = Math.round(a.totals[metric] / m.adult);
  const junk: ResultModel['junk'] = {
    sum: money(a.junk),
    share: `${Math.round(a.share * 100)}% чека`,
    tone: a.share > 0.3 ? 'bad' : a.share > 0.1 ? 'mid' : 'good',
    width: a.share * 100,
    of: a.junkCount
      ? `${a.junkCount} ${pl(a.junkCount, JUNK)} из ${money(a.total)} всего`
      : `Вредных товаров нет — весь чек ${money(a.total)} на нормальную еду`,
    days: d >= 1
      ? `${Of(metric)} в чеке — на ${d} ${pl(d, DAYS)} для одного взрослого`
      : `${Of(metric)} в чеке меньше дневной нормы взрослого`,
  };

  const flagged: ResultModel['flagged'] = a.flagged.count
    ? {
        sum: money(a.flagged.sum),
        share: `${Math.round(a.flagged.sum / (a.total || 1) * 100)}% чека`,
        lines: a.items.filter(it => it.active.x).map(it => ({ name: it.active.n, price: money(it.active.p), kind: it.active.x! })),
      }
    : null;

  const parts = (['sugar', 'salt', 'fat'] as const).map(k => `${a.cubesBy[k]} ${pl(a.cubesBy[k], CUBES)} ${METRICS[k].of}`);
  let shareText = `Мой чек в «Чек-ап»: ${parts.join(', ')}, оценка ${a.score} из 100 — ${verdictLow}.`;
  if (on.size && base.score < a.score) shareText += ` С заменами оценка ${a.score}${save > 0 ? ` и ${money(save)} экономии` : ''}.`;
  shareText += ' А что в твоей корзине?';

  return {
    analysis: a,
    base,
    swaps: [...on].sort((x, y) => x - y),
    metric,
    maxCubes: Math.max(1, base.cubesBy[metric], a.cubesBy[metric]),
    tone: v.tone,
    pill: `${a.score} из 100 · ${verdictLow}`,
    srLabel: `${a.cubesBy[metric]} ${pl(a.cubesBy[metric], CUBES)} ${m.of}, оценка ${a.score} из 100, ${verdictLow}`,
    summary,
    sources,
    harm: harmPrice(a, metric),
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

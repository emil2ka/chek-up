// Расчёты экрана результата: чистые функции без DOM (перенос prototype/src/result-model.js).
import { analyze, verdict, pl, money, CUBE_G, DAILY_G, CUBES, DAYS, type Forms } from '@/lib/engine';
import type { Analysis, Receipt, Tone } from '@/lib/types';

export const POINTS: Forms = ['балл', 'балла', 'баллов'];
export const JUNK: Forms = ['вредный товар', 'вредных товара', 'вредных товаров'];
export const NOTE = `1 кубик = ${CUBE_G} г сахара. Норма ВОЗ — до ${DAILY_G} г добавленного сахара в день. Оценка примерная и не заменяет консультацию врача.`;

export const cubesOf = (g: number) => Math.round(g / CUBE_G);
export const cubesTxt = (n: number) => `${n} ${pl(n, CUBES)}`;
/** подпись под большой цифрой: «кубика сахара» */
export const capOf = (n: number) => `${pl(n, CUBES)} сахара`;
const signed = (n: number, f: (n: number) => string) => (n > 0 ? '−' : n < 0 ? '+' : '') + f(Math.abs(n));

export type SwapRow = { i: number; from: string; to: string; cubes: string; price: string };

/** Позиции с заменой — неизменны для чека. */
export function swapRows(receipt: Receipt): SwapRow[] {
  const rows: SwapRow[] = [];
  receipt.items.forEach((it, i) => {
    if (!it.swap) return;
    rows.push({
      i,
      from: it.n,
      to: it.swap.n,
      cubes: signed(cubesOf(it.s) - cubesOf(it.swap.s), cubesTxt), // «−21 кубик»
      price: signed(it.p - it.swap.p, money),                      // «−340 ₸» или «+150 ₸»
    });
  });
  return rows;
}

export type SourceRow = {
  i: number;
  name: string;
  grams: string;
  cubes: string;
  /** ширина полосы, % */
  width: number;
  /** клеточек в полосе: одна клеточка — один кубик */
  cells: number;
  off: boolean;
  swapTo: string;
};

export type ResultModel = {
  analysis: Analysis;
  base: Analysis;
  swaps: number[];
  /** под это количество подбирается размер кубика */
  maxCubes: number;
  tone: Tone;
  pill: string;
  srLabel: string;
  summary: null | { points: string; kind: 'save' | 'extra' | 'same'; label: string; money: string };
  sources: SourceRow[];
  junk: { sum: string; share: string; tone: Tone; width: number; of: string; days: string };
  shareText: string;
};

/** Всё, что показывает экран при данном наборе замен. */
export function resultModel(receipt: Receipt, swaps: Iterable<number>): ResultModel {
  const on = swaps instanceof Set ? (swaps as Set<number>) : new Set(swaps);
  const base = analyze(receipt, []);
  const a = analyze(receipt, on);
  const v = verdict(a.score);
  const verdictLow = v.label.toLowerCase();

  const save = base.total - a.total;
  const summary: ResultModel['summary'] = on.size ? {
    points: `${a.score} ${pl(a.score, POINTS)}`, // «81 балл»
    kind: save > 0 ? 'save' : save < 0 ? 'extra' : 'same',
    label: save > 0 ? 'экономия' : save < 0 ? 'доплата' : 'по той же цене',
    money: save ? money(Math.abs(save)) : '',
  } : null;

  const srcItems = receipt.items.map((it, i) => ({ it, i })).filter(({ it }) => it.s > 0).sort((x, y) => y.it.s - x.it.s);
  const maxS = srcItems.length ? srcItems[0].it.s : 1;
  const sources = srcItems.map(({ it, i }): SourceRow => {
    const c = cubesOf(it.s);
    return {
      i,
      name: it.n,
      grams: `${it.s} г`,
      cubes: c ? cubesTxt(c) : 'меньше кубика',
      width: Math.max(4, it.s / maxS * 100),
      cells: Math.max(1, c),
      off: a.items[i].swapped,
      swapTo: it.swap ? `${it.swap.n} — ${it.swap.s} г` : '',
    };
  });

  const d = Math.round(a.days);
  const junk: ResultModel['junk'] = {
    sum: money(a.junk),
    share: `${Math.round(a.share * 100)}% чека`,
    tone: a.share > 0.3 ? 'bad' : a.share > 0.1 ? 'mid' : 'good',
    width: a.share * 100,
    of: a.junkCount
      ? `${a.junkCount} ${pl(a.junkCount, JUNK)} из ${money(a.total)} всего`
      : `Вредных товаров нет — весь чек ${money(a.total)} на нормальную еду`,
    days: d >= 1
      ? `Сахара в чеке — на ${d} ${pl(d, DAYS)} для одного взрослого`
      : 'Сахара в чеке меньше дневной нормы взрослого',
  };

  let shareText = `Мой чек в «Чек-ап»: ${a.cubes} ${pl(a.cubes, CUBES)} сахара, оценка ${a.score} из 100 — ${verdictLow}.`;
  if (on.size && base.cubes > a.cubes) shareText += ` С заменами минус ${cubesTxt(base.cubes - a.cubes)}${save > 0 ? ` и ${money(save)} экономии` : ''}.`;
  shareText += ' А сколько сахара в твоей корзине?';

  return {
    analysis: a,
    base,
    swaps: [...on].sort((x, y) => x - y),
    maxCubes: Math.max(1, base.cubes, a.cubes),
    tone: v.tone,
    pill: `${a.score} из 100 · ${verdictLow}`,
    srLabel: `${a.cubes} ${pl(a.cubes, CUBES)} сахара, оценка ${a.score} из 100, ${verdictLow}`,
    summary,
    sources,
    junk,
    shareText,
  };
}

/** Сторона кубика: чтобы куча поместилась под цифрой, а маленькая куча была крупной. */
export function cubeSize(width: number, avail: number, count: number): number {
  const s = Math.sqrt(0.64 * width * Math.max(80, avail) / Math.max(1, count));
  return Math.round(Math.max(12, Math.min(s, width / 7.4, 56)) * 2) / 2;
}

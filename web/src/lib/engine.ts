// Общий расчёт для всех экранов. Этот файл — контракт между частями приложения.
// Зеркало на Dart — mobile/lib/core/engine.dart: формулы и числа должны совпадать (это проверяют тесты).
import { t } from './i18n';
import type { Analysis, AnalyzedItem, MetricId, Receipt, ReceiptItem, SwapItem, Verdict, Why } from './types';

export const METRIC_IDS: readonly MetricId[] = ['sugar', 'salt', 'fat', 'kcal', 'carbs', 'protein'];

/** Сцена для каждого показателя. */
export type Viz = 'cubes' | 'crystals' | 'drops' | 'flames' | 'grains' | 'eggs';

export type MetricDef = {
  id: MetricId;
  /** «Сахар» */
  label: string;
  /** короткая подпись для вкладок */
  short: string;
  /** родительный падеж для подписей: «кубика сахара» */
  of: string;
  unit: 'г' | 'ккал';
  /** масштаб для фигурок и внутренних расчётов */
  cubeG: number;
  viz: Viz;
  /** суточная норма взрослого и ребёнка (ориентир ВОЗ), в тех же единицах */
  adult: number;
  kid: number;
  /** поле позиции чека */
  field: 's' | 't' | 'f' | 'k' | 'c' | 'b';
  /** цвет акцента в интерфейсе (полосы) */
  color: string;
  /** откуда норма */
  norm: string;
  /** вредное ли в избытке: от этого зависит «цена вреда» (у белков, углеводов и калорий — «сколько это стоит») */
  harmful: boolean;
};

export const METRICS: Record<MetricId, MetricDef> = {
  sugar: { id: 'sugar', label: 'Сахар', short: 'Сахар', of: 'сахара', unit: 'г', cubeG: 5, viz: 'cubes', adult: 50, kid: 30, field: 's', color: '#4F73FF', norm: 'ВОЗ: до 50 г добавленного сахара в день', harmful: true },
  salt: { id: 'salt', label: 'Соль', short: 'Соль', of: 'соли', unit: 'г', cubeG: 0.5, viz: 'crystals', adult: 5, kid: 3, field: 't', color: '#E8587F', norm: 'ВОЗ: до 5 г соли в день', harmful: true },
  fat: { id: 'fat', label: 'Жиры', short: 'Жиры', of: 'жиров', unit: 'г', cubeG: 2, viz: 'drops', adult: 20, kid: 16, field: 'f', color: '#F3B21B', norm: 'ВОЗ: насыщенных жиров меньше 10% калорий, около 20 г в день', harmful: true },
  kcal: { id: 'kcal', label: 'Калории', short: 'Ккал', of: 'калорий', unit: 'ккал', cubeG: 200, viz: 'flames', adult: 2000, kid: 1500, field: 'k', color: '#EE5A32', norm: 'ориентир: 2000 ккал в день взрослому, 1500 ребёнку', harmful: false },
  carbs: { id: 'carbs', label: 'Углеводы', short: 'Углев.', of: 'углеводов', unit: 'г', cubeG: 10, viz: 'grains', adult: 250, kid: 190, field: 'c', color: '#C9812F', norm: 'ориентир: около 250 г углеводов в день взрослому (половина калорий), 190 г ребёнку', harmful: false },
  protein: { id: 'protein', label: 'Белки', short: 'Белки', of: 'белков', unit: 'г', cubeG: 6, viz: 'eggs', adult: 60, kid: 40, field: 'b', color: '#F0A21E', norm: 'ориентир: около 60 г белка в день взрослому, 40 г ребёнку', harmful: false },
};

// Сахар — исторически главный показатель, его константы используют многие экраны.
export const CUBE_G = METRICS.sugar.cubeG;   // один кубик сахара ≈ 5 г
export const DAILY_G = METRICS.sugar.adult;  // норма ВОЗ: до 50 г добавленного сахара в день для взрослого

/** Только сахар измеряется кубиками в интерфейсе. */
export const isCubeMetric = (m: MetricId): boolean => m === 'sugar';

export const PILE_HINTS: Record<MetricId, string> = {
  sugar: 'Тапни, чтобы подбросить кубики',
  salt: 'Тапни, чтобы рассыпать крупинки',
  fat: 'Тапни, чтобы подбросить капли',
  kcal: 'Тапни, чтобы разлетелись огоньки',
  carbs: 'Тапни, чтобы подбросить зёрна',
  protein: 'Тапни, чтобы яйца покатились',
};

/** Значение показателя у позиции (нет данных — 0). */
export const hasMetricData = (item: SwapItem, m: MetricId): boolean => m === 'carbs' ? item.c != null : m === 'protein' ? item.b != null : true;

export const valueOf = (it: Partial<Pick<SwapItem, 's' | 't' | 'f' | 'k' | 'c' | 'b'>>, m: MetricId): number => it[METRICS[m].field] ?? 0;
export const cubesOfValue = (v: number, m: MetricId): number => Math.round(v / METRICS[m].cubeG);

const emptyTotals = (): Record<MetricId, number> => ({ sugar: 0, salt: 0, fat: 0, kcal: 0, carbs: 0, protein: 0 });

/** На сколько недель хватает позиции: 1 — съедят на этой неделе. */
export const MAX_WEEKS = 26;
export const weeksOf = (it: Pick<ReceiptItem, 'w'>): number => Math.max(1, Math.min(MAX_WEEKS, Math.round(it.w ?? 1)));

/** Линейный штраф: до `from` — 0, от `to` — max. */
const ramp = (v: number, from: number, to: number, max: number): number => max * Math.max(0, Math.min(1, (v - from) / (to - from)));

/** Ниже этого числа калорий плотность считать нельзя: одна бутылка воды дала бы бесконечность. */
const KCAL_FLOOR = 400;

/**
 * Оценка корзины 0..100. Сахар, соль и жиры берём относительно калорий, а вредное — относительно суммы,
 * поэтому закупка на большую семью и мелкая покупка той же еды получают одинаковый балл.
 * Запасы (сахар, масло) входят недельной долей. Калории сами по себе оценку не снижают.
 */
function scoreOf(dense: Record<MetricId, number>, share: number, flagShare: number): { score: number; why: Why[] } {
  const kcal = Math.max(KCAL_FLOOR, dense.kcal);
  const sugar = dense.sugar * 4 / kcal;      // доля калорий из добавленного сахара; ВОЗ: меньше 10%, лучше 5%
  const fat = dense.fat * 9 / kcal;          // доля калорий из насыщенных жиров; ВОЗ: меньше 10%
  const salt = dense.salt / kcal * 1000;     // граммов соли на 1000 ккал; ВОЗ: 5 г на 2000 ккал
  const raw: Why[] = [
    { k: 'sugar', pts: ramp(sugar, 0.05, 0.2, 35), value: sugar },
    { k: 'fat', pts: ramp(fat, 0.08, 0.2, 18), value: fat },
    { k: 'salt', pts: ramp(salt, 2, 6, 15), value: salt },
    { k: 'junk', pts: ramp(share, 0, 0.5, 25), value: share },
    { k: 'flagged', pts: ramp(flagShare, 0, 0.3, 10), value: flagShare },
  ];
  const lost = raw.reduce((n, w) => n + w.pts, 0);
  const why = raw.map(w => ({ ...w, pts: Math.round(w.pts) })).filter(w => w.pts > 0).sort((x, y) => y.pts - x.pts);
  return { score: Math.max(0, Math.min(100, Math.round(100 - lost))), why };
}

/**
 * @param receipt  чек
 * @param swaps    индексы позиций, для которых включена замена (план)
 * @param off      индексы позиций «не для нас»
 *   items[i] = исходная позиция + { i, swapped, off, active } — active это то, что лежало бы в корзине с заменой
 */
export function analyze(receipt: Receipt, swaps: Iterable<number> = [], off: Iterable<number> = []): Analysis {
  const on = swaps instanceof Set ? swaps as Set<number> : new Set(swaps);
  const skip = off instanceof Set ? off as Set<number> : new Set(off);
  let total = 0, food = 0, junk = 0, junkCount = 0, offCount = 0;
  const totals = emptyTotals(), dense = emptyTotals();
  const flagged = { count: 0, sum: 0, alcohol: 0, energy: 0 };
  const items: AnalyzedItem[] = receipt.items.map((it, i) => {
    const swapped = on.has(i) && !!it.swap;
    const active = swapped && it.swap ? { ...it.swap, junk: 0 as const } : it;
    const isOff = skip.has(i);
    const row: AnalyzedItem = { ...it, i, swapped, off: isOff, active };
    if (isOff) { offCount++; return row; }
    total += active.p;
    if (it.nf) return row;
    food += active.p;
    const weeks = weeksOf(it);
    for (const m of METRIC_IDS) { const v = valueOf(active, m); totals[m] += v; dense[m] += v / weeks; }
    if (active.junk) { junk += active.p; junkCount++; }
    if (active.x) { flagged.count++; flagged.sum += active.p; flagged[active.x] += active.p; }
    return row;
  });
  for (const m of METRIC_IDS) totals[m] = Math.round(totals[m] * 10) / 10;
  const share = food ? junk / food : 0;
  const { score, why } = scoreOf(dense, share, food ? flagged.sum / food : 0);
  const cubesBy = Object.fromEntries(METRIC_IDS.map(m => [m, cubesOfValue(totals[m], m)])) as Record<MetricId, number>;
  return {
    items, total, food, offCount, sugar: totals.sugar, cubes: cubesBy.sugar, totals, cubesBy, flagged,
    junk, junkCount, share, score, why, days: totals.sugar / DAILY_G,
  };
}

/** Словесная оценка: tone — 'good' | 'mid' | 'bad' (цвета --good / --mid / --bad) */
export function verdict(score: number): Verdict {
  if (score >= 80) return { label: t('Отлично'), tone: 'good' };
  if (score >= 60) return { label: t('Неплохо'), tone: 'good' };
  if (score >= 40) return { label: t('Так себе'), tone: 'mid' };
  return { label: t('Корзина-бомба'), tone: 'bad' };
}

export type Forms = readonly [string, string, string];

/** pl(21, ['кубик','кубика','кубиков']) → 'кубик' */
export function pl(n: number, forms: Forms): string {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return t(forms[2]);
  if (b === 1) return t(forms[0]);
  if (b >= 2 && b <= 4) return t(forms[1]);
  return t(forms[2]);
}
export const CUBES: Forms = ['кубик', 'кубика', 'кубиков'];
export const SUGAR_CUBES: Forms = ['кубик сахара', 'кубика сахара', 'кубиков сахара'];
export const DAYS: Forms = ['день', 'дня', 'дней'];

/** Подпись под большой цифрой, когда число — штучки в куче («кубика сахара», «зёрен углеводов»). */
export const capOf = (n: number, m: MetricId): string => {
  if (isCubeMetric(m)) return pl(n, SUGAR_CUBES);
  return t(GRAM_CAP[m] ?? METRICS[m].unit);
};
/** Подпись под числом в граммах или ккал: «г соли», «ккал», «г углеводов», «г белка». */
const GRAM_CAP: Partial<Record<MetricId, string>> = { salt: 'г соли', fat: 'г насыщенных жиров', kcal: 'ккал', carbs: 'г углеводов', protein: 'г белка' };

/** Вес одной фигурки в куче. */
export const pieceValue = (n: number, m: MetricId): number => n * METRICS[m].cubeG;

/** Большое число на экране для значения показателя: у сахара — кубики, у остальных — граммы или ккал. */
export function bigNum(v: number, m: MetricId): string {
  if (isCubeMetric(m)) return String(cubesOfValue(v, m));
  // десятые важны у соли и небольших чисел; у сотен они только мешают
  return m !== 'kcal' && v < 100 && !Number.isInteger(v) ? num1(v) : String(Math.round(v));
}
/** Подпись под большим числом для значения: «кубика сахара», «г соли», «ккал». */
export const bigCap = (v: number, m: MetricId): string => capOf(isCubeMetric(m) ? cubesOfValue(v, m) : v, m);

/** Число с одним знаком после запятой, без лишнего «,0»: 2,3 · 4 */
export const num1 = (n: number): string => (Math.round(n * 10) / 10).toString().replace('.', ',');
/** Как мы показываем показатель и что значит одна штучка. */
export function unitNote(m: MetricId): string {
  switch (m) {
    case 'sugar': return t('1 кубик = 5 г добавленного сахара');
    case 'salt': return t('чем больше крупинок, тем больше соли');
    case 'fat': return t('1 капля = 2 г насыщенных жиров');
    case 'kcal': return t('1 огонёк = 200 ккал');
    case 'carbs': return t('1 зёрнышко = 10 г углеводов');
    case 'protein': return t('1 яйцо = 6 г белка');
  }
}
export const UNITS_NOTE = 'Кубик: 5 г сахара. Капля: 2 г насыщенных жиров. Огонёк: 200 ккал. Зёрнышко: 10 г углеводов. Яйцо: 6 г белка. Крупинки показывают, много ли соли, число рядом в граммах.';

/** Количество показателя с единицей: «106 г», «0,5 г», «460 ккал» */
export const amountTxt = (v: number, m: MetricId): string => `${m === 'kcal' ? Math.round(v) : num1(v)} ${t(METRICS[m].unit)}`;

export const metricTxt = (v: number, m: MetricId): string => `${bigNum(v, m)} ${bigCap(v, m)}`;

/** money(3490) → '3 490 ₸' */
export const money = (n: number): string => Math.round(n).toLocaleString('ru-RU').replace(/[\u00A0\u202F,]/g, '\u00A0') + '\u00A0₸';

/** dateRu('2026-11-16') → '16 ноября' */
export { dayTxt as dateRu } from './calendar';

// Общий расчёт для всех экранов. Этот файл — контракт между частями приложения.
// Зеркало на Dart — mobile/lib/core/engine.dart: формулы и числа должны совпадать (это проверяют тесты).
import type { Analysis, AnalyzedItem, MetricId, Receipt, SwapItem, Verdict } from './types';

export const METRIC_IDS: readonly MetricId[] = ['sugar', 'salt', 'fat', 'kcal'];

export type MetricDef = {
  id: MetricId;
  /** «Сахар» */
  label: string;
  /** родительный падеж для подписей: «кубика сахара» */
  of: string;
  unit: 'г' | 'ккал';
  /** сколько в одном кубике: у каждого показателя так, чтобы норма взрослого была около 10 кубиков в день */
  cubeG: number;
  /** суточная норма взрослого и ребёнка (ориентир ВОЗ), в тех же единицах */
  adult: number;
  kid: number;
  /** поле позиции чека */
  field: 's' | 't' | 'f' | 'k';
  /** цвет акцента в интерфейсе (точки, полосы) */
  color: string;
  /** откуда норма */
  norm: string;
};

export const METRICS: Record<MetricId, MetricDef> = {
  sugar: { id: 'sugar', label: 'Сахар', of: 'сахара', unit: 'г', cubeG: 5, adult: 50, kid: 30, field: 's', color: '#4F73FF', norm: 'ВОЗ: до 50 г добавленного сахара в день' },
  salt: { id: 'salt', label: 'Соль', of: 'соли', unit: 'г', cubeG: 0.5, adult: 5, kid: 3, field: 't', color: '#E8587F', norm: 'ВОЗ: до 5 г соли в день' },
  fat: { id: 'fat', label: 'Жиры', of: 'жиров', unit: 'г', cubeG: 2, adult: 20, kid: 16, field: 'f', color: '#E0A400', norm: 'ВОЗ: насыщенных жиров меньше 10% калорий, около 20 г в день' },
  kcal: { id: 'kcal', label: 'Калории', of: 'калорий', unit: 'ккал', cubeG: 200, adult: 2000, kid: 1500, field: 'k', color: '#F0792A', norm: 'ориентир: 2000 ккал в день взрослому, 1500 ребёнку' },
};

// Сахар — исторически главный показатель, его константы используют многие экраны.
export const CUBE_G = METRICS.sugar.cubeG;   // один кубик сахара ≈ 5 г
export const DAILY_G = METRICS.sugar.adult;  // норма ВОЗ: до 50 г добавленного сахара в день для взрослого

/** Значение показателя у позиции (нет данных — 0). */
export const valueOf = (it: Partial<Pick<SwapItem, 's' | 't' | 'f' | 'k'>>, m: MetricId): number => it[METRICS[m].field] ?? 0;
export const cubesOfValue = (v: number, m: MetricId): number => Math.round(v / METRICS[m].cubeG);

const emptyTotals = (): Record<MetricId, number> => ({ sugar: 0, salt: 0, fat: 0, kcal: 0 });

/**
 * @param receipt  чек из data.ts
 * @param swaps    индексы позиций, для которых применена замена (Set или массив)
 *   items[i] = исходная позиция + { i, swapped, active } — active это то, что реально лежит в корзине
 */
export function analyze(receipt: Receipt, swaps: Iterable<number> = []): Analysis {
  const on = swaps instanceof Set ? swaps : new Set(swaps);
  let total = 0, junk = 0, junkCount = 0;
  const totals = emptyTotals();
  const flagged = { count: 0, sum: 0, alcohol: 0, energy: 0 };
  const items: AnalyzedItem[] = receipt.items.map((it, i) => {
    const swapped = on.has(i) && !!it.swap;
    const active = swapped && it.swap ? { ...it.swap, junk: 0 as const } : it;
    total += active.p;
    for (const m of METRIC_IDS) totals[m] += valueOf(active, m);
    if (active.junk) { junk += active.p; junkCount++; }
    if (active.x) { flagged.count++; flagged.sum += active.p; flagged[active.x] += active.p; }
    return { ...it, i, swapped, active };
  });
  for (const m of METRIC_IDS) totals[m] = Math.round(totals[m] * 10) / 10;
  const share = total ? junk / total : 0;
  const flagShare = total ? flagged.sum / total : 0;
  // Оценка корзины 0..100. Штрафы: доля вредного в сумме чека, сахар, соль, насыщенные жиры, алкоголь и энергетики.
  // Калории в оценку не входят: еда должна быть калорийной, важно, откуда они.
  const penalty = share * 40 + Math.min(20, totals.sugar / 17.5) + Math.min(10, totals.salt / 3.5) + Math.min(10, totals.fat / 15) + Math.min(10, flagShare * 30);
  const score = Math.max(0, Math.min(100, Math.round(100 - penalty)));
  const cubesBy = Object.fromEntries(METRIC_IDS.map(m => [m, cubesOfValue(totals[m], m)])) as Record<MetricId, number>;
  return {
    items, total, sugar: totals.sugar, cubes: cubesBy.sugar, totals, cubesBy, flagged,
    junk, junkCount, share, score, days: totals.sugar / DAILY_G,
  };
}

/** Словесная оценка: tone — 'good' | 'mid' | 'bad' (цвета --good / --mid / --bad) */
export function verdict(score: number): Verdict {
  if (score >= 80) return { label: 'Отлично', tone: 'good' };
  if (score >= 60) return { label: 'Неплохо', tone: 'good' };
  if (score >= 40) return { label: 'Так себе', tone: 'mid' };
  return { label: 'Корзина-бомба', tone: 'bad' };
}

export type Forms = readonly [string, string, string];

/** pl(21, ['кубик','кубика','кубиков']) → 'кубик' */
export function pl(n: number, forms: Forms): string {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return forms[2];
  if (b === 1) return forms[0];
  if (b >= 2 && b <= 4) return forms[1];
  return forms[2];
}
export const CUBES: Forms = ['кубик', 'кубика', 'кубиков'];
export const DAYS: Forms = ['день', 'дня', 'дней'];

/** «кубика сахара», «кубиков соли»: подпись под большой цифрой */
export const capOf = (n: number, m: MetricId): string => `${pl(n, CUBES)} ${METRICS[m].of}`;

/** Число с одним знаком после запятой, без лишнего «,0»: 2,3 · 4 */
export const num1 = (n: number): string => (Math.round(n * 10) / 10).toString().replace('.', ',');
/** Что в одном кубике: «5 г сахара», «0,5 г соли», «2 г жиров», «200 ккал» */
export const cubeLabel = (m: MetricId): string => (m === 'kcal' ? `${METRICS.kcal.cubeG} ккал` : `${num1(METRICS[m].cubeG)} г ${METRICS[m].of}`);
/** Количество показателя с единицей: «106 г», «0,5 г», «460 ккал» */
export const amountTxt = (v: number, m: MetricId): string => `${m === 'kcal' ? Math.round(v) : num1(v)} ${METRICS[m].unit}`;

/** money(3490) → '3 490 ₸' */
export const money = (n: number): string => Math.round(n).toLocaleString('ru-RU').replace(/[\u00A0\u202F,]/g, '\u00A0') + '\u00A0₸';

/** dateRu('2026-11-16') → '16 ноября' */
export const dateRu = (iso: string): string => new Date(iso + 'T12:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });

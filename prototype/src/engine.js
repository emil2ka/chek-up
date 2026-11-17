// Общий расчёт для всех экранов. Этот файл — контракт между частями приложения.
export const CUBE_G = 5;   // один кубик сахара ≈ 5 г
export const DAILY_G = 50; // норма ВОЗ: до 50 г добавленного сахара в день для взрослого

/**
 * @param receipt  чек из data.js: { id, title, store, date, items:[{ n, p, s, junk?, swap? }] }
 * @param swaps    индексы позиций, для которых применена замена (Set или массив)
 * @returns { items, total, sugar, cubes, junk, junkCount, share, score, days }
 *   items[i] = исходная позиция + { i, swapped, active } — active это то, что реально лежит в корзине
 */
export function analyze(receipt, swaps = []) {
  const on = swaps instanceof Set ? swaps : new Set(swaps);
  let total = 0, sugar = 0, junk = 0, junkCount = 0;
  const items = receipt.items.map((it, i) => {
    const swapped = on.has(i) && !!it.swap;
    const active = swapped ? { ...it.swap, junk: 0 } : it;
    total += active.p; sugar += active.s;
    if (active.junk) { junk += active.p; junkCount++; }
    return { ...it, i, swapped, active };
  });
  const share = total ? junk / total : 0;
  const score = Math.max(0, Math.min(100, Math.round(100 - share * 60 - Math.min(40, sugar / 12.5))));
  return { items, total, sugar, cubes: Math.round(sugar / CUBE_G), junk, junkCount, share, score, days: sugar / DAILY_G };
}

/** Словесная оценка: tone — 'good' | 'mid' | 'bad' (цвета --good / --mid / --bad в tokens.css) */
export function verdict(score) {
  if (score >= 80) return { label: 'Отлично', tone: 'good' };
  if (score >= 60) return { label: 'Неплохо', tone: 'good' };
  if (score >= 40) return { label: 'Так себе', tone: 'mid' };
  return { label: 'Сахарная бомба', tone: 'bad' };
}

/** pl(21, ['кубик','кубика','кубиков']) → 'кубик' */
export function pl(n, forms) {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return forms[2];
  if (b === 1) return forms[0];
  if (b >= 2 && b <= 4) return forms[1];
  return forms[2];
}
export const CUBES = ['кубик', 'кубика', 'кубиков'];
export const DAYS = ['день', 'дня', 'дней'];

/** money(3490) → '3 490 ₸' */
export const money = n => Math.round(n).toLocaleString('ru-RU').replace(/ |,/g, ' ') + ' ₸';

/** dateRu('2026-11-16') → '16 ноября' */
export const dateRu = iso => new Date(iso + 'T12:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });

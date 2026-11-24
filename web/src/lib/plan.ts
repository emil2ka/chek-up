// План и факт. Замена, включённая на чеке, — это намерение: купленное уже куплено.
// Сработавшей она считается, только когда более поздний чек это подтвердил. Здесь же — поиск дублей чеков.
// Зеркало на Dart — mobile/lib/core/plan.dart.
import { daysBetween } from './calendar';
import { analyze, METRIC_IDS, valueOf } from './engine';
import type { HistoryEntry, MetricId, Receipt, ReceiptItem } from './types';

// ── «это один и тот же продукт?» ──
const STOP = new Set(['без', 'для', 'или', 'шт', 'упак', 'пак', 'кг', 'мл', 'свежий', 'свежая', 'свежие', 'целые', 'сезонные', 'замороженные', 'цельнозерновые', 'натуральный', 'питьевой', 'питьевая', 'сахара', 'напиток', 'вода']);
const STEM = 5;

/** Смысловые слова названия, обрезанные до основы: «Минералка с лимоном, 1 л» → ['минер', 'лимон']. */
export function words(name: string): string[] {
  return name.toLowerCase().replace(/ё/g, 'е').replace(/[\d.,%×]+\s*(?:кг|г|гр|л|мл|шт|%)?(?![\p{L}])/gu, ' ')
    .split(/[^\p{L}]+/u)
    .filter(w => w.length >= 3 && !STOP.has(w))
    .map(w => w.slice(0, STEM));
}

/** Главное слово названия — первое смысловое («Кефир 1%, 900 мл» → «кефир»). */
export const keyWord = (name: string): string => words(name)[0] ?? '';

/** Похоже, что `bought` — это продукт `wanted`: главное слово искомого есть в названии купленного. */
export function sameFood(wanted: string, bought: string): boolean {
  const k = keyWord(wanted);
  return !!k && words(bought).includes(k);
}

// ── подтверждение замен ──
/** Сколько дней после плана ждём подтверждения. */
export const CONFIRM_DAYS = 45;

export type ConfirmedSwap = {
  /** чек с планом и позиция в нём */
  planId: string; i: number;
  /** чек, который подтвердил */
  factId: string; date: string;
  from: string; to: string;
  /** фактическая разница: цена (может быть отрицательной) и показатели */
  money: number;
  saved: Record<MetricId, number>;
};

type Full = { entry: HistoryEntry; receipt: Receipt };
export type ReceiptOf = (e: HistoryEntry) => Receipt | null;

const countable = (f: Full) => !f.receipt.refund;
const bought = (f: Full): { it: ReceiptItem; i: number }[] =>
  f.receipt.items.map((it, i) => ({ it, i })).filter(({ i, it }) => !it.nf && !(f.entry.off ?? []).includes(i));

/**
 * Какие замены подтверждены следующими чеками. Правила:
 *  - чек с подтверждением позже плана и не дальше CONFIRM_DAYS;
 *  - в нём есть продукт замены и нет исходного продукта;
 *  - купленная позиция подтверждает только один план, план подтверждается один раз.
 */
export function confirmedSwaps(entries: HistoryEntry[], receiptOf: ReceiptOf): ConfirmedSwap[] {
  const all: Full[] = entries.flatMap(entry => { const receipt = receiptOf(entry); return receipt ? [{ entry, receipt }] : []; })
    .filter(countable)
    .sort((a, b) => a.entry.date.localeCompare(b.entry.date) || a.entry.id.localeCompare(b.entry.id));
  const used = new Set<string>();
  const out: ConfirmedSwap[] = [];
  for (const plan of all) {
    for (const i of [...plan.entry.swaps].sort((a, b) => a - b)) {
      const from = plan.receipt.items[i], to = from?.swap;
      if (!from || !to || (plan.entry.off ?? []).includes(i)) continue;
      for (const fact of all) {
        const gap = daysBetween(plan.entry.date, fact.entry.date);
        if (gap <= 0) continue;
        if (gap > CONFIRM_DAYS) break;
        const lines = bought(fact);
        const hit = lines.find(l => sameFood(to.n, l.it.n) && !used.has(`${fact.entry.id}:${l.i}`));
        if (!hit || lines.some(l => l !== hit && sameFood(from.n, l.it.n))) continue;
        used.add(`${fact.entry.id}:${hit.i}`);
        out.push({
          planId: plan.entry.id, i, factId: fact.entry.id, date: fact.entry.date, from: from.n, to: hit.it.n,
          money: from.p - hit.it.p,
          saved: Object.fromEntries(METRIC_IDS.map(m => [m, Math.round((valueOf(from, m) - valueOf(hit.it, m)) * 10) / 10])) as Record<MetricId, number>,
        });
        break;
      }
    }
  }
  return out;
}

// ── дубли ──
const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]+/gu, '');
const totalOf = (r: Receipt) => Math.round(r.sum ?? r.items.reduce((n, it) => n + it.p, 0));

/**
 * Похожий чек в журнале. Точное совпадение — фискальный ключ из QR. Иначе: тот же день и тип операции,
 * сумма в пределах 1%, не противоречат магазин и время, и большинство цен совпадает.
 */
export function findDuplicate(receipt: Receipt, entries: HistoryEntry[], receiptOf: ReceiptOf, skipId?: string): HistoryEntry | null {
  const total = totalOf(receipt);
  const prices = receipt.items.map(it => it.p);
  for (const e of entries) {
    if (e.id === skipId) continue;
    const r = receiptOf(e);
    if (!r || !!r.refund !== !!receipt.refund) continue;
    if (r.id === receipt.id) return e;
    if (r.fiscal && receipt.fiscal) { if (r.fiscal === receipt.fiscal) return e; continue; }
    if (r.date !== receipt.date) continue;
    if (r.time && receipt.time && r.time !== receipt.time) continue;
    const a = norm(r.store), b = norm(receipt.store);
    const unknown = (s: string) => !s || s === 'магазин';
    if (!unknown(a) && !unknown(b) && !a.includes(b) && !b.includes(a)) continue;
    if (Math.abs(totalOf(r) - total) > Math.max(10, total * 0.01)) continue;
    const pool = r.items.map(it => it.p);
    let same = 0;
    for (const p of prices) { const at = pool.indexOf(p); if (at >= 0) { pool.splice(at, 1); same++; } }
    if (same >= Math.ceil(Math.max(prices.length, r.items.length) * 0.7)) return e;
  }
  return null;
}

/** Факт по чеку: что куплено на самом деле, без включённых замен. */
export const factOf = (e: HistoryEntry, receipt: Receipt) => analyze(receipt, [], e.off ?? []);

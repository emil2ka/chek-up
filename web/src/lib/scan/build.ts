// Позиции + оценки модели + справочник → Receipt (формат data.ts).
// Справочник — опора: если категория узнана и известен объём, сахар считаем по нему,
// модель только уточняет то, чего в справочнике нет.
import type { Receipt, ReceiptItem } from '../types';
import type { Estimate, Extracted, Line } from './parse';
import { amountFromName, findReference, swapName } from './reference';

const SUGAR_CAP = 2000; // г на позицию — больше не бывает даже у мешка сахара на 2 кг

const fnv = (s: string) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36);
};

/** Общая масса позиции, г/мл: из названия × количество; весовой товар — qty в кг. */
function massOf(line: Line, typical: number | null): { mass: number | null; fromName: boolean } {
  const each = amountFromName(line.name);
  if (each) return { mass: each * line.qty, fromName: true };
  if (!Number.isInteger(line.qty)) return { mass: Math.round(line.qty * 1000), fromName: true }; // 0,512 кг
  return { mass: typical ? typical * line.qty : null, fromName: false };
}

export function buildItem(line: Line, est: Estimate | undefined): ReceiptItem {
  const ref = findReference(line.name);
  const { mass, fromName } = massOf(line, ref?.typical ?? null);

  // ── сахар ──
  let s: number;
  if (ref && (fromName || !est)) {
    s = ref.per100 * (mass ?? 0) / 100;                     // справочник + известный объём — стабильно
  } else if (ref && est) {
    const max = ref.per100 * 3 * (mass ?? ref.typical) / 100; // модель, но не дальше разумного
    s = ref.per100 === 0 ? 0 : Math.min(est.sugar, max);
  } else {
    s = est ? est.sugar : 0;
  }
  s = Math.max(0, Math.min(SUGAR_CAP, Math.round(s)));

  // ── вредное ──
  const junk: 0 | 1 = (ref ? ref.junk === 1 : !!est?.junk) ? 1 : 0;

  // ── замена: только если она правда снижает сахар ──
  let swap: ReceiptItem['swap'];
  if ((junk || s >= 15) && s > 0) {
    if (est?.swap && est.swap.s < s) {
      swap = { n: est.swap.n, p: est.swap.p, s: Math.max(0, Math.round(est.swap.s)) };
    } else if (ref?.swap) {
      const each = amountFromName(line.name);
      const swapS = Math.round(ref.swap.per100 * (mass ?? 0) / 100);
      if (swapS < s) swap = { n: swapName(ref.swap.n, each), p: Math.max(1, Math.round(line.price * ref.swap.priceK)), s: swapS };
    }
  }

  const name = line.qty !== 1 && Number.isInteger(line.qty) ? `${line.name}, ${line.qty} шт` : line.name;
  return { n: name, p: line.price, s, ...(junk ? { junk } : {}), ...(swap ? { swap } : {}) };
}

export function buildReceipt(x: Extracted, estimates: Map<number, Estimate>, today = new Date()): Receipt {
  const items = x.lines.map((l, i) => buildItem(l, estimates.get(i)));
  const date = x.date || today.toISOString().slice(0, 10);
  const store = x.store || 'Магазин';
  return {
    id: 'scan-' + fnv(`${store}|${date}|${x.lines.map(l => `${l.name}:${l.price}`).join('|')}`),
    title: x.store ? `Чек из ${x.store}` : 'Мой чек',
    store,
    date,
    items,
    approx: true,
  };
}

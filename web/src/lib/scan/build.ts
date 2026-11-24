// Позиции + оценки модели + справочник → Receipt (формат data.ts).
// Справочник — опора: если категория узнана и известен объём, показатели считаем по нему,
// модель только уточняет сахар и оценивает то, чего в справочнике нет.
import type { Receipt, ReceiptItem } from '../types';
import type { Estimate, Extracted, Line } from './parse';
import { amountFromName, findReference, swapName, type RefEntry } from './reference';

const SUGAR_CAP = 2000; // г на позицию — больше не бывает даже у мешка сахара на 2 кг
const CAPS = { salt: 500, fat: 2000, kcal: 20000, carbs: 5000, protein: 3000 } as const;

const fnv = (s: string) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36);
};

const round1 = (v: number) => Math.round(v * 10) / 10;
const clamp = (v: number, max: number) => Math.max(0, Math.min(max, v));

/** Общая масса позиции, г/мл: из названия × количество; весовой товар — qty в кг. */
function massOf(line: Line, typical: number | null): { mass: number | null; fromName: boolean } {
  const each = amountFromName(line.name);
  if (each) return { mass: each * line.qty, fromName: true };
  if (!Number.isInteger(line.qty)) return { mass: Math.round(line.qty * 1000), fromName: true }; // 0,512 кг
  return { mass: typical ? typical * line.qty : null, fromName: false };
}

/** Размер «вреда» в кубиках по сахару, соли и жирам — по нему решаем, лучше ли замена. */
const harm = (v: { s: number; t: number; f: number }) => v.s / 5 + v.t / 0.5 + v.f / 2;

export function buildItem(line: Line, est: Estimate | undefined): ReceiptItem {
  const ref: RefEntry | null = findReference(line.name);
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

  // ── соль, насыщенные жиры, калории: известная категория — по справочнику, иначе оценка модели ──
  const fromRef = (per100: number) => per100 * (mass ?? 0) / 100;
  const t = round1(clamp(ref ? fromRef(ref.salt100) : est?.salt ?? 0, CAPS.salt));
  const f = round1(clamp(ref ? fromRef(ref.fat100) : est?.fat ?? 0, CAPS.fat));
  const k = Math.round(clamp(ref ? fromRef(ref.kcal100) : est?.kcal ?? 0, CAPS.kcal));
  // углеводы включают сахар: не меньше его
  const c = Math.round(Math.max(s, clamp(ref ? fromRef(ref.carbs100) : est?.carbs ?? 0, CAPS.carbs)));
  const b = Math.round(clamp(ref ? fromRef(ref.protein100) : est?.protein ?? 0, CAPS.protein));

  // ── алкоголь и энергетики ──
  const x = ref?.flag ?? est?.flag ?? undefined;

  // ── вредное ──
  const junk: 0 | 1 = x || (ref ? ref.junk === 1 : !!est?.junk) ? 1 : 0;

  // ── замена: только если она правда снижает вред (сахар, соль, жиры вместе) ──
  let swap: ReceiptItem['swap'];
  const own = { s, t, f };
  if ((junk || s >= 15 || t >= 2 || f >= 15) && harm(own) > 0) {
    const e = est?.swap;
    if (e && harm({ s: e.s, t: e.t, f: e.f }) < harm(own)) {
      swap = { n: e.n, p: e.p, s: Math.max(0, Math.round(e.s)), t: round1(e.t), f: round1(e.f), k: Math.round(e.k), c: Math.round(Math.max(e.s, e.c)), b: Math.round(e.b) };
    } else if (ref?.swap) {
      const each = amountFromName(line.name);
      const rs = ref.swap;
      const cand = { s: Math.round(rs.per100 * (mass ?? 0) / 100), t: round1(fromRef(rs.salt100)), f: round1(fromRef(rs.fat100)) };
      if (harm(cand) < harm(own)) {
        swap = { n: swapName(rs.n, each), p: Math.max(1, Math.round(line.price * rs.priceK)), ...cand, k: Math.round(fromRef(rs.kcal100)), c: Math.round(Math.max(cand.s, fromRef(rs.carbs100))), b: Math.round(fromRef(rs.protein100)) };
      }
    }
  }

  const name = line.qty !== 1 && Number.isInteger(line.qty) ? `${line.name}, ${line.qty} шт` : line.name;
  return { n: name, p: line.price, s, t, f, k, c, b, ...(junk ? { junk } : {}), ...(x ? { x } : {}), ...(swap ? { swap } : {}) };
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


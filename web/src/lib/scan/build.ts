// Позиции + оценки модели + справочник → Receipt (формат data.ts).
// Справочник — опора: если категория узнана и известен объём, показатели считаем по нему,
// модель только уточняет сахар и оценивает то, чего в справочнике нет.
// Чистый код: на клиенте им же пересчитывается строка, когда человек исправил название.
import { todayIso } from '../calendar';
import type { Receipt, ReceiptItem } from '../types';
import type { Estimate, Extracted, Line } from './parse';
import { amountFromName, findReference, isNonFood, pantryWeeks, swapName, type RefEntry } from './reference';

const SUGAR_CAP = 2000; // г на позицию; мешок сахара больше 2 кг считаем отдельно (см. ниже)
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
  if (!Number.isInteger(line.qty)) return { mass: Math.round(line.qty * 1000), fromName: true }; // 0,512 кг — вес важнее названия
  const each = amountFromName(line.name);
  if (each) return { mass: each * line.qty, fromName: true };
  return { mass: typical ? typical * line.qty : null, fromName: false };
}

/** Размер «вреда» в кубиках по сахару, соли и жирам — по нему решаем, лучше ли замена. */
const harm = (v: { s: number; t: number; f: number }) => v.s / 5 + v.t / 0.5 + v.f / 2;

const kgTxt = (qty: number) => `${String(Math.round(qty * 1000) / 1000).replace('.', ',')} кг`;
/** Название с количеством: «Сырок, 2 шт», «Бананы, 1,24 кг». */
function fullName(line: Line): string {
  if (line.qty === 1) return line.name;
  if (Number.isInteger(line.qty)) return /,\s*\d+\s*шт$/.test(line.name) ? line.name : `${line.name}, ${line.qty} шт`;
  return amountFromName(line.name) === Math.round(line.qty * 1000) ? line.name : `${line.name}, ${kgTxt(line.qty)}`;
}
/** Обратно: позиция чека → строка для пересчёта. */
export function lineOf(it: Pick<ReceiptItem, 'n' | 'p'>): Line {
  const pcs = /,\s*(\d{1,3})\s*шт$/.exec(it.n);
  if (pcs) return { name: it.n.slice(0, pcs.index), qty: +pcs[1], price: it.p };
  return { name: it.n, qty: 1, price: it.p };
}

/** Изменили цену позиции — цена замены меняется вместе с ней (у введённой без цены её ещё не было). */
export function reprice(it: ReceiptItem, p: number): ReceiptItem {
  if (!it.swap) return { ...it, p };
  const ref = buildItem(lineOf({ n: it.n, p })).swap;
  const price = ref?.n === it.swap.n ? ref.p : it.p ? Math.max(1, Math.round(it.swap.p * p / it.p)) : it.swap.p;
  return { ...it, p, swap: { ...it.swap, p: price } };
}

/** Нужна ли модель: категория неизвестна и это не бытовая химия. */
export const needsModel = (it: Pick<ReceiptItem, 'n' | 'src' | 'nf'>): boolean => !it.nf && it.src === undefined;

export function buildItem(line: Line, est?: Estimate): ReceiptItem {
  const name = fullName(est?.name && !findReference(line.name) ? { ...line, name: est.name } : line);
  const doubt = line.unsure ? { q: 1 as const } : {};
  // соль для посудомойки не еда, а «салфетки» узнаются раньше, чем «сыр»
  if (isNonFood(line.name) || (est && !est.food && !findReference(line.name))) return { n: name, p: line.price, s: 0, nf: 1, ...doubt };

  const ref: RefEntry | null = findReference(line.name);
  if (!ref && !est) return { n: name, p: line.price, s: 0, ...doubt }; // показатели ещё не известны
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
  s = Math.round(clamp(s, ref?.key === 'sugar' ? 50_000 : SUGAR_CAP));

  // ── соль, насыщенные жиры, калории: известная категория — по справочнику, иначе оценка модели ──
  const fromRef = (per100: number) => per100 * (mass ?? 0) / 100;
  const t = round1(clamp(ref ? fromRef(ref.salt100) : est?.salt ?? 0, ref?.key === 'salt' ? 5000 : CAPS.salt));
  const f = round1(clamp(ref ? fromRef(ref.fat100) : est?.fat ?? 0, CAPS.fat));
  const k = Math.round(clamp(ref ? fromRef(ref.kcal100) : est?.kcal ?? 0, ref?.key === 'sugar' ? 200_000 : CAPS.kcal));
  // углеводы включают сахар: не меньше его
  const c = Math.round(Math.max(s, clamp(ref ? fromRef(ref.carbs100) : est?.carbs ?? 0, CAPS.carbs)));
  const b = Math.round(clamp(ref ? fromRef(ref.protein100) : est?.protein ?? 0, CAPS.protein));

  const x = ref?.flag ?? (ref ? undefined : est?.flag ?? undefined);
  const junk: 0 | 1 = x || (ref ? ref.junk === 1 : !!est?.junk) ? 1 : 0;
  const w = pantryWeeks(ref, mass);

  // ── замена: только если она правда снижает вред (сахар, соль, жиры вместе); запасы не заменяем ──
  let swap: ReceiptItem['swap'];
  const own = { s, t, f };
  if (!w && (junk || s >= 15 || t >= 2 || f >= 15) && harm(own) > 0) {
    const e = est?.swap;
    if (e && harm({ s: e.s, t: e.t, f: e.f }) < harm(own)) {
      swap = { n: e.n, p: e.p, s: Math.max(0, Math.round(e.s)), t: round1(e.t), f: round1(e.f), k: Math.round(e.k), c: Math.round(Math.max(e.s, e.c)), b: Math.round(e.b) };
    } else if (ref?.swap) {
      const rs = ref.swap;
      const cand = { s: Math.round(rs.per100 * (mass ?? 0) / 100), t: round1(fromRef(rs.salt100)), f: round1(fromRef(rs.fat100)) };
      if (harm(cand) < harm(own)) {
        swap = { n: swapName(rs.n, amountFromName(line.name)), p: line.price ? Math.max(1, Math.round(line.price * rs.priceK)) : 0, ...cand, k: Math.round(fromRef(rs.kcal100)), c: Math.round(Math.max(cand.s, fromRef(rs.carbs100))), b: Math.round(fromRef(rs.protein100)) };
      }
    }
  }
  return { n: name, p: line.price, s, t, f, k, c, b, src: ref ? 'ref' : 'ai', ...(junk ? { junk } : {}), ...(x ? { x } : {}), ...(w ? { w } : {}), ...(swap ? { swap } : {}), ...doubt };
}

export function buildReceipt(x: Extracted, estimates: Map<number, Estimate> = new Map(), o: { via?: Receipt['via']; fiscal?: string; today?: string } = {}): Receipt {
  const items = x.lines.map((l, i) => buildItem(l, estimates.get(i)));
  const date = x.date || (o.today ?? todayIso());
  const store = x.store || 'Магазин';
  return {
    id: 'scan-' + fnv(o.fiscal ?? `${store}|${date}|${x.time}|${x.lines.map(l => `${l.name}:${l.price}`).join('|')}`),
    title: x.refund ? 'Возврат' : x.store ? `Чек из ${x.store}` : 'Мой чек',
    store, date, items, approx: true, via: o.via ?? 'photo',
    ...(x.refund ? { refund: true } : {}),
    ...(o.fiscal ? { fiscal: o.fiscal } : {}),
    ...(x.time ? { time: x.time } : {}),
    ...(x.total ? { sum: x.total } : {}),
  };
}

/** Исправления семьи: «в этом магазине так печатают этот товар». */
export type Correction = Pick<ReceiptItem, 'n'> & Partial<Pick<ReceiptItem, 's' | 't' | 'f' | 'k' | 'c' | 'b' | 'w' | 'nf' | 'junk'>>;
export const rawKey = (name: string): string => name.toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().slice(0, 120);
export const storeKey = (store: string): string => rawKey(store).replace(/(^|\s)(тоо|ип|ао|llp|магазин|супермаркет)(\s|$)/g, ' ').trim().slice(0, 60);

/** Применить исправление к строке: название и введённые человеком показатели важнее справочника и модели. */
export function applyCorrection(it: ReceiptItem, fix: Correction): ReceiptItem {
  const { n, ...own } = fix;
  const base: ReceiptItem = n === it.n ? it : buildItem(lineOf({ n, p: it.p }));
  const next: ReceiptItem = { ...base, p: it.p, raw: it.raw ?? it.n, src: 'user' };
  for (const key of ['s', 't', 'f', 'k', 'c', 'b', 'w', 'junk'] as const) {
    const v = own[key];
    if (v !== undefined) (next as Record<string, unknown>)[key] = v;
  }
  if (own.nf) return { n, p: it.p, s: 0, nf: 1, raw: it.raw ?? it.n, src: 'user' };
  if (own.nf === undefined && fix.s !== undefined) delete next.nf;
  delete next.q;
  return next;
}

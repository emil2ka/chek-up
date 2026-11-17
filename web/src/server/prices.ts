// Сравнение цен между магазинами по чекам пользователей «Чек-апа». Данные только настоящие: цены берутся
// из отсканированных чеков (демо-чеки не учитываются). Для сравнения чек превращается в «категория + цена за кг/л».
import { and, eq, gte, inArray } from 'drizzle-orm';
import { amountFromName, findReference, unitKind } from '@/lib/scan/reference';
import type { HistorySync } from '@/lib/syncSchema';
import type { Db } from './db';
import { pricePoints } from './db/schema';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/** Сколько дней цены считаются актуальными. */
export const FRESH_DAYS = 90;
/** Насколько дешевле должна быть цена в другом магазине, чтобы о ней стоило говорить. */
const MIN_GAIN = 0.08;
/** И сколько тенге экономии на этой покупке минимум. */
const MIN_SAVING = 30;

const CHAINS: [RegExp, string][] = [
  [/magnum|магнум/i, 'Magnum'],
  [/small|смолл/i, 'Small'],
  [/arbuz|арбуз/i, 'Arbuz'],
  [/galmart|галмарт/i, 'Galmart'],
  [/anvar|анвар/i, 'Anvar'],
  [/ramstore|рамстор/i, 'Ramstore'],
  [/metro|метро/i, 'Metro'],
  [/korzinka|корзинка/i, 'Korzinka'],
  [/европа|europe/i, 'Europe'],
  [/dinara|динара/i, 'Dinara'],
  [/фуд\s*мастер|foodmaster/i, 'Foodmaster'],
];

/** «ТОО "MAGNUM CASH&CARRY"» → «Magnum»; неизвестную сеть оставляем как есть, без кавычек и форм собственности. */
export function normalizeStore(raw: string): string {
  for (const [re, name] of CHAINS) if (re.test(raw)) return name;
  const t = raw.replace(/["«»'`]/g, '').replace(/(?<![\p{L}\p{N}])(?:тоо|ип|ао|ооо|llp|супермаркет|гипермаркет|магазин)(?![\p{L}\p{N}])/giu, '').replace(/\s+/g, ' ').trim();
  return (t || 'Магазин').slice(0, 30);
}

export type PricePoint = { category: string; unitPrice: number; unit: 'л' | 'кг'; mass: number; name: string; price: number };

/** Масса позиции в г/мл: из названия × количество («, 2 шт» дописывает распознавание). Нет объёма в названии — позицию не учитываем. */
function massOfItem(name: string): number | null {
  const each = amountFromName(name);
  if (!each) return null;
  const qty = Number(/,\s*(\d{1,3})\s*шт$/.exec(name)?.[1] ?? 1);
  return each * qty;
}

/** Цены за кг/л по позициям чека; в одной категории — медиана позиций. */
export function pricePointsOf(items: { n: string; p: number }[]): PricePoint[] {
  const out: PricePoint[] = [];
  for (const it of items) {
    const ref = findReference(it.n);
    const mass = massOfItem(it.n);
    const unit = unitKind(it.n);
    if (!ref || !mass || !unit || it.p <= 0) continue;
    const unitPrice = Math.round(it.p / mass * 1000);
    if (unitPrice < 50 || unitPrice > 200_000) continue; // нереальные значения: ошибка распознавания
    out.push({ category: ref.key, unitPrice, unit, mass, name: it.n, price: it.p });
  }
  return out;
}

const median = (v: number[]) => {
  const s = [...v].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};

/** Одна строка на категорию и чек: медиана цен позиций этой категории. */
function perCategory(points: PricePoint[]) {
  const by = new Map<string, PricePoint[]>();
  for (const p of points) by.set(p.category, [...(by.get(p.category) ?? []), p]);
  return [...by].map(([category, list]) => ({ category, unitPrice: median(list.map(p => p.unitPrice)), unit: list[0].unit }));
}

const daysAgo = (n: number, now = new Date()) => new Date(now.getTime() - n * 86_400_000).toISOString().slice(0, 10);

/** Записать цены чека (старые цены этого чека заменяются) или удалить их, если чек удалён. */
export async function recordPrices(tx: Db | Tx, userId: string, h: HistorySync): Promise<void> {
  await tx.delete(pricePoints).where(and(eq(pricePoints.userId, userId), eq(pricePoints.entryId, h.id)));
  const r = h.receipt;
  // только отсканированные чеки (approx): цены демо-чеков выдуманы, их в сравнение не берём
  if (h.deleted || !r || !r.approx) return;
  const store = normalizeStore(r.store);
  const rows = perCategory(pricePointsOf(r.items)).map(p => ({ userId, entryId: h.id, category: p.category, store, unitPrice: p.unitPrice, unit: p.unit, seenOn: r.date }));
  if (rows.length) await tx.insert(pricePoints).values(rows).onConflictDoNothing();
}

export type Offer = {
  /** позиция из твоего чека */
  name: string;
  category: string;
  unit: 'л' | 'кг';
  /** твоя цена за кг/л */
  yourPrice: number;
  /** где дешевле и сколько там стоит кг/л (медиана по чекам) */
  store: string;
  bestPrice: number;
  /** по скольким чекам собрана цена */
  n: number;
  /** сколько тенге сэкономил бы на этой покупке */
  saving: number;
};

export type CompareResult = {
  offers: Offer[];
  total: number;
  /** сколько позиций чека удалось сравнить хотя бы с одним другим магазином */
  compared: number;
};

/** Где позиции этого чека дешевле: медианные цены других магазинов за последние 90 дней. */
export async function compareReceipt(db: Db, receipt: { store: string; items: { n: string; p: number }[] }, now = new Date()): Promise<CompareResult> {
  const mine = normalizeStore(receipt.store);
  const points = pricePointsOf(receipt.items);
  const cats = [...new Set(points.map(p => p.category))];
  if (!cats.length) return { offers: [], total: 0, compared: 0 };

  const rows = await db.select({ category: pricePoints.category, store: pricePoints.store, unitPrice: pricePoints.unitPrice })
    .from(pricePoints)
    .where(and(inArray(pricePoints.category, cats), gte(pricePoints.seenOn, daysAgo(FRESH_DAYS, now))))
    .limit(20_000);

  const byCat = new Map<string, Map<string, number[]>>();
  for (const r of rows) {
    if (r.store.toLowerCase() === mine.toLowerCase()) continue;
    const stores = byCat.get(r.category) ?? new Map<string, number[]>();
    stores.set(r.store, [...(stores.get(r.store) ?? []), r.unitPrice]);
    byCat.set(r.category, stores);
  }

  const offers: Offer[] = [];
  let compared = 0;
  for (const p of points) {
    const stores = byCat.get(p.category);
    if (!stores?.size) continue;
    compared++;
    const best = [...stores].map(([store, v]) => ({ store, price: median(v), n: v.length })).sort((a, b) => a.price - b.price)[0];
    const saving = Math.round((p.unitPrice - best.price) * p.mass / 1000);
    if (best.price <= p.unitPrice * (1 - MIN_GAIN) && saving >= MIN_SAVING) {
      offers.push({ name: p.name, category: p.category, unit: p.unit, yourPrice: p.unitPrice, store: best.store, bestPrice: best.price, n: best.n, saving });
    }
  }
  offers.sort((a, b) => b.saving - a.saving);
  const top = offers.slice(0, 6);
  return { offers: top, total: top.reduce((s, o) => s + o.saving, 0), compared };
}

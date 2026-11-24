// Разбор и проверка ответов модели. Модели иногда присылают JSON в ```-блоке, строками вместо чисел,
// служебные строки чека и отрицательные суммы — всё это чистим здесь, а не в провайдерах.
import { ScanError } from './errors';
import { CartSchema, EnrichmentSchema, ExtractionSchema } from './model';

export type Line = { name: string; qty: number; price: number; unsure?: boolean };
export type Extracted = { store: string; date: string; time: string; total: number; refund: boolean; lines: Line[] };
export type EstimateSwap = { n: string; p: number; s: number; t: number; f: number; k: number; c: number; b: number };
/** Оценка модели по позиции: сахар, соль, насыщенные жиры (г), калории (ккал) и замена. */
export type Estimate = { name: string; food: boolean; sugar: number; salt: number; fat: number; kcal: number; carbs: number; protein: number; flag: 'alcohol' | 'energy' | null; junk: boolean; swap: EstimateSwap | null };

const nonNeg = (v: number) => (Number.isFinite(v) && v > 0 ? v : 0);

const MAX_LINES = 80;
const MAX_PRICE = 10_000_000; // ₸ за строку — больше на кассе не бывает

/** Служебные строки, которые модель иногда принимает за товар. */
const SERVICE = /^(итог|итого|всего|сумма|ндс|ққс|сдача|наличные|наличными|оплата|оплачено|карта|картой|безналичн\p{L}*|скидка|скидки|бонус\p{L}*|округление|к оплате|получено|фискальн\p{L}*|кассир|смена|рнм|знм|бин|инн)(?![\p{L}\p{N}])/iu;

/** Строки заказа, которые не товар. */
const DELIVERY = /^(доставка|сборка|сервисный сбор|упаковка заказа|промокод|чаевые|минимальн\p{L}* заказ)(?![\p{L}\p{N}])/iu;

/** Достать JSON из ответа: объект, строка с JSON или JSON внутри ```json … ```. */
export function extractJson(raw: unknown): unknown {
  if (raw && typeof raw === 'object') return raw;
  if (typeof raw !== 'string') throw new ScanError('unreadable', 'ответ модели не строка и не объект');
  let t = raw.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a < 0 || b <= a) throw new ScanError('unreadable', 'в ответе модели нет JSON');
  try {
    return JSON.parse(t.slice(a, b + 1));
  } catch {
    throw new ScanError('unreadable', 'ответ модели — битый JSON');
  }
}

const cleanName = (s: string) => s.replace(/\s+/g, ' ').trim().slice(0, 120);

/** Шаг 1: ответ модели → позиции. Бросает ScanError: not_receipt, empty, unreadable. */
export function parseExtraction(raw: unknown): Extracted {
  const parsed = ExtractionSchema.safeParse(extractJson(raw));
  if (!parsed.success) throw new ScanError('unreadable', 'ответ модели не по схеме');
  const x = parsed.data;
  if (!x.is_receipt) throw new ScanError('not_receipt');

  const lines: Line[] = [];
  for (const it of x.items) {
    const name = cleanName(it.name);
    const price = Math.abs(Math.round(it.price)) * (x.is_refund || it.price > 0 ? 1 : -1); // у возврата суммы бывают с минусом
    if (!name || SERVICE.test(name)) continue;
    if (!Number.isFinite(price) || price <= 0 || price > MAX_PRICE) continue; // скидки, возвраты, мусор
    const qty = Number.isFinite(it.qty) && it.qty > 0 && it.qty < 1000 ? it.qty : 1;
    lines.push({ name, qty, price, ...(it.sure ? {} : { unsure: true }) });
    if (lines.length >= MAX_LINES) break;
  }
  if (!lines.length) throw new ScanError('empty');

  const total = Math.abs(Math.round(x.total));
  return { store: cleanName(x.store).slice(0, 60), date: normalizeDate(x.date), time: normalizeTime(x.time), total: total <= MAX_PRICE ? total : 0, refund: x.is_refund, lines };
}

export type ExtractedCart = { kind: 'basket' | 'order'; store: string; hidden: boolean; lines: Line[] };

/** Корзина: ответ модели → товары. Цены может не быть (0). Бросает ScanError: not_cart, is_receipt, cart_empty, unreadable. */
export function parseCart(raw: unknown): ExtractedCart {
  const parsed = CartSchema.safeParse(extractJson(raw));
  if (!parsed.success) throw new ScanError('unreadable', 'ответ модели не по схеме');
  const x = parsed.data;
  if (x.kind === 'receipt') throw new ScanError('is_receipt');
  if (x.kind === 'other') throw new ScanError('not_cart');
  const by = new Map<string, Line>();
  for (const it of x.items) {
    const name = cleanName(it.name);
    if (!name || SERVICE.test(name) || DELIVERY.test(name)) continue;
    const price = Number.isFinite(it.price) && it.price > 0 && it.price <= MAX_PRICE ? Math.round(it.price) : 0;
    const qty = Number.isFinite(it.qty) && it.qty > 0 && it.qty < 100 ? it.qty : 1;
    // один товар с нескольких кадров — одна строка: берём большее количество, а не сумму
    const key = name.toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    const prev = by.get(key);
    by.set(key, prev && (x.kind === 'basket' || prev.price === price)
      ? { ...prev, qty: Math.max(prev.qty, qty), price: Math.max(prev.price, price) }
      // в заказе название напечатано: сомневаться можно только на фото
      : { name, qty, price, ...(it.sure || x.kind === 'order' ? {} : { unsure: true }) });
    if (by.size >= MAX_LINES) break;
  }
  if (!by.size) throw new ScanError('cart_empty');
  // у одних магазинов в строке цена за штуку, у других — за всё: сверяем с суммой заказа
  const lines = [...by.values()], each = lines.map(l => (Number.isInteger(l.qty) ? l.price * l.qty : l.price));
  const sum = (list: number[]) => list.reduce((n, v) => n + v, 0);
  if (x.total > 0 && Math.abs(sum(each) - x.total) < Math.abs(sum(lines.map(l => l.price)) - x.total)) lines.forEach((l, i) => { l.price = each[i]; });
  return { kind: x.kind, store: /^(unknown|none|null|неизвестн\p{L}*|не видно|нет)$/iu.test(x.store.trim()) ? '' : cleanName(x.store).slice(0, 60), hidden: x.hidden, lines };
}

/** Шаг 2: ответ модели → оценки по номерам позиций. Мусор не валит чек — вернётся пустая карта. */
export function parseEnrichment(raw: unknown, count: number): Map<number, Estimate> {
  const out = new Map<number, Estimate>();
  let data: unknown;
  try { data = extractJson(raw); } catch { return out; }
  const parsed = EnrichmentSchema.safeParse(data);
  if (!parsed.success) return out;
  for (const it of parsed.data.items) {
    if (it.i < 0 || it.i >= count || out.has(it.i)) continue;
    if (!Number.isFinite(it.sugar_g) || it.sugar_g < 0) continue;
    const swapName = cleanName(it.swap_name);
    const swapOk = swapName && Number.isFinite(it.swap_price) && it.swap_price > 0 && Number.isFinite(it.swap_sugar_g) && it.swap_sugar_g >= 0;
    out.set(it.i, {
      name: cleanName(it.name),
      food: it.food,
      sugar: it.sugar_g,
      salt: nonNeg(it.salt_g),
      fat: nonNeg(it.sat_fat_g),
      kcal: nonNeg(it.kcal),
      carbs: nonNeg(it.carbs_g),
      protein: nonNeg(it.protein_g),
      flag: it.flag === 'alcohol' || it.flag === 'energy' ? it.flag : null,
      junk: it.junk,
      swap: swapOk ? { n: swapName, p: Math.round(it.swap_price), s: it.swap_sugar_g, t: nonNeg(it.swap_salt_g), f: nonNeg(it.swap_sat_fat_g), k: nonNeg(it.swap_kcal), c: nonNeg(it.swap_carbs_g), b: nonNeg(it.swap_protein_g) } : null,
    });
  }
  return out;
}

/** «18:42», «18:42:07» → «18:42»; иначе пустая строка. */
export function normalizeTime(s: string): string {
  const r = s.trim().match(/^(\d{1,2}):(\d{2})/);
  return r && +r[1] < 24 && +r[2] < 60 ? `${r[1].padStart(2, '0')}:${r[2]}` : '';
}

/** «2026-11-16», «16.11.2026», «16.11.26» → YYYY-MM-DD; неизвестную или будущую дату — пустая строка. */
export function normalizeDate(s: string, now = new Date()): string {
  const t = s.trim();
  let y: number, m: number, d: number;
  let r = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (r) { y = +r[1]; m = +r[2]; d = +r[3]; }
  else if ((r = t.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/))) {
    d = +r[1]; m = +r[2]; y = +r[3]; if (y < 100) y += 2000;
  } else return '';
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  if (dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d || y < 2015) return '';
  if (dt.getTime() > now.getTime() + 36e5 * 36) return '';
  return dt.toISOString().slice(0, 10);
}

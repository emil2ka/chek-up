// POST /api/cart — корзина ДО оплаты: фото корзины или скриншот заказа (поле формы `photo`, до трёх кадров). Нужен токен устройства.
// В журнал ничего не пишем: это ещё не покупка. Фото обрабатывается в памяти и нигде не сохраняется.
import { CartResponseSchema } from '@/lib/schema';
import { DEMO_CART } from '@/lib/data';
import { buildCartItem, needsModel } from '@/lib/scan/build';
import { scanConfig } from '@/lib/scan/config';
import { SCAN_ERRORS, ScanError, type ScanErrorCode } from '@/lib/scan/errors';
import { extractCart } from '@/lib/scan/pipeline';
import type { ImageInput } from '@/lib/scan/providers/types';
import { clientIp, ok, rateLimiter, withAuth } from '@/server/http';
import { consume } from '@/server/usage';

const MAX_BYTES = 8 * 1024 * 1024;
const MAX_PHOTOS = 3;
const MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
const DEMO_NOTICE = 'Демо-режим: распознавание ещё не подключено, показываю пример корзины';

const limited = rateLimiter(8, 60_000);
const limitedIp = rateLimiter(30, 60_000);
const cap = (name: string, def: number) => { const v = Number(process.env[name]); return Number.isFinite(v) && v > 0 ? v : def; };

const fail = (code: ScanErrorCode) =>
  Response.json({ error: { code, message: SCAN_ERRORS[code].message } }, { status: SCAN_ERRORS[code].status, headers: { 'cache-control': 'no-store' } });

export const POST = (request: Request) => withAuth(request, 'cart', async ({ db, me }) => {
  if (Number(request.headers.get('content-length') ?? 0) > MAX_BYTES * MAX_PHOTOS) return fail('too_large');
  let form: FormData;
  try { form = await request.formData(); } catch { return fail('bad_request'); }
  const photos = form.getAll('photo').filter((p): p is File => p instanceof File);
  if (!photos.length || photos.length > MAX_PHOTOS || photos.some(p => !MIMES.includes(p.type))) return fail('bad_request');
  if (photos.some(p => p.size > MAX_BYTES)) return fail('too_large');
  if (limited(me.userId) || limitedIp(clientIp(request))) return fail('rate_limit');

  const cfg = scanConfig();
  if (!cfg) return ok(CartResponseSchema.parse({ cart: DEMO_CART, notice: DEMO_NOTICE }));
  // общий суточный потолок с чеками: модель одна и платим за неё одинаково
  if (!(await consume(db, 'scan:all', cap('SCAN_DAILY_CAP', 500)))) return fail('daily_limit');
  if (!(await consume(db, `scan:${me.userId}`, cap('SCAN_USER_CAP', 40)))) return fail('daily_limit');
  try {
    const images: ImageInput[] = await Promise.all(photos.map(async p => ({ base64: Buffer.from(await p.arrayBuffer()).toString('base64'), mime: p.type })));
    const x = await extractCart(images, cfg);
    const items = x.lines.map(buildCartItem);
    return ok(CartResponseSchema.parse({ cart: { kind: x.kind, store: x.store, hidden: x.hidden, items }, notice: null, pending: items.flatMap((it, i) => (needsModel(it) ? [i] : [])) }));
  } catch (err) {
    if (err instanceof ScanError) {
      console.warn(`[cart] ${err.code}`, err.cause ?? '');
      return fail(err.code === 'unreadable' ? 'cart_empty' : err.code);
    }
    throw err;
  }
});

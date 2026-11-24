// POST /api/scan — чек по фото (поле формы `photo`, до трёх кадров) и/или по QR (поле `qr`). Нужен токен устройства.
// QR Казахтелекома отдаёт позиции без ИИ; иначе читаем фото моделью. Ключа нет → честный демо-режим.
// Отвечаем сразу, как прочитали позиции: показатели — по справочнику, чего в нём нет — в списке pending (POST /api/scan/enrich).
// Фото обрабатывается в памяти и нигде не сохраняется.
import { RECEIPTS } from '@/lib/data';
import { ScanResponseSchema } from '@/lib/schema';
import { buildReceipt, needsModel } from '@/lib/scan/build';
import { scanConfig } from '@/lib/scan/config';
import { SCAN_ERRORS, ScanError, type ScanErrorCode } from '@/lib/scan/errors';
import { parseFiscalQr } from '@/lib/scan/fiscal';
import { extractPhotos } from '@/lib/scan/pipeline';
import type { ImageInput } from '@/lib/scan/providers/types';
import { applyCorrections } from '@/server/corrections';
import { membershipOf } from '@/server/family';
import { clientIp, ok, rateLimiter, withAuth } from '@/server/http';
import { fetchOofd } from '@/server/ofd';
import { consume } from '@/server/usage';

const MAX_BYTES = 8 * 1024 * 1024; // клиент присылает ~0,3–1 МБ; это потолок на всякий случай
const MAX_PHOTOS = 3;
const MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
const DEMO_ID = 'week';
const DEMO_NOTICE = 'Демо-режим: распознавание чеков ещё не подключено, показываю пример';

const limited = rateLimiter(8, 60_000);
const limitedIp = rateLimiter(30, 60_000);
const cap = (name: string, def: number) => { const v = Number(process.env[name]); return Number.isFinite(v) && v > 0 ? v : def; };

const fail = (code: ScanErrorCode) =>
  Response.json({ error: { code, message: SCAN_ERRORS[code].message } }, { status: SCAN_ERRORS[code].status, headers: { 'cache-control': 'no-store' } });

export const POST = (request: Request) => withAuth(request, 'scan', async ({ db, me }) => {
  if (Number(request.headers.get('content-length') ?? 0) > MAX_BYTES * MAX_PHOTOS) return fail('too_large');
  let form: FormData;
  try { form = await request.formData(); } catch { return fail('bad_request'); }
  const photos = form.getAll('photo').filter((p): p is File => p instanceof File);
  const qrText = form.get('qr');
  const qr = typeof qrText === 'string' && qrText ? parseFiscalQr(qrText) : null;
  if (photos.length > MAX_PHOTOS || photos.some(p => !MIMES.includes(p.type)) || (!photos.length && !qr)) return fail('bad_request');
  if (photos.some(p => p.size > MAX_BYTES)) return fail('too_large');
  if (limited(me.userId) || limitedIp(clientIp(request))) return fail('rate_limit');
  if (!(await consume(db, `qr:${me.userId}`, 100))) return fail('daily_limit');

  const { familyId } = await membershipOf(db, me.userId);
  try {
    let x = qr ? await fetchOofd(qr) : null;
    const via = x ? ('qr' as const) : ('photo' as const);
    if (!x) {
      if (!photos.length) return fail('qr_no_items');
      const cfg = scanConfig();
      if (!cfg) return ok(ScanResponseSchema.parse({ receipt: RECEIPTS.find(r => r.id === DEMO_ID), notice: DEMO_NOTICE }));
      if (!(await consume(db, 'scan:all', cap('SCAN_DAILY_CAP', 500)))) return fail('daily_limit');
      if (!(await consume(db, `scan:${me.userId}`, cap('SCAN_USER_CAP', 40)))) return fail('daily_limit');
      const images: ImageInput[] = await Promise.all(photos.map(async p => ({ base64: Buffer.from(await p.arrayBuffer()).toString('base64'), mime: p.type })));
      x = await extractPhotos(images, cfg);
    }
    // дата, время и сумма из QR точнее прочитанных с фото
    const exact = qr ? { ...x, date: qr.date || x.date, time: qr.time || x.time, total: qr.sum || x.total } : x;
    const receipt = await applyCorrections(db, familyId, buildReceipt(exact, undefined, { via, fiscal: qr?.key }));
    const pending = scanConfig() ? receipt.items.flatMap((it, i) => (needsModel(it) ? [i] : [])) : [];
    return ok(ScanResponseSchema.parse({ receipt, notice: null, pending }));
  } catch (err) {
    if (err instanceof ScanError) {
      console.warn(`[scan] ${err.code}`, err.cause ?? '');
      return fail(err.code);
    }
    throw err;
  }
});

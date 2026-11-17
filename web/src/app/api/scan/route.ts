// POST /api/scan — распознавание чека по фото (поле формы `photo`).
// Есть ключ в окружении → два шага через ИИ (src/lib/scan/pipeline.ts). Ключа нет → честный демо-режим.
// Фото обрабатывается в памяти и нигде не сохраняется.
import { RECEIPTS } from '@/lib/data';
import { ScanResponseSchema } from '@/lib/schema';
import { scanConfig } from '@/lib/scan/config';
import { SCAN_ERRORS, ScanError, type ScanErrorCode } from '@/lib/scan/errors';
import { scanPhoto } from '@/lib/scan/pipeline';

const MAX_BYTES = 8 * 1024 * 1024; // клиент присылает ~0,3–1 МБ; это потолок на всякий случай
const MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
const DEMO_ID = 'week';
const DEMO_NOTICE = 'Демо-режим: распознавание чеков ещё не подключено, показываю пример';

// Простой лимит на один инстанс сервера: защищает платный ключ от случайного «заспамливания».
const WINDOW_MS = 60_000;
const PER_WINDOW = 8;
const hits = new Map<string, number[]>();
function limited(ip: string): boolean {
  const now = Date.now();
  const list = (hits.get(ip) ?? []).filter(t => now - t < WINDOW_MS);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return list.length > PER_WINDOW;
}

const fail = (code: ScanErrorCode) =>
  Response.json({ error: { code, message: SCAN_ERRORS[code].message } }, { status: SCAN_ERRORS[code].status });

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail('bad_request');
  }
  const photo = form.get('photo');
  if (!(photo instanceof File) || !MIMES.includes(photo.type)) return fail('bad_request');
  if (photo.size > MAX_BYTES) return fail('too_large');

  const cfg = scanConfig();
  if (!cfg) {
    const receipt = RECEIPTS.find(r => r.id === DEMO_ID);
    return Response.json(ScanResponseSchema.parse({ receipt, notice: DEMO_NOTICE }));
  }

  const ip = (request.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'local';
  if (limited(ip)) return fail('rate_limit');

  try {
    const base64 = Buffer.from(await photo.arrayBuffer()).toString('base64');
    const receipt = await scanPhoto({ base64, mime: photo.type }, cfg);
    return Response.json(ScanResponseSchema.parse({ receipt, notice: null }));
  } catch (err) {
    if (err instanceof ScanError) {
      console.warn(`[scan] ${cfg.provider.id}: ${err.code}`, err.cause ?? '');
      return fail(err.code);
    }
    console.error('[scan] непредвиденная ошибка', err);
    return fail('unavailable');
  }
}

// Чтение чека (клиент): фото сжимаются здесь и уходят в POST /api/scan, ключей на клиенте нет.
// Сервер отвечает, как только прочитал позиции; показатели неизвестных позиций — вторым запросом (enrich).
import { z } from 'zod';
import { ReceiptItemSchema, ScanResponseSchema, type ScanResponse } from './schema';
import { ScanError, isScanErrorCode } from './scan/errors';
import { authed, postAuthed, SyncError } from './sync';
import type { Receipt, ReceiptItem } from './types';

const MAX_SIDE = 1600;          // px по длинной стороне — текст чека читается, а файл в разы легче
const MAX_UPLOAD = 7 * 1024 * 1024;

/** Уменьшить фото и перекодировать в JPEG; при ошибке отправить как есть (сервер проверит размер). */
export async function shrink(file: Blob): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    // длинный чек: держим ширину, иначе строки станут нечитаемыми
    const k = Math.min(1, Math.max(MAX_SIDE / Math.max(bmp.width, bmp.height), Math.min(1, 900 / Math.min(bmp.width, bmp.height))));
    const cv = document.createElement('canvas');
    cv.width = Math.round(bmp.width * k);
    cv.height = Math.round(bmp.height * k);
    cv.getContext('2d')?.drawImage(bmp, 0, 0, cv.width, cv.height);
    bmp.close();
    const blob = await new Promise<Blob | null>(r => cv.toBlob(r, 'image/jpeg', 0.85));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}

/** @throws ScanError с понятным текстом: не чек, не читается, лимит, сервис недоступен… */
export async function recognize(photos: Blob[], qr: string | null): Promise<ScanResponse> {
  if (photos.some(p => p.size > MAX_UPLOAD)) throw new ScanError('too_large');
  const body = new FormData();
  photos.forEach((p, i) => body.append('photo', p, p.type === 'image/jpeg' ? `receipt-${i}.jpg` : `receipt-${i}`));
  if (qr) body.append('qr', qr);
  let data: unknown;
  try {
    data = await authed('/api/scan', { method: 'POST', body });
  } catch (e) {
    if (e instanceof SyncError) throw new ScanError(isScanErrorCode(e.code) ? e.code : e.httpStatus === 429 ? 'rate_limit' : 'unavailable', e.code);
    throw e;
  }
  const parsed = ScanResponseSchema.safeParse(data);
  if (!parsed.success) throw new ScanError('unavailable', 'ответ сервера не по схеме');
  return parsed.data;
}

const EnrichSchema = z.object({ items: z.array(ReceiptItemSchema.nullable()) });

/** Показатели для позиций без справочника. Меняются только те, что человек за это время не трогал. null — уточнить не вышло. */
export async function enrich(receipt: Receipt, pending: number[]): Promise<Map<string, ReceiptItem> | null> {
  const list = pending.map(i => receipt.items[i]).filter(Boolean).slice(0, 40);
  if (!list.length) return null;
  try {
    const p = EnrichSchema.safeParse(await postAuthed('/api/scan/enrich', { items: list.map(it => ({ n: it.n, p: it.p })) }));
    if (!p.success) return null;
    return new Map(list.flatMap((it, i) => (p.data.items[i] ? [[`${it.n}|${it.p}`, p.data.items[i] as ReceiptItem] as const] : [])));
  } catch {
    return null;
  }
}
export const applyEnriched = (r: Receipt, by: Map<string, ReceiptItem>): Receipt =>
  ({ ...r, items: r.items.map(it => (it.src === undefined && !it.nf ? { ...(by.get(`${it.n}|${it.p}`) ?? it), ...(it.q ? { q: it.q } : {}) } : it)) });

// Распознавание чека по фото (клиент). Фото сжимается здесь же и уходит в POST /api/scan,
// где сервер решает: ИИ (если есть ключ) или честный демо-режим. Ключей на клиенте нет.
import { ScanResponseSchema, type ScanResponse } from './schema';
import { ScanError, isScanErrorCode } from './scan/errors';

const MAX_SIDE = 1600;          // px по длинной стороне — текст чека читается, а файл в разы легче
const MAX_UPLOAD = 7 * 1024 * 1024;

/** Уменьшить фото и перекодировать в JPEG; при ошибке отправить как есть (сервер проверит размер). */
async function shrink(file: File): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
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

/**
 * @param file фото чека с камеры
 * @returns чек (формат data.ts, проверен схемой Zod) и уведомление для пользователя или null
 * @throws ScanError с понятным текстом: не чек, не читается, лимит, сервис недоступен…
 */
export async function recognize(file: File): Promise<ScanResponse> {
  const photo = await shrink(file);
  if (photo.size > MAX_UPLOAD) throw new ScanError('too_large');

  const body = new FormData();
  body.append('photo', photo, photo.type === 'image/jpeg' ? 'receipt.jpg' : file.name || 'receipt');

  let res: Response;
  try {
    res = await fetch('/api/scan', { method: 'POST', body });
  } catch {
    throw new ScanError('unavailable', 'нет сети');
  }

  let data: unknown = null;
  try { data = await res.json(); } catch { /* разберёмся ниже */ }

  if (!res.ok) {
    const code = (data as { error?: { code?: unknown } } | null)?.error?.code;
    throw new ScanError(isScanErrorCode(code) ? code : res.status === 429 ? 'rate_limit' : 'unavailable');
  }
  const parsed = ScanResponseSchema.safeParse(data);
  if (!parsed.success) throw new ScanError('unavailable', 'ответ сервера не по схеме');
  return parsed.data;
}

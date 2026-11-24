// QR фискального чека на фото. В браузерах с BarcodeDetector — он (быстрее), иначе jsQR. Только для клиента.
import { parseFiscalQr } from './scan/fiscal';

type Detector = { detect(src: ImageBitmap): Promise<{ rawValue: string }[]> };
declare const BarcodeDetector: { new (o: { formats: string[] }): Detector } | undefined;

async function native(bmp: ImageBitmap): Promise<string[]> {
  try {
    if (typeof BarcodeDetector === 'undefined') return [];
    return (await new BarcodeDetector({ formats: ['qr_code'] }).detect(bmp)).map(r => r.rawValue);
  } catch {
    return [];
  }
}

async function viaJs(bmp: ImageBitmap): Promise<string[]> {
  const { default: jsQR } = await import('jsqr');
  // чек целиком мельчит QR, поэтому смотрим ещё нижнюю и верхнюю половины крупнее
  const parts = [[0, 0, 1, 1], [0, 0.5, 1, 0.5], [0, 0, 1, 0.5], [0, 0.65, 1, 0.35]];
  for (const [x, y, w, h] of parts) {
    const sw = bmp.width * w, sh = bmp.height * h, k = Math.min(1, 1400 / Math.max(sw, sh));
    const cv = document.createElement('canvas');
    cv.width = Math.round(sw * k); cv.height = Math.round(sh * k);
    const c = cv.getContext('2d', { willReadFrequently: true });
    if (!c) return [];
    c.drawImage(bmp, bmp.width * x, bmp.height * y, sw, sh, 0, 0, cv.width, cv.height);
    const r = jsQR(c.getImageData(0, 0, cv.width, cv.height).data, cv.width, cv.height, { inversionAttempts: 'dontInvert' });
    if (r?.data && parseFiscalQr(r.data)) return [r.data];
  }
  return [];
}

/** Ссылка из фискального QR на фото или null. Никогда не бросает: без QR чек читается по фото. */
export async function findFiscalQr(photo: Blob): Promise<string | null> {
  try {
    const bmp = await createImageBitmap(photo, { imageOrientation: 'from-image' });
    try {
      const hit = (await native(bmp)).find(v => parseFiscalQr(v)) ?? (await viaJs(bmp))[0];
      return hit ?? null;
    } finally {
      bmp.close();
    }
  } catch {
    return null;
  }
}

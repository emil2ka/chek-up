// QR фискального чека Казахстана: ссылка на портал оператора с параметрами i (фискальный признак), f (РНМ кассы), s (сумма), t (время).
// Общий файл для клиента и сервера.
import { isIso } from '../calendar';

export type Fiscal = {
  host: string;
  f: string; i: string; s: string; t: string;
  /** ключ для поиска дублей */
  key: string;
  date: string;
  time: string;
  sum: number;
};

/** null — это не QR фискального чека. */
export function parseFiscalQr(text: string): Fiscal | null {
  const raw = text.trim();
  if (raw.length > 400) return null;
  let url: URL;
  try { url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`); } catch { return null; }
  const q = (k: string) => (url.searchParams.get(k) ?? '').trim();
  const f = q('f'), i = q('i'), s = q('s').replace(',', '.'), t = q('t');
  if (!/^\d{6,20}$/.test(f) || !/^\d{4,20}$/.test(i)) return null;
  const m = /^(\d{4})(\d{2})(\d{2})T?(\d{2})?(\d{2})?/.exec(t);
  const date = m && isIso(`${m[1]}-${m[2]}-${m[3]}`) ? `${m[1]}-${m[2]}-${m[3]}` : '';
  const time = m?.[4] && m[5] && +m[4] < 24 && +m[5] < 60 ? `${m[4]}:${m[5]}` : '';
  const sum = Math.round(Number(s));
  return { host: url.hostname.toLowerCase(), f, i, s: /^\d+(\.\d+)?$/.test(s) ? s : '', t: /^[\dT]{8,17}$/.test(t) ? t : '', key: `${f}:${i}`, date, time, sum: Number.isFinite(sum) && sum > 0 ? sum : 0 };
}

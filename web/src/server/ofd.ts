// Позиции чека с портала оператора фискальных данных «Казахтелеком» (consumer.oofd.kz) по ссылке из QR.
// Сам портал открывает такой чек без капчи этим же запросом. Делаем по одному запросу на скан пользователя, ничего не обходим:
// порталы, где чек закрыт капчей, не трогаем — для них остаётся фото.
// Формат ответа — по открытой библиотеке kz-ofd-receipts (MIT, Bekarys Pernebayev): itemType 1 — товар, 5 — скидка, 3 — наценка.
import https from 'node:https';
import tls from 'node:tls';
import { z } from 'zod';
import type { Fiscal } from '@/lib/scan/fiscal';
import type { Extracted, Line } from '@/lib/scan/parse';

const num = z.coerce.number().catch(0);
const Part = z.object({ name: z.string().catch(''), sum: num, quantity: num.optional(), price: num.optional() }).loose();
const Ticket = z.object({
  orgTitle: z.string().nullish(),
  orgName: z.string().nullish(),
  ticket: z.object({
    operationType: z.union([z.string(), z.number()]).nullish(),
    totalSum: num.optional(),
    transactionDate: z.string().nullish(),
    items: z.array(z.object({ itemType: z.number().nullish(), commodity: Part.nullish(), discount: Part.nullish(), markup: Part.nullish() }).loose()).catch([]),
  }).loose(),
}).loose();

const SERVICE = /^(скидка|наценка|округление)/i;

/** Ответ портала → позиции. Скидки и наценки возвращаются в цену товара. null — позиций нет. */
export function mapOofd(json: unknown, q: Fiscal): Extracted | null {
  const p = Ticket.safeParse(json);
  if (!p.success) return null;
  const t = p.data.ticket;
  const adjust = new Map<string, number>();
  const goods: z.infer<typeof Part>[] = [];
  for (const it of t.items) {
    const type = it.itemType ?? 1;
    if (type === 1 && it.commodity) goods.push(it.commodity);
    else if (type === 5 && it.discount) adjust.set(it.discount.name, (adjust.get(it.discount.name) ?? 0) + it.discount.sum);
    else if (type === 3) { const m = it.markup ?? it.commodity; if (m) adjust.set(m.name, (adjust.get(m.name) ?? 0) - m.sum); }
  }
  const lines: Line[] = [];
  for (const c of goods) {
    const name = c.name.replace(/^\d{6,}\s*/, '').replace(/\s+/g, ' ').trim().slice(0, 120);
    const off = adjust.get(c.name) ?? 0;
    adjust.delete(c.name); // две строки с одним названием: скидку применяем один раз
    const price = Math.round(c.sum - off);
    if (!name || SERVICE.test(name) || price <= 0) continue;
    const qty = c.quantity && c.quantity > 0 && c.quantity < 1000 ? c.quantity : 1;
    lines.push({ name, qty, price });
  }
  if (!lines.length) return null;
  return {
    store: (p.data.orgTitle || p.data.orgName || '').replace(/\s+/g, ' ').trim().slice(0, 60),
    date: q.date, time: q.time, total: Math.round(t.totalSum || 0) || q.sum,
    refund: /return|refund|возврат/i.test(String(t.operationType ?? '')),
    lines: lines.slice(0, 120),
  };
}

export const ofdSupported = (q: Fiscal) => /(^|\.)oofd\.kz$/.test(q.host);

/**
 * Портал не присылает промежуточный сертификат GoGetSSL RSA DV CA (действует до 09.2028, подписан USERTrust из доверенных корней Node).
 * Добавляем его к доверенным только для этого запроса; проверка сертификата остаётся строгой.
 */
const INTERMEDIATE = `-----BEGIN CERTIFICATE-----
MIIF1zCCA7+gAwIBAgIRAJOLsI5imHtPdfmMtqUEXJYwDQYJKoZIhvcNAQEMBQAw
gYgxCzAJBgNVBAYTAlVTMRMwEQYDVQQIEwpOZXcgSmVyc2V5MRQwEgYDVQQHEwtK
ZXJzZXkgQ2l0eTEeMBwGA1UEChMVVGhlIFVTRVJUUlVTVCBOZXR3b3JrMS4wLAYD
VQQDEyVVU0VSVHJ1c3QgUlNBIENlcnRpZmljYXRpb24gQXV0aG9yaXR5MB4XDTE4
MDkwNjAwMDAwMFoXDTI4MDkwNTIzNTk1OVowTDELMAkGA1UEBhMCTFYxDTALBgNV
BAcTBFJpZ2ExETAPBgNVBAoTCEdvR2V0U1NMMRswGQYDVQQDExJHb0dldFNTTCBS
U0EgRFYgQ0EwggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEKAoIBAQCfwF4hD6E1
kLglXs1n2fH5vMQukCGyyD4LqLsc3pSzeh8we7njU4TB85BH5YXqcfwiH1Sf78aB
hk1FgXoAZ3EQrF49We8mnTtTPFRnMwEHLJRpY9I/+peKeAZNL0MJG5zM+9gmcSpI
OTI6p7MPela72g0pBQjwcExYLqFFVsnroEPTRRlmfTBTRi9r7rYcXwIct2VUCRmj
jR1GX13op370YjYwgGv/TeYqUWkNiEjWNskFDEfxSc0YfoBwwKdPNfp6t/5+RsFn
lgQKstmFLQbbENsdUEpzWEvZUpDC4qPvRrxEKcF0uLoZhEnxhskwXSTC64BNtc+l
VEk7/g/be8svAgMBAAGjggF1MIIBcTAfBgNVHSMEGDAWgBRTeb9aqitKz1SA4dib
wJ3ysgNmyzAdBgNVHQ4EFgQU+ftQxItnu2dk/oMhpqnOP1WEk5kwDgYDVR0PAQH/
BAQDAgGGMBIGA1UdEwEB/wQIMAYBAf8CAQAwHQYDVR0lBBYwFAYIKwYBBQUHAwEG
CCsGAQUFBwMCMCIGA1UdIAQbMBkwDQYLKwYBBAGyMQECAkAwCAYGZ4EMAQIBMFAG
A1UdHwRJMEcwRaBDoEGGP2h0dHA6Ly9jcmwudXNlcnRydXN0LmNvbS9VU0VSVHJ1
c3RSU0FDZXJ0aWZpY2F0aW9uQXV0aG9yaXR5LmNybDB2BggrBgEFBQcBAQRqMGgw
PwYIKwYBBQUHMAKGM2h0dHA6Ly9jcnQudXNlcnRydXN0LmNvbS9VU0VSVHJ1c3RS
U0FBZGRUcnVzdENBLmNydDAlBggrBgEFBQcwAYYZaHR0cDovL29jc3AudXNlcnRy
dXN0LmNvbTANBgkqhkiG9w0BAQwFAAOCAgEAXXRDKHiA5DOhNKsztwayc8qtlK4q
Vt2XNdlzXn4RyZIsC9+SBi0Xd4vGDhFx6XX4N/fnxlUjdzNN/BYY1gS1xK66Uy3p
rw9qI8X12J4er9lNNhrsvOcjB8CT8FyvFu94j3Bs427uxcSukhYbERBAIN7MpWKl
VWxT3q8GIqiEYVKa/tfWAvnOMDDSKgRwMUtggr/IE77hekQm20p7e1BuJODf1Q7c
FPt7T74m3chg+qu0xheLI6HsUFuOxc7R5SQlkFvaVY5tmswfWpY+rwhyJW+FWNbT
uNXkxR4v5KOQPWrY100/QN68/j17paKuSXNcsr56snuB/Dx+MACLBdsF35HxPadx
78vkfQ37WcVmKZtHrHJQ/QUyjxdG8fezMsh0f+puUln/O+NlsFtipve8qYa9h/K5
yD0oZN93ChWve78XrV4vCpjO75Nk5B8O9CWQqGTHbhkgvjyb9v/B+sYJqB22/NLl
R4RPvbmqDJGeEI+4u6NJ5YiLIVVsX+dyfFP8zUbSsj6J34RyCYKBbQ4L+r7k8Srs
LY51WUFP292wkFDPSDmV7XsUNTDOZoQcBh2Fycf7xFfxeA+6ERx2d8MpPPND7yS2
1dkf+SY5SdpSbAKtYmbqb9q8cZUDEImNWJFUVHBLDOrnYhGwJudE3OBXRTxNhMDm
IXnjEeWrFvAZQhk=
-----END CERTIFICATE-----
`;

const MAX_BODY = 500_000;

function get(path: string, timeoutMs: number): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = https.request({
      host: 'consumer.oofd.kz', path, method: 'GET', ca: [...tls.rootCertificates, INTERMEDIATE],
      headers: { accept: 'application/json', 'user-agent': 'chek-up' }, timeout: timeoutMs,
    }, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (d: string) => { body += d; if (body.length > MAX_BODY) req.destroy(new Error('слишком большой ответ')); });
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
      res.on('error', reject);
    });
    const hard = setTimeout(() => req.destroy(new Error('таймаут')), timeoutMs);
    req.on('close', () => clearTimeout(hard));
    req.on('timeout', () => req.destroy(new Error('таймаут')));
    req.on('error', reject);
    req.end();
  });
}

/** null — портал не поддержан, не ответил или чека ещё нет. Адрес фиксирован, из QR берутся только проверенные параметры. */
export async function fetchOofd(q: Fiscal, load = get): Promise<Extracted | null> {
  if (!ofdSupported(q) || !q.s || !q.t) return null;
  const query = new URLSearchParams({ i: q.i, f: q.f, s: q.s, t: q.t });
  try {
    const r = await load(`/api/consumer-proxy/api/tickets/get-by-url?${query}`, 6_000);
    return r.status === 200 ? mapOofd(JSON.parse(r.body), q) : null;
  } catch {
    return null;
  }
}

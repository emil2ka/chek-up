import { describe, expect, it, vi } from 'vitest';
import { parseFiscalQr } from '@/lib/scan/fiscal';
import { fetchOofd, mapOofd, ofdSupported } from './ofd';

const URL_OK = 'https://consumer.oofd.kz/ticket?i=123456789&f=010101012345&s=4870.00&t=20260614T195301';
const q = parseFiscalQr(URL_OK)!;
const ticket = (items: unknown[], extra: object = {}) => ({ orgTitle: 'MAGNUM', ticket: { totalSum: 4870, items, ...extra } });
const good = (name: string, sum: number, quantity = 1) => ({ itemType: 1, commodity: { name, sum, quantity, price: sum / quantity } });

describe('parseFiscalQr', () => {
  it('разбирает ссылку, в том числе без протокола', () => {
    expect(q).toMatchObject({ key: '010101012345:123456789', date: '2026-06-14', time: '19:53', sum: 4870, host: 'consumer.oofd.kz' });
    expect(parseFiscalQr('consumer.oofd.kz?i=123456789&f=010101012345&s=10,5&t=20260614T195301')).toMatchObject({ sum: 11 });
    expect(parseFiscalQr('http://ofd1.kz/t/?i=1234567&f=010101012345&s=500&t=20260614T1953')).toMatchObject({ host: 'ofd1.kz', time: '19:53' });
  });
  it('не чек — null', () => {
    for (const t of ['', 'привет', 'https://kaspi.kz/pay/123', 'https://x.kz/?i=abc&f=010101012345', 'https://x.kz/?i=123456', 'x'.repeat(500)]) expect(parseFiscalQr(t)).toBeNull();
  });
  it('битая дата не роняет', () => {
    expect(parseFiscalQr('https://consumer.oofd.kz/?i=123456789&f=010101012345&s=1&t=20269914T195301')).toMatchObject({ date: '' });
  });
});

describe('mapOofd', () => {
  it('товары, скидка и наценка складываются в цену', () => {
    const x = mapOofd(ticket([good('КОЛА 1Л', 620), good('4870211245943 СЫР', 2100, 0.3), { itemType: 5, discount: { name: 'КОЛА 1Л', sum: 120 } }, { itemType: 3, markup: { name: '4870211245943 СЫР', sum: 50 } }]), q)!;
    expect(x).toMatchObject({ store: 'MAGNUM', date: '2026-06-14', time: '19:53', total: 4870, refund: false });
    expect(x.lines).toEqual([{ name: 'КОЛА 1Л', qty: 1, price: 500 }, { name: 'СЫР', qty: 0.3, price: 2150 }]);
  });
  it('скидка не применяется дважды к одинаковым строкам, строки без цены отбрасываются', () => {
    const x = mapOofd(ticket([good('A', 100), good('A', 100), good('B', 0), { itemType: 5, discount: { name: 'A', sum: 30 } }]), q)!;
    expect(x.lines.map(l => l.price)).toEqual([70, 100]);
  });
  it('возврат, пустой и чужой ответ', () => {
    expect(mapOofd(ticket([good('A', 100)], { operationType: 'OPERATION_SELL_RETURN' }), q)!.refund).toBe(true);
    expect(mapOofd(ticket([]), q)).toBeNull();
    expect(mapOofd({ code: 'INTERNAL_ERROR' }, q)).toBeNull();
    expect(mapOofd('мусор', q)).toBeNull();
  });
});

describe('fetchOofd', () => {
  it('запрос только на портал Казахтелекома и только с проверенными параметрами', async () => {
    const load = vi.fn(async () => ({ status: 200, body: JSON.stringify(ticket([good('A', 100)])) }));
    expect((await fetchOofd(q, load))!.lines).toHaveLength(1);
    expect(load).toHaveBeenCalledWith('/api/consumer-proxy/api/tickets/get-by-url?i=123456789&f=010101012345&s=4870.00&t=20260614T195301', expect.any(Number));
  });
  it('чужой портал, ошибка, таймаут — null, дальше работает фото', async () => {
    const load = vi.fn();
    expect(ofdSupported({ ...q, host: 'oofd.kz.evil.com' })).toBe(false);
    expect(await fetchOofd({ ...q, host: 'ofd1.kz' }, load)).toBeNull();
    expect(load).not.toHaveBeenCalled();
    expect(await fetchOofd(q, async () => ({ status: 500, body: '{"code":"INTERNAL_ERROR"}' }))).toBeNull();
    expect(await fetchOofd(q, async () => { throw new Error('таймаут'); })).toBeNull();
    expect(await fetchOofd(q, async () => ({ status: 200, body: '<html>' }))).toBeNull();
  });
});

import { beforeAll, describe, expect, it } from 'vitest';
import type { HistorySync } from '@/lib/syncSchema';
import type { Receipt } from '@/lib/types';
import { createAnonymousUser } from './auth';
import type { Db } from './db';
import { openPglite } from './db';
import { compareReceipt, normalizeStore, pricePointsOf } from './prices';
import { syncUser } from './sync';

let db: Db;
beforeAll(async () => { db = await openPglite(); }, 60_000);

const today = new Date().toISOString().slice(0, 10);
const T = Date.now() - 3_600_000;
const receipt = (store: string, items: Receipt['items'], approx = true): Receipt => ({ id: `r-${store}-${items[0].p}`, title: '', store, date: today, items, approx });
const entry = (id: string, r: Receipt, extra: Partial<HistorySync> = {}): HistorySync => ({ id, receiptId: r.id, store: r.store, date: r.date, cubes: 0, score: 50, swaps: [], receipt: r, updatedAt: T, ...extra });
const cola = (p: number) => ({ n: 'Напиток Coca-Cola 1 л', p, s: 106 });
const li = (n: string, p: number) => ({ n, p, s: 0 });

describe('магазины', () => {
  it.each([
    ['ТОО "MAGNUM CASH&CARRY"', 'Magnum'],
    ['Small Супермаркет', 'Small'],
    ['Арбуз', 'Arbuz'],
    ['ТОО "Рога и копыта"', 'Рога и копыта'],
    ['', 'Магазин'],
  ])('%s → %s', (raw, want) => expect(normalizeStore(raw)).toBe(want));
});

describe('цены за кг/л из позиций чека', () => {
  it('считает по объёму из названия и количеству', () => {
    const pts = pricePointsOf([cola(620), li('Колбаса докторская 400 г', 1480), li('Кола 0,5 л, 2 шт', 700)]);
    expect(pts.find(p => p.category === 'sausage')).toMatchObject({ unitPrice: 3700, unit: 'кг' });
    expect(pts.filter(p => p.category === 'soda').map(p => p.unitPrice)).toEqual([620, 700]);
    expect(pts[0].unit).toBe('л');
  });

  it('пропускает позиции без объёма, неизвестные и с нереальной ценой', () => {
    expect(pricePointsOf([li('Хлеб ржаной', 320), li('Что-то непонятное 1 кг', 500), li('Кола 1 л', 0), li('Кола 1 л', 5)])).toEqual([]);
  });
});

describe('сравнение магазинов', () => {
  it('находит, где дешевле, по чекам других пользователей; демо-чеки не считаются', async () => {
    const a = await createAnonymousUser(db), b = await createAnonymousUser(db), c = await createAnonymousUser(db);
    await syncUser(db, a.userId, { history: [entry('a1', receipt('Small', [cola(540)]))] });
    await syncUser(db, b.userId, { history: [entry('b1', receipt('Small', [cola(560)]))] });
    await syncUser(db, b.userId, { history: [entry('b2', receipt('Arbuz', [cola(700)]))] });
    // демо-чек (approx не задан) с «ценой» 100 не должен ничего испортить
    await syncUser(db, c.userId, { history: [entry('c1', { ...receipt('Galmart', [cola(100)]), approx: false })] });

    const res = await compareReceipt(db, { store: 'Magnum', items: [cola(620)] });
    expect(res.compared).toBe(1);
    expect(res.offers).toHaveLength(1);
    expect(res.offers[0]).toMatchObject({ store: 'Small', bestPrice: 550, yourPrice: 620, n: 2, unit: 'л', saving: 70 });
    expect(res.total).toBe(70);
  });

  it('свой же магазин не предлагается, а малая разница не считается выгодой', async () => {
    const same = await compareReceipt(db, { store: 'ТОО "Small"', items: [cola(620)] });
    expect(same.offers.every(o => o.store !== 'Small')).toBe(true);
    const near = await compareReceipt(db, { store: 'Magnum', items: [cola(560)] }); // 560 против 550 — меньше 8%
    expect(near.offers).toHaveLength(0);
  });

  it('удалённый чек убирает свои цены', async () => {
    const d = await createAnonymousUser(db);
    await syncUser(db, d.userId, { history: [entry('d1', receipt('Metro', [li('Кефир 1% 900 мл', 300)]))] });
    const before = await compareReceipt(db, { store: 'Magnum', items: [li('Кефир 1% 900 мл', 500)] });
    expect(before.offers[0]).toMatchObject({ store: 'Metro' });
    await syncUser(db, d.userId, { history: [entry('d1', receipt('Metro', [li('Кефир 1% 900 мл', 300)]), { deleted: true, updatedAt: T + 1000 })] });
    const after = await compareReceipt(db, { store: 'Magnum', items: [li('Кефир 1% 900 мл', 500)] });
    expect(after.offers).toHaveLength(0);
  });

  it('старые цены (больше 90 дней) не учитываются', async () => {
    const e = await createAnonymousUser(db);
    const old = new Date(Date.now() - 120 * 86_400_000).toISOString().slice(0, 10);
    const r = { ...receipt('Anvar', [li('Масло подсолнечное 1 л', 700)]), date: old };
    await syncUser(db, e.userId, { history: [entry('e1', r)] });
    const res = await compareReceipt(db, { store: 'Magnum', items: [li('Масло подсолнечное 1 л', 1200)] });
    expect(res.offers).toHaveLength(0);
  });
});

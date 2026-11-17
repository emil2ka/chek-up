// Интеграционный тест на настоящем Postgres (PGlite в памяти): аккаунты, связывание устройств, синхронизация.
import { beforeAll, describe, expect, it } from 'vitest';
import type { Db } from './db';
import { openPglite } from './db';
import { authenticate, createAnonymousUser, createLinkCode, redeemLinkCode } from './auth';
import { loadState, syncUser } from './sync';
import type { HistorySync } from '@/lib/syncSchema';

let db: Db;
const T = Date.now() - 3_600_000; // реалистичное время правок: старые «надгробия» сервер вычищает
beforeAll(async () => { db = await openPglite(); }, 60_000);

const req = (token?: string) => new Request('http://x/api/sync', { headers: token ? { authorization: `Bearer ${token}` } : {} });
const entry = (id: string, updatedAt: number, extra: Partial<HistorySync> = {}): HistorySync =>
  ({ id, receiptId: 'week', store: 'Magnum', date: '2026-11-16', cubes: 62, score: 54, swaps: [1], updatedAt, ...extra });

describe('аккаунты', () => {
  it('токен узнаётся, чужой и пустой — нет; в БД лежит только хеш', async () => {
    const a = await createAnonymousUser(db, 'iPhone');
    expect(await authenticate(db, req(a.token))).toEqual({ userId: a.userId });
    expect(await authenticate(db, req('cu_' + 'x'.repeat(43)))).toBeNull();
    expect(await authenticate(db, req())).toBeNull();
    const { devices } = await import('./db/schema');
    const rows = await db.select().from(devices);
    expect(rows.some(r => r.tokenHash === a.token)).toBe(false);
  });

  it('код связывает устройства в один аккаунт и одноразовый', async () => {
    const phone = await createAnonymousUser(db, 'phone');
    const { code, expiresInSec } = await createLinkCode(db, phone.userId);
    expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(expiresInSec).toBe(600);

    const web = await redeemLinkCode(db, code.toLowerCase(), 'web');
    expect(web?.userId).toBe(phone.userId);
    expect(web?.token).not.toBe(phone.token);
    expect(await authenticate(db, req(web!.token))).toEqual({ userId: phone.userId });
    expect(await redeemLinkCode(db, code, 'again')).toBeNull();
    expect(await redeemLinkCode(db, 'ZZZZ-ZZZZ')).toBeNull();
  });
});

describe('синхронизация', () => {
  it('телефон → сервер → веб; удаление и правка доезжают', async () => {
    const phone = await createAnonymousUser(db, 'phone');
    const web = await redeemLinkCode(db, (await createLinkCode(db, phone.userId)).code, 'web');

    await syncUser(db, phone.userId, {
      profile: { adults: 2, kids: 1, onboarded: true, seen: ['first'], updatedAt: T + 1000 },
      history: [entry('a', T + 1000), entry('b', T + 1000, { receipt: { id: 'p1', title: 'Фото', store: 'Small', date: '2026-11-16', items: [{ n: 'Кола', p: 600, s: 106 }], approx: true } })],
      shop: [{ name: 'Минералка', instead: 'Кола', done: false, updatedAt: T + 1000 }],
      stats: { barcodes: 3, shopDone: 0 },
    });

    const onWeb = await syncUser(db, web!.userId, {});
    expect(onWeb.history.map(h => h.id).sort()).toEqual(['a', 'b']);
    expect(onWeb.history.find(h => h.id === 'b')?.receipt?.items[0].n).toBe('Кола');
    expect(onWeb.profile).toMatchObject({ adults: 2, kids: 1 });
    expect(onWeb.shop[0]).toMatchObject({ name: 'Минералка', instead: 'Кола' });
    expect(onWeb.stats.barcodes).toBe(3);

    // веб удаляет чек «a» и меняет профиль, телефон одновременно купил минералку
    await syncUser(db, web!.userId, { history: [entry('a', T + 2000, { deleted: true })], profile: { adults: 3, kids: 1, onboarded: true, seen: [], updatedAt: T + 2000 } });
    const merged = await syncUser(db, phone.userId, { shop: [{ name: 'Минералка', instead: 'Кола', done: true, updatedAt: T + 1500 }], stats: { barcodes: 3, shopDone: 1 } });

    expect(merged.history.find(h => h.id === 'a')?.deleted).toBe(true);
    expect(merged.history.find(h => h.id === 'b')?.deleted).toBeUndefined();
    expect(merged.profile).toMatchObject({ adults: 3, seen: ['first'] });
    expect(merged.shop[0].done).toBe(true);
    expect(merged.stats).toEqual({ barcodes: 3, shopDone: 1 });
    expect(await loadState(db, phone.userId)).toEqual(merged);
  });

  it('данные разных пользователей не пересекаются', async () => {
    const a = await createAnonymousUser(db), b = await createAnonymousUser(db);
    await syncUser(db, a.userId, { history: [entry('same-id', T + 1000, { cubes: 11 })] });
    await syncUser(db, b.userId, { history: [entry('same-id', T + 1000, { cubes: 22 })] });
    expect((await loadState(db, a.userId)).history[0].cubes).toBe(11);
    expect((await loadState(db, b.userId)).history[0].cubes).toBe(22);
  });
});

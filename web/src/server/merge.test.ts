import { describe, expect, it } from 'vitest';
import type { HistorySync, ShopSync, SyncState } from '@/lib/syncSchema';
import { EMPTY_STATE, HISTORY_KEEP, diffState, mergeState } from './merge';

const NOW = Date.UTC(2026, 10, 17);
// времена изменения — реалистичные (в пределах суток от NOW), иначе «надгробия» сочтутся древними и вычистятся
const T = NOW - 3_600_000;
const h = (id: string, updatedAt: number, extra: Partial<HistorySync> = {}): HistorySync =>
  ({ id, receiptId: 'week', store: 'Magnum', date: '2026-11-16', cubes: 10, score: 60, swaps: [], updatedAt, ...extra });
const s = (name: string, updatedAt: number, extra: Partial<ShopSync> = {}): ShopSync => ({ name, instead: '', done: false, updatedAt, ...extra });
const state = (p: Partial<SyncState>): SyncState => ({ ...EMPTY_STATE, ...p });

describe('mergeState', () => {
  it('новее — побеждает, старее — игнорируется', () => {
    const server = state({ history: [h('a', T + 100, { cubes: 5 })] });
    const r1 = mergeState(server, { history: [h('a', T + 200, { cubes: 9 })] }, NOW);
    expect(r1.history[0].cubes).toBe(9);
    const r2 = mergeState(server, { history: [h('a', T + 50, { cubes: 1 })] }, NOW);
    expect(r2.history[0].cubes).toBe(5);
  });

  it('при равном времени остаётся серверная версия', () => {
    const r = mergeState(state({ history: [h('a', T + 100, { cubes: 5 })] }), { history: [h('a', T + 100, { cubes: 99 })] }, NOW);
    expect(r.history[0].cubes).toBe(5);
  });

  it('удаление побеждает старую запись, а новая запись — старое удаление', () => {
    const del = mergeState(state({ history: [h('a', T + 100)] }), { history: [h('a', T + 200, { deleted: true })] }, NOW);
    expect(del.history[0].deleted).toBe(true);
    const back = mergeState(del, { history: [h('a', T + 300)] }, NOW);
    expect(back.history[0].deleted).toBeUndefined();
  });

  it('старые «надгробия» чистятся, свежие остаются', () => {
    const old = NOW - 31 * 86_400_000, fresh = NOW - 86_400_000;
    const r = mergeState(state({ shop: [s('Молоко', old, { deleted: true }), s('Хлеб', fresh, { deleted: true })] }), {}, NOW);
    expect(r.shop.map(x => x.name)).toEqual(['Хлеб']);
  });

  it('чеки сверх лимита отбрасываются, самые старые первыми', () => {
    const many = Array.from({ length: HISTORY_KEEP + 5 }, (_, i) => h(`h${i}`, T + 1000 + i));
    const r = mergeState(EMPTY_STATE, { history: many }, NOW);
    expect(r.history).toHaveLength(HISTORY_KEEP);
    expect(r.history[0].id).toBe(`h${HISTORY_KEEP + 4}`);
  });

  it('профиль: новее побеждает, достижения объединяются', () => {
    const server = state({ profile: { adults: 1, kids: 0, onboarded: true, seen: ['first'], updatedAt: T + 100 } });
    const r = mergeState(server, { profile: { adults: 2, kids: 1, onboarded: true, seen: ['swap'], updatedAt: T + 200 } }, NOW);
    expect(r.profile).toMatchObject({ adults: 2, kids: 1, updatedAt: T + 200 });
    expect([...r.profile!.seen].sort()).toEqual(['first', 'swap']);
    const older = mergeState(r, { profile: { adults: 5, kids: 5, onboarded: false, seen: [], updatedAt: T + 50 } }, NOW);
    expect(older.profile).toMatchObject({ adults: 2, kids: 1 });
  });

  it('счётчики только растут', () => {
    const r = mergeState(state({ stats: { barcodes: 5, shopDone: 1 } }), { stats: { barcodes: 2, shopDone: 4 } }, NOW);
    expect(r.stats).toEqual({ barcodes: 5, shopDone: 4 });
  });

  it('запрос без полей ничего не меняет', () => {
    const server = state({ history: [h('a', T + 100)], shop: [s('Хлеб', T + 100)] });
    expect(mergeState(server, {}, NOW)).toEqual(server);
  });
});

describe('diffState', () => {
  it('отдаёт только изменившееся', () => {
    const before = state({ history: [h('a', T + 100), h('b', T + 100)] });
    const after = mergeState(before, { history: [h('b', T + 200), h('c', T + 50)] }, NOW);
    const d = diffState(before, after);
    expect(d.history.upsert.map(x => x.id).sort()).toEqual(['b', 'c']);
    expect(d.profile).toBeUndefined();
    expect(d.stats).toBeUndefined();
  });
});

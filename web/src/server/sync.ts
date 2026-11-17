// Синхронизация одного пользователя: прочитать состояние, слить с присланным, записать изменения — в одной транзакции.
import { and, eq, inArray } from 'drizzle-orm';
import type { HistorySync, ProfileSync, ShopSync, SyncRequest, SyncState } from '@/lib/syncSchema';
import type { Db } from './db';
import { history, pricePoints, profiles, shopItems, stats } from './db/schema';
import { diffState, EMPTY_STATE, mergeState } from './merge';
import { recordPrices } from './prices';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export async function loadState(tx: Db | Tx, userId: string): Promise<SyncState> {
  const [p] = await tx.select().from(profiles).where(eq(profiles.userId, userId)).limit(1);
  const h = await tx.select().from(history).where(eq(history.userId, userId));
  const s = await tx.select().from(shopItems).where(eq(shopItems.userId, userId));
  const [st] = await tx.select().from(stats).where(eq(stats.userId, userId)).limit(1);
  return {
    profile: p ? { adults: p.adults, kids: p.kids, onboarded: p.onboarded, seen: p.seen, updatedAt: p.updatedAt } : null,
    history: h.map(r => ({
      id: r.id, receiptId: r.receiptId, store: r.store, date: r.date, cubes: r.cubes, score: r.score, swaps: r.swaps,
      receipt: r.receipt, updatedAt: r.updatedAt, ...(r.deleted ? { deleted: true } : {}),
    })),
    shop: s.map(r => ({ name: r.name, instead: r.instead, done: r.done, updatedAt: r.updatedAt, ...(r.deleted ? { deleted: true } : {}) })),
    stats: st ? { barcodes: st.barcodes, shopDone: st.shopDone } : EMPTY_STATE.stats,
  };
}

const historyRow = (userId: string, h: HistorySync) => ({
  userId, id: h.id, receiptId: h.receiptId, store: h.store, date: h.date, cubes: h.cubes, score: h.score,
  swaps: h.swaps, receipt: h.receipt ?? null, updatedAt: h.updatedAt, deleted: !!h.deleted,
});
const shopRow = (userId: string, s: ShopSync) => ({ userId, name: s.name, instead: s.instead, done: s.done, updatedAt: s.updatedAt, deleted: !!s.deleted });
const profileRow = (userId: string, p: ProfileSync) => ({ userId, ...p });

/** Слить присланное с серверным и вернуть итог — его клиент принимает как свою новую правду. */
export async function syncUser(db: Db, userId: string, req: SyncRequest): Promise<SyncState> {
  return db.transaction(async tx => {
    const before = await loadState(tx, userId);
    const after = mergeState(before, req);
    const d = diffState(before, after);

    for (const h of d.history.upsert) {
      const row = historyRow(userId, h);
      await tx.insert(history).values(row).onConflictDoUpdate({ target: [history.userId, history.id], set: row });
      await recordPrices(tx, userId, h); // цены чека для сравнения магазинов (удалённый чек — убирает свои цены)
    }
    if (d.history.removed.length) await tx.delete(pricePoints).where(and(eq(pricePoints.userId, userId), inArray(pricePoints.entryId, d.history.removed.map(h => h.id))));
    if (d.history.removed.length) await tx.delete(history).where(and(eq(history.userId, userId), inArray(history.id, d.history.removed.map(h => h.id))));

    for (const s of d.shop.upsert) {
      const row = shopRow(userId, s);
      await tx.insert(shopItems).values(row).onConflictDoUpdate({ target: [shopItems.userId, shopItems.name], set: row });
    }
    if (d.shop.removed.length) await tx.delete(shopItems).where(and(eq(shopItems.userId, userId), inArray(shopItems.name, d.shop.removed.map(s => s.name))));

    if (d.profile) {
      const row = profileRow(userId, d.profile);
      await tx.insert(profiles).values(row).onConflictDoUpdate({ target: profiles.userId, set: row });
    }
    if (d.stats) await tx.insert(stats).values({ userId, ...d.stats }).onConflictDoUpdate({ target: stats.userId, set: d.stats });
    return after;
  });
}

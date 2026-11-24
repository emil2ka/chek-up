// Синхронизация: принять изменения одного участника, слить и отдать изменения семьи — в одной транзакции под блокировкой семьи.
import { and, eq, gt, inArray } from 'drizzle-orm';
import { weekFacts } from '@/lib/insights';
import { canClose, computeStreak, OFFLINE_GRACE_MS, type WeekMark } from '@/lib/streak';
import type { HistorySync, ProfileSync, ShopSync, SyncRequest, SyncState, WeekSync } from '@/lib/syncSchema';
import type { HistoryEntry } from '@/lib/types';
import type { Db } from './db';
import { families, history, identities, profiles, shopItems, stats, users, weekMarks } from './db/schema';
import { bumpRev, listMembers, lockFamily, membershipOf, type Membership, type Tx } from './family';
import { canSee, canWriteEntry, clampTime, maskReceipt, mergeProfile, mergeStats, newer, nextEntry, type StoredEntry } from './merge';
import { recordPrices } from './prices';

type HistoryRow = typeof history.$inferSelect;

const fromRow = (r: HistoryRow): StoredEntry => ({
  id: r.id, receiptId: r.receiptId, store: r.store, date: r.date, cubes: r.cubes, score: r.score, swaps: r.swaps, off: r.off,
  tag: r.tag === 'guests' ? 'guests' : '', priv: r.priv, receipt: r.receipt, updatedAt: r.updatedAt, deleted: r.deleted, authorId: r.authorId,
});

const toRow = (familyId: string, e: StoredEntry, rev: number) => ({
  familyId, id: e.id, receiptId: e.receiptId, store: e.store, date: e.date, cubes: e.cubes, score: e.score, swaps: e.swaps,
  off: e.off ?? [], tag: e.tag ?? '', priv: !!e.priv, authorId: e.authorId, receipt: e.deleted ? null : e.receipt ?? null,
  updatedAt: e.updatedAt, deleted: !!e.deleted, rev,
});

/** Чек в том виде, в каком его получает участник; null — не получает вовсе. */
function view(e: StoredEntry, me: Membership): HistorySync {
  const { authorId, ...rest } = e;
  // стал личным (или был): у остальных он исчезает
  if (!canSee(me.userId, e)) return { id: e.id, receiptId: 'deleted', store: '', date: '', cubes: 0, score: 0, swaps: [], updatedAt: e.updatedAt, deleted: true };
  const mine = authorId === me.userId;
  return {
    ...rest,
    ...(authorId ? { by: authorId } : {}),
    receipt: e.receipt && me.role === 'child' && !mine ? maskReceipt(e.receipt) : e.receipt ?? null,
    deleted: e.deleted ? true : undefined,
  };
}

const asEntry = (e: StoredEntry): HistoryEntry => ({
  id: e.id, receiptId: e.receiptId, store: e.store, date: e.date, cubes: e.cubes, score: e.score, swaps: e.swaps, off: e.off,
  ...(e.tag === 'guests' ? { tag: 'guests' as const } : {}), savedAt: e.updatedAt, ...(e.receipt ? { receipt: e.receipt } : {}),
});

async function pushHistory(tx: Tx, me: Membership, list: HistorySync[], now: number, rev: () => Promise<number>): Promise<void> {
  if (!list.length) return;
  const rows = await tx.select().from(history).where(and(eq(history.familyId, me.familyId), inArray(history.id, list.map(h => h.id)))).for('update');
  const have = new Map(rows.map(r => [r.id, fromRow(r)]));
  for (const inc of list) {
    const cur = have.get(inc.id);
    if (!canWriteEntry(me.role, me.userId, cur) || !newer(inc, cur)) continue;
    if (inc.receipt?.masked) continue; // замаскированную копию обратно не принимаем
    const next = nextEntry(inc, cur, me.userId, now);
    const row = toRow(me.familyId, next, await rev());
    await tx.insert(history).values(row).onConflictDoUpdate({ target: [history.familyId, history.id], set: row });
    have.set(inc.id, next);
    await recordPrices(tx, me.familyId, next); // цены для сравнения магазинов (удалённый чек убирает свои)
  }
}

async function pushShop(tx: Tx, me: Membership, list: ShopSync[], now: number, rev: () => Promise<number>): Promise<void> {
  if (!list.length) return;
  const rows = await tx.select().from(shopItems).where(and(eq(shopItems.familyId, me.familyId), inArray(shopItems.name, list.map(s => s.name))));
  const have = new Map(rows.map(r => [r.name, r]));
  for (const s of list) {
    if (!newer(s, have.get(s.name))) continue;
    const row = { familyId: me.familyId, name: s.name, instead: s.instead, done: s.done, updatedAt: clampTime(s.updatedAt, now), deleted: !!s.deleted, rev: await rev() };
    await tx.insert(shopItems).values(row).onConflictDoUpdate({ target: [shopItems.familyId, shopItems.name], set: row });
  }
}

async function pushWeeks(tx: Tx, me: Membership, list: WeekSync[], now: number, rev: () => Promise<number>): Promise<void> {
  if (!list.length || me.role === 'child') return;
  const rows = await tx.select().from(weekMarks).where(and(eq(weekMarks.familyId, me.familyId), inArray(weekMarks.week, list.map(w => w.week))));
  const have = new Map(rows.map(r => [r.week, r]));
  for (const w of list) {
    if (!newer(w, have.get(w.week)) || !canClose(w.week, now, OFFLINE_GRACE_MS)) continue;
    const row = { familyId: me.familyId, week: w.week, state: w.state, updatedAt: clampTime(w.updatedAt, now), rev: await rev() };
    await tx.insert(weekMarks).values(row).onConflictDoUpdate({ target: [weekMarks.familyId, weekMarks.week], set: row });
  }
}

const profileOf = (p: typeof profiles.$inferSelect | undefined): ProfileSync | null =>
  p ? { onboarded: p.onboarded, seen: p.seen, lang: p.lang === 'kk' ? 'kk' : 'ru', updatedAt: p.updatedAt } : null;

/** Слить присланное и вернуть изменения семьи после `since`. */
export async function syncUser(db: Db, userId: string, req: SyncRequest, now = Date.now()): Promise<SyncState> {
  return db.transaction(async tx => {
    const me = await membershipOf(tx, userId);
    await lockFamily(tx, me.familyId);
    let bumped: number | null = null;
    const rev = async () => (bumped ??= await bumpRev(tx, me.familyId)); // один номер на запрос

    await pushHistory(tx, me, req.history ?? [], now, rev);
    await pushShop(tx, me, req.shop ?? [], now, rev);
    await pushWeeks(tx, me, req.weeks ?? [], now, rev);

    const [f0] = await tx.select().from(families).where(eq(families.id, me.familyId));
    if (req.family && me.role !== 'child' && req.family.updatedAt > f0.updatedAt) {
      await tx.update(families).set({
        adults: req.family.adults, kids: req.family.kids, goal: req.family.goal,
        ...(req.family.name !== undefined ? { name: req.family.name } : {}), updatedAt: clampTime(req.family.updatedAt, now),
      }).where(eq(families.id, me.familyId));
      await rev();
    }

    const [p0] = await tx.select().from(profiles).where(eq(profiles.userId, userId));
    const before = profileOf(p0);
    const profile = mergeProfile(before, req.profile && { ...req.profile, updatedAt: clampTime(req.profile.updatedAt, now) });
    if (profile && JSON.stringify(profile) !== JSON.stringify(before)) {
      const row = { onboarded: profile.onboarded, seen: profile.seen, lang: profile.lang ?? 'ru', updatedAt: profile.updatedAt };
      await tx.insert(profiles).values({ userId, ...row }).onConflictDoUpdate({ target: profiles.userId, set: row });
    }

    const [s0] = await tx.select().from(stats).where(eq(stats.userId, userId));
    const st0 = { barcodes: s0?.barcodes ?? 0, shopDone: s0?.shopDone ?? 0, bestWeeks: s0?.bestWeeks ?? 0 };
    const st = mergeStats(st0, req.stats);
    if (st.barcodes !== st0.barcodes || st.shopDone !== st0.shopDone) await tx.insert(stats).values({ userId, ...st }).onConflictDoUpdate({ target: stats.userId, set: st });

    return readState(tx, me, req, { profile, stats: st, now });
  });
}

/** Прочитать изменения без записи. */
export async function loadState(db: Db, userId: string, now = Date.now()): Promise<SyncState> {
  return syncUser(db, userId, {}, now);
}

async function readState(tx: Tx, me: Membership, req: SyncRequest, x: { profile: ProfileSync | null; stats: SyncState['stats']; now: number }): Promise<SyncState> {
  const [f] = await tx.select().from(families).where(eq(families.id, me.familyId));
  const full = req.since === undefined || req.familyId !== me.familyId || req.since > f.rev;
  const since = full ? -1 : req.since!;

  // для стрика нужен весь журнал семьи, для ответа — только новое
  const all = (await tx.select().from(history).where(eq(history.familyId, me.familyId))).map(r => ({ rev: r.rev, e: fromRow(r) }));
  const fresh = all.filter(r => r.rev > since && !(full && r.e.deleted)).map(r => view(r.e, me)).filter(v => !(full && v.deleted));
  const shop = await tx.select().from(shopItems).where(and(eq(shopItems.familyId, me.familyId), gt(shopItems.rev, since)));
  const marks: WeekMark[] = (await tx.select().from(weekMarks).where(eq(weekMarks.familyId, me.familyId))).map(w => ({ week: w.week, state: w.state, updatedAt: w.updatedAt }));
  const [u] = await tx.select({ name: users.name }).from(users).where(eq(users.id, me.userId));
  const [idn] = await tx.select({ email: identities.email }).from(identities).where(eq(identities.userId, me.userId)).limit(1);

  const facts = weekFacts(all.filter(r => !r.e.deleted).map(r => asEntry(r.e)), { adults: f.adults, kids: f.kids });
  const streak = computeStreak(marks, facts, x.now);
  const bestWeeks = Math.max(x.stats.bestWeeks ?? 0, streak.best);
  if (bestWeeks !== (x.stats.bestWeeks ?? 0)) {
    await tx.insert(stats).values({ userId: me.userId, ...x.stats, bestWeeks }).onConflictDoUpdate({ target: stats.userId, set: { bestWeeks } });
  }
  return {
    cursor: f.rev,
    full,
    me: { id: me.userId, name: u?.name ?? '', email: idn?.email ?? '', role: me.role },
    family: { id: f.id, name: f.name, adults: f.adults, kids: f.kids, goal: f.goal, updatedAt: f.updatedAt, members: await listMembers(tx, f.id, me.userId) },
    profile: x.profile,
    history: fresh.sort((a, b) => b.updatedAt - a.updatedAt),
    shop: shop.filter(s => !(full && s.deleted)).map(s => ({ name: s.name, instead: s.instead, done: s.done, updatedAt: s.updatedAt, ...(s.deleted ? { deleted: true } : {}) })),
    weeks: marks.sort((a, b) => a.week.localeCompare(b.week)),
    stats: { ...x.stats, bestWeeks },
    streak,
  };
}

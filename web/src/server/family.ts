// Семья: кто в ней состоит, приглашения, переход в другую семью и выход.
import { createHash, randomInt } from 'node:crypto';
import { and, asc, eq, gt, inArray, lt, ne, sql } from 'drizzle-orm';
import type { RoleName } from '@/lib/syncSchema';
import type { Db } from './db';
import { corrections, families, history, invites, members, pricePoints, shopItems, users, weekMarks } from './db/schema';

export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
export type Membership = { userId: string; familyId: string; role: RoleName };

export const INVITE_TTL_MS = 2 * 86_400_000;
export const MAX_MEMBERS = 12;
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const hash = (code: string) => createHash('sha256').update('invite:' + code).digest('hex');
const newCode = () => Array.from({ length: 10 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
const clean = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');

/** Новая семья из одного человека. */
export async function createFamily(tx: Db | Tx, userId: string, seed: { adults?: number; kids?: number; goal?: number } = {}): Promise<Membership> {
  const [f] = await tx.insert(families).values({ ...seed, updatedAt: 0, rev: 1 }).returning({ id: families.id });
  await tx.insert(members).values({ userId, familyId: f.id, role: 'owner' });
  return { userId, familyId: f.id, role: 'owner' };
}

export async function membershipOf(tx: Db | Tx, userId: string): Promise<Membership> {
  const [m] = await tx.select().from(members).where(eq(members.userId, userId)).limit(1);
  return m ? { userId, familyId: m.familyId, role: m.role } : createFamily(tx, userId);
}

/** Заблокировать семью до конца транзакции: номера правок выдаются строго по порядку, клиенты ничего не пропустят. */
export async function lockFamily(tx: Tx, familyId: string) {
  const [f] = await tx.select().from(families).where(eq(families.id, familyId)).for('update');
  if (!f) throw new Error('семья не найдена');
  return f;
}

/** Следующий номер правки семьи (вызывать под lockFamily). */
export async function bumpRev(tx: Tx, familyId: string): Promise<number> {
  const [r] = await tx.update(families).set({ rev: sql`${families.rev} + 1` }).where(eq(families.id, familyId)).returning({ rev: families.rev });
  return r.rev;
}

export async function listMembers(tx: Db | Tx, familyId: string, me: string) {
  const rows = await tx.select({ id: users.id, name: users.name, role: members.role, joinedAt: members.joinedAt })
    .from(members).innerJoin(users, eq(users.id, members.userId)).where(eq(members.familyId, familyId)).orderBy(asc(members.joinedAt));
  return rows.map(r => ({ id: r.id, name: r.name, role: r.role, me: r.id === me }));
}

export class FamilyError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); }
}

export async function createInvite(db: Db, me: Membership, role: 'adult' | 'child') {
  if (me.role === 'child') throw new FamilyError(403, 'forbidden', 'Приглашать в семью могут только взрослые');
  await db.delete(invites).where(lt(invites.expiresAt, new Date()));
  const code = newCode();
  await db.insert(invites).values({ codeHash: hash(code), familyId: me.familyId, role, createdBy: me.userId, expiresAt: new Date(Date.now() + INVITE_TTL_MS) });
  return { code: `${code.slice(0, 5)}-${code.slice(5)}`, expiresInSec: INVITE_TTL_MS / 1000 };
}

/** Что увидит приглашённый до согласия. */
export async function previewInvite(db: Db, raw: string) {
  const [i] = await db.select().from(invites).where(and(eq(invites.codeHash, hash(clean(raw))), gt(invites.expiresAt, new Date()))).limit(1);
  if (!i) return null;
  const [f] = await db.select({ name: families.name }).from(families).where(eq(families.id, i.familyId));
  const [u] = await db.select({ name: users.name }).from(users).where(eq(users.id, i.createdBy));
  const n = await db.select({ id: members.userId }).from(members).where(eq(members.familyId, i.familyId));
  return { role: i.role, familyName: f?.name ?? '', invitedBy: u?.name ?? '', members: n.length };
}

/**
 * Перенести данные из одной семьи в другую (строки с тем же ключом не затираются, побеждает более свежая).
 * only — только чеки этого автора; copy — оставить копию; priv — пометить перенесённое личным; historyOnly — без списка и недель.
 */
export async function moveData(tx: Tx, from: string, to: string, opts: { only?: string; copy?: boolean; priv?: boolean; historyOnly?: boolean } = {}): Promise<void> {
  const [a, b] = [from, to].sort(); // порядок блокировки одинаковый, чтобы два переноса не заперли друг друга
  await lockFamily(tx, a); await lockFamily(tx, b);
  const rev = await bumpRev(tx, to);

  const rows = await tx.select().from(history).where(and(eq(history.familyId, from), opts.only ? eq(history.authorId, opts.only) : undefined));
  const have = new Map((await tx.select({ id: history.id, updatedAt: history.updatedAt }).from(history).where(eq(history.familyId, to))).map(r => [r.id, r.updatedAt]));
  for (const r of rows) {
    const at = have.get(r.id);
    if (at !== undefined && at >= r.updatedAt) continue;
    const row = { ...r, familyId: to, rev, priv: opts.priv ? true : r.priv };
    await tx.insert(history).values(row).onConflictDoUpdate({ target: [history.familyId, history.id], set: row });
  }
  const ids = rows.map(r => r.id);
  if (ids.length) {
    const prices = await tx.select().from(pricePoints).where(and(eq(pricePoints.familyId, from), inArray(pricePoints.entryId, ids)));
    // одна и та же цена не должна считаться дважды: в исходной семье её не остаётся
    await tx.delete(pricePoints).where(and(eq(pricePoints.familyId, from), inArray(pricePoints.entryId, ids)));
    if (prices.length) await tx.insert(pricePoints).values(prices.map(p => ({ ...p, familyId: to }))).onConflictDoNothing();
    if (!opts.copy) await tx.delete(history).where(and(eq(history.familyId, from), inArray(history.id, ids)));
  }
  if (opts.only || opts.historyOnly) return;

  const shop = await tx.select().from(shopItems).where(eq(shopItems.familyId, from));
  if (shop.length) await tx.insert(shopItems).values(shop.map(s => ({ ...s, familyId: to, rev }))).onConflictDoNothing();
  const marks = await tx.select().from(weekMarks).where(eq(weekMarks.familyId, from));
  if (marks.length) await tx.insert(weekMarks).values(marks.map(w => ({ ...w, familyId: to, rev }))).onConflictDoNothing();
  const fix = await tx.select().from(corrections).where(eq(corrections.familyId, from));
  if (fix.length) await tx.insert(corrections).values(fix.map(c => ({ ...c, familyId: to }))).onConflictDoNothing();
}

/** Убрать пустую семью (без участников). */
export async function dropIfEmpty(tx: Tx, familyId: string): Promise<void> {
  const left = await tx.select({ id: members.userId }).from(members).where(eq(members.familyId, familyId)).limit(1);
  if (!left.length) await tx.delete(families).where(eq(families.id, familyId));
}

/** Если из семьи ушёл владелец — им становится взрослый, который в ней дольше всех (нет взрослых — самый давний участник). */
export async function ensureOwner(tx: Tx, familyId: string): Promise<void> {
  const rows = await tx.select().from(members).where(eq(members.familyId, familyId)).orderBy(asc(members.joinedAt));
  if (!rows.length || rows.some(r => r.role === 'owner')) return;
  const next = rows.find(r => r.role === 'adult') ?? rows[0];
  await tx.update(members).set({ role: 'owner' }).where(eq(members.userId, next.userId));
}

/**
 * Вступить в семью по коду. Свои чеки человек всегда забирает с собой: share — их видит вся семья, иначе они остаются личными.
 * Стрик остаётся тот, что у семьи.
 */
export async function joinFamily(db: Db, userId: string, raw: string, share: boolean): Promise<Membership> {
  return db.transaction(async tx => {
    const [i] = await tx.delete(invites).where(and(eq(invites.codeHash, hash(clean(raw))), gt(invites.expiresAt, new Date()))).returning();
    if (!i) throw new FamilyError(404, 'bad_code', 'Приглашение не подошло или устарело. Попроси новое');
    const me = await membershipOf(tx, userId);
    if (me.familyId === i.familyId) throw new FamilyError(409, 'already', 'Ты уже в этой семье');
    const now = await tx.select({ id: members.userId }).from(members).where(eq(members.familyId, i.familyId));
    if (now.length >= MAX_MEMBERS) throw new FamilyError(409, 'full', `В семье уже ${MAX_MEMBERS} человек`);

    const others = await tx.select({ id: members.userId }).from(members).where(and(eq(members.familyId, me.familyId), ne(members.userId, userId)));
    // был один — переезжает весь журнал; иначе только свои чеки (у прежней семьи остаётся копия неличных)
    await moveData(tx, me.familyId, i.familyId, others.length ? { only: userId, copy: true, priv: !share } : { historyOnly: true, priv: !share });
    if (others.length) await tx.delete(history).where(and(eq(history.familyId, me.familyId), eq(history.authorId, userId), eq(history.priv, true)));
    await tx.update(members).set({ familyId: i.familyId, role: i.role, joinedAt: new Date() }).where(eq(members.userId, userId));
    await ensureOwner(tx, me.familyId);
    await dropIfEmpty(tx, me.familyId);
    await lockFamily(tx, i.familyId);
    await bumpRev(tx, i.familyId);
    return { userId, familyId: i.familyId, role: i.role };
  });
}

/** Выйти: у человека снова своя семья, его чеки копируются с ним, в прежней семье они тоже остаются (кроме личных). */
export async function leaveFamily(db: Db, userId: string): Promise<Membership> {
  return db.transaction(async tx => {
    const me = await membershipOf(tx, userId);
    const others = await tx.select({ id: members.userId }).from(members).where(and(eq(members.familyId, me.familyId), ne(members.userId, userId)));
    if (!others.length) throw new FamilyError(409, 'alone', 'В семье только ты, выходить некуда');
    const f = await lockFamily(tx, me.familyId);
    await tx.delete(members).where(eq(members.userId, userId));
    const mine = await createFamily(tx, userId, { adults: 1, kids: 0, goal: f.goal });
    await moveData(tx, me.familyId, mine.familyId, { only: userId, copy: true });
    await tx.delete(history).where(and(eq(history.familyId, me.familyId), eq(history.authorId, userId), eq(history.priv, true)));
    await ensureOwner(tx, me.familyId);
    await bumpRev(tx, me.familyId);
    return mine;
  });
}

export async function setRole(db: Db, me: Membership, targetId: string, role: RoleName): Promise<void> {
  if (me.role !== 'owner') throw new FamilyError(403, 'forbidden', 'Менять роли может только владелец семьи');
  if (targetId === me.userId) throw new FamilyError(400, 'self', 'Свою роль изменить нельзя: передай владение другому');
  await db.transaction(async tx => {
    await lockFamily(tx, me.familyId);
    const [t] = await tx.select().from(members).where(and(eq(members.userId, targetId), eq(members.familyId, me.familyId)));
    if (!t) throw new FamilyError(404, 'not_found', 'Такого участника в семье нет');
    await tx.update(members).set({ role }).where(eq(members.userId, targetId));
    if (role === 'owner') await tx.update(members).set({ role: 'adult' }).where(eq(members.userId, me.userId)); // владелец один
    await bumpRev(tx, me.familyId);
  });
}

/** Убрать участника: у него появляется своя семья со своими чеками. */
export async function removeMember(db: Db, me: Membership, targetId: string): Promise<void> {
  if (me.role !== 'owner') throw new FamilyError(403, 'forbidden', 'Убирать участников может только владелец семьи');
  if (targetId === me.userId) throw new FamilyError(400, 'self', 'Чтобы выйти самому, нажми «Выйти из семьи»');
  const [t] = await db.select().from(members).where(and(eq(members.userId, targetId), eq(members.familyId, me.familyId)));
  if (!t) throw new FamilyError(404, 'not_found', 'Такого участника в семье нет');
  await leaveFamily(db, targetId);
}

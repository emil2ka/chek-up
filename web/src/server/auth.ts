// Аккаунты. Первый запуск — гость: пользователь, семья из одного человека и токен устройства (в БД только его SHA-256).
// Вход (почта, Google, Apple) привязывает личность к гостю или открывает уже существующий аккаунт — данные гостя переезжают в него.
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { and, desc, eq, gt, lt, ne, sql } from 'drizzle-orm';
import type { Db } from './db';
import { audit, devices, emailCodes, families, history, identities, linkCodes, members, profiles, shopItems, stats, users, weekMarks } from './db/schema';
import { createFamily, dropIfEmpty, ensureOwner, lockFamily, bumpRev, membershipOf, moveData, type Tx } from './family';

export const LINK_TTL_SEC = 600;
// без похожих символов (0/O, 1/I/L), чтобы код легко диктовать и вводить
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LEN = 8;

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
const newToken = () => 'cu_' + randomBytes(32).toString('base64url');
const newCode = () => Array.from({ length: CODE_LEN }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');

/** «k7f2-m9xq» и «K7F2M9XQ» — один и тот же код. */
export const normalizeCode = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');

export type Session = { userId: string; token: string };
export type Auth = { userId: string; deviceId: string };

export class AuthError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); }
}

const log = (tx: Db | Tx, userId: string, action: string) => tx.insert(audit).values({ userId, action });

/** Новый токен. replaces — прежний токен этого же устройства: он больше не нужен. */
async function addDevice(tx: Db | Tx, userId: string, label: string, replaces: Auth | null = null): Promise<Session> {
  const token = newToken();
  if (replaces) await tx.delete(devices).where(eq(devices.id, replaces.deviceId));
  await tx.insert(devices).values({ tokenHash: hashToken(token), userId, label: label.slice(0, 60) });
  return { userId, token };
}

export async function createAnonymousUser(db: Db, label = ''): Promise<Session> {
  return db.transaction(async tx => {
    const [u] = await tx.insert(users).values({}).returning({ id: users.id });
    await createFamily(tx, u.id);
    return addDevice(tx, u.id, label);
  });
}

const SEEN_EVERY_MS = 6 * 3_600_000;

export async function authenticate(db: Db, request: Request): Promise<Auth | null> {
  const m = /^Bearer (cu_[A-Za-z0-9_-]{20,100})$/.exec(request.headers.get('authorization') ?? '');
  if (!m) return null;
  const tokenHash = hashToken(m[1]);
  const [row] = await db.select({ userId: devices.userId, deviceId: devices.id, seen: devices.lastSeenAt }).from(devices).where(eq(devices.tokenHash, tokenHash)).limit(1);
  if (!row) return null;
  if (Date.now() - row.seen.getTime() > SEEN_EVERY_MS) await db.update(devices).set({ lastSeenAt: new Date() }).where(eq(devices.tokenHash, tokenHash));
  return { userId: row.userId, deviceId: row.deviceId };
}

// ── код для другого своего устройства ──
export async function createLinkCode(db: Db, userId: string): Promise<{ code: string; expiresInSec: number }> {
  await db.delete(linkCodes).where(lt(linkCodes.expiresAt, new Date())); // заодно чистим просроченные
  for (let i = 0; i < 5; i++) {
    const code = newCode();
    try {
      await db.insert(linkCodes).values({ code, userId, expiresAt: new Date(Date.now() + LINK_TTL_SEC * 1000) });
      return { code: `${code.slice(0, 4)}-${code.slice(4)}`, expiresInSec: LINK_TTL_SEC };
    } catch {
      /* такой код уже есть — берём другой */
    }
  }
  throw new Error('не удалось выдать код');
}

/** Код одноразовый: удаляем и проверяем срок одним запросом, чтобы два устройства не использовали его вместе. */
export async function redeemLinkCode(db: Db, raw: string, label = '', current: Auth | null = null): Promise<Session | null> {
  const code = normalizeCode(raw);
  if (code.length !== CODE_LEN) return null;
  return db.transaction(async tx => {
    const [row] = await tx.delete(linkCodes).where(and(eq(linkCodes.code, code), gt(linkCodes.expiresAt, new Date()))).returning({ userId: linkCodes.userId });
    if (!row) return null;
    if (current && current.userId !== row.userId) await absorbGuest(tx, current.userId, row.userId);
    await log(tx, row.userId, 'device.link');
    return addDevice(tx, row.userId, label, current);
  });
}

// ── личности ──
export type Identity = { provider: 'email' | 'google' | 'apple'; subject: string; email: string; name?: string };

const identitiesOf = (tx: Db | Tx, userId: string) => tx.select().from(identities).where(eq(identities.userId, userId));

/**
 * Гость вошёл в уже существующий аккаунт: его чеки, список и недели переезжают, гостевой пользователь исчезает.
 * У кого есть свой вход, тот не гость: его данные не трогаем. Гостя, который состоит в семье с другими людьми, молча не переносим.
 */
async function absorbGuest(tx: Tx, guestId: string, intoId: string): Promise<void> {
  if ((await identitiesOf(tx, guestId)).length) return;
  const from = await membershipOf(tx, guestId), to = await membershipOf(tx, intoId);
  if (from.familyId === to.familyId) {
    await tx.update(history).set({ authorId: intoId }).where(and(eq(history.familyId, to.familyId), eq(history.authorId, guestId)));
  } else {
    const others = await tx.select({ id: members.userId }).from(members).where(and(eq(members.familyId, from.familyId), ne(members.userId, guestId)));
    if (others.length) throw new AuthError(409, 'in_family', 'Этот вход уже занят другим аккаунтом. Сначала выйди из семьи на этом устройстве');
    await tx.update(history).set({ authorId: intoId }).where(eq(history.familyId, from.familyId));
    await moveData(tx, from.familyId, to.familyId);
  }
  await tx.delete(users).where(eq(users.id, guestId)); // устройства гостя отключаются вместе с ним
  await dropIfEmpty(tx, from.familyId);
}

/** Вход подтверждённой личностью. current — кем было это устройство до входа. */
export async function signIn(db: Db, id: Identity, current: Auth | null, label = ''): Promise<Session & { created: boolean }> {
  return db.transaction(async tx => {
    let [found] = await tx.select().from(identities).where(and(eq(identities.provider, id.provider), eq(identities.subject, id.subject))).limit(1);
    if (!found && id.email) {
      // тот же подтверждённый адрес у другого способа входа — это тот же человек
      const [same] = await tx.select().from(identities).where(eq(identities.email, id.email)).limit(1);
      if (same) {
        [found] = await tx.insert(identities).values({ provider: id.provider, subject: id.subject, email: id.email, userId: same.userId }).returning();
      }
    }
    if (found) {
      if (current && current.userId !== found.userId) await absorbGuest(tx, current.userId, found.userId);
      await log(tx, found.userId, `signin.${id.provider}`);
      return { ...(await addDevice(tx, found.userId, label, current)), created: false };
    }
    // новая личность: у гостя появляется вход, иначе заводим аккаунт. Чужой вход на занятый аккаунт не вешаем.
    let userId = current?.userId ?? null;
    if (userId && (await identitiesOf(tx, userId)).some(x => x.provider === id.provider)) userId = null;
    if (!userId) {
      const [u] = await tx.insert(users).values({ name: (id.name ?? '').slice(0, 40) }).returning({ id: users.id });
      userId = u.id;
      await createFamily(tx, userId);
    } else if (id.name) {
      await tx.update(users).set({ name: id.name.slice(0, 40) }).where(and(eq(users.id, userId), eq(users.name, '')));
    }
    await tx.insert(identities).values({ provider: id.provider, subject: id.subject, email: id.email, userId });
    await log(tx, userId, `signup.${id.provider}`);
    return { ...(await addDevice(tx, userId, label, current)), created: true };
  });
}

// ── почта ──
export const EMAIL_TTL_MS = 10 * 60_000;
export const EMAIL_RESEND_MS = 45_000;
export const EMAIL_ATTEMPTS = 5;
export const normalizeEmail = (s: string) => s.trim().toLowerCase();
const codeHash = (email: string, code: string) => createHash('sha256').update(`${email}:${code}`).digest('hex');

/** Выдать код. null — просили слишком недавно. */
export async function issueEmailCode(db: Db, email: string, now = Date.now()): Promise<string | null> {
  await db.delete(emailCodes).where(lt(emailCodes.expiresAt, new Date(now - 3_600_000)));
  const [cur] = await db.select().from(emailCodes).where(eq(emailCodes.email, email));
  if (cur && now - cur.createdAt.getTime() < EMAIL_RESEND_MS) return null;
  const code = String(randomInt(1_000_000)).padStart(6, '0');
  const row = { email, codeHash: codeHash(email, code), attempts: 0, expiresAt: new Date(now + EMAIL_TTL_MS), createdAt: new Date(now) };
  await db.insert(emailCodes).values(row).onConflictDoUpdate({ target: emailCodes.email, set: row });
  return code;
}

/** Проверить код: попытка тратится до сравнения, поэтому подбор параллельными запросами не поможет. */
export async function checkEmailCode(db: Db, email: string, code: string, now = Date.now()): Promise<boolean> {
  const [row] = await db.update(emailCodes).set({ attempts: sql`${emailCodes.attempts} + 1` })
    .where(and(eq(emailCodes.email, email), gt(emailCodes.expiresAt, new Date(now)), lt(emailCodes.attempts, EMAIL_ATTEMPTS))).returning();
  if (!row) return false;
  const a = Buffer.from(row.codeHash), b = Buffer.from(codeHash(email, code.replace(/\D/g, '')));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  // код одноразовый: если его уже использовал параллельный запрос, удалять нечего
  return (await db.delete(emailCodes).where(and(eq(emailCodes.email, email), eq(emailCodes.codeHash, row.codeHash))).returning({ e: emailCodes.email })).length === 1;
}

// ── устройства и аккаунт ──
export async function listDevices(db: Db, me: Auth) {
  const rows = await db.select().from(devices).where(eq(devices.userId, me.userId)).orderBy(desc(devices.lastSeenAt));
  return rows.map(d => ({ id: d.id, label: d.label, createdAt: d.createdAt.toISOString(), lastSeenAt: d.lastSeenAt.toISOString(), current: d.id === me.deviceId }));
}

/** what: 'this' | 'others' | 'all' | id устройства */
export async function signOut(db: Db, me: Auth, what: string): Promise<void> {
  const mine = eq(devices.userId, me.userId);
  if (what === 'all') await db.delete(devices).where(mine);
  else if (what === 'others') await db.delete(devices).where(and(mine, ne(devices.id, me.deviceId)));
  else await db.delete(devices).where(and(mine, eq(devices.id, what === 'this' ? me.deviceId : what)));
  await log(db, me.userId, `signout.${what === 'all' || what === 'others' || what === 'this' ? what : 'device'}`);
}

export async function rename(db: Db, userId: string, name: string): Promise<void> {
  await db.transaction(async tx => {
    const m = await membershipOf(tx, userId);
    await lockFamily(tx, m.familyId);
    await tx.update(users).set({ name: name.trim().slice(0, 40) }).where(eq(users.id, userId));
    await bumpRev(tx, m.familyId);
  });
}

export async function accountInfo(db: Db, me: Auth) {
  const [u] = await db.select().from(users).where(eq(users.id, me.userId));
  const ids = await identitiesOf(db, me.userId);
  return { id: me.userId, name: u?.name ?? '', logins: ids.map(i => ({ provider: i.provider, email: i.email })), devices: await listDevices(db, me) };
}

/** Всё, что сервер хранит о человеке (его чеки, профиль, недели семьи) — для выгрузки. */
export async function exportData(db: Db, me: Auth) {
  const m = await membershipOf(db, me.userId);
  const [f] = await db.select().from(families).where(eq(families.id, m.familyId));
  const [p] = await db.select().from(profiles).where(eq(profiles.userId, me.userId));
  const [s] = await db.select().from(stats).where(eq(stats.userId, me.userId));
  const h = await db.select().from(history).where(and(eq(history.familyId, m.familyId), eq(history.deleted, false)));
  return {
    exportedAt: new Date().toISOString(),
    account: await accountInfo(db, me),
    role: m.role,
    family: f ? { name: f.name, adults: f.adults, kids: f.kids, goal: f.goal } : null,
    profile: p ? { onboarded: p.onboarded, lang: p.lang, seen: p.seen } : null,
    stats: s ? { barcodes: s.barcodes, shopDone: s.shopDone, bestWeeks: s.bestWeeks } : null,
    receipts: h.filter(r => r.authorId === me.userId).map(r => ({ id: r.id, store: r.store, date: r.date, plan: r.swaps, notForUs: r.off, tag: r.tag, personal: r.priv, receipt: r.receipt })),
    shopList: (await db.select().from(shopItems).where(and(eq(shopItems.familyId, m.familyId), eq(shopItems.deleted, false)))).map(x => ({ name: x.name, instead: x.instead, done: x.done })),
    weeks: (await db.select().from(weekMarks).where(eq(weekMarks.familyId, m.familyId))).map(w => ({ week: w.week, state: w.state })),
    log: (await db.select().from(audit).where(eq(audit.userId, me.userId)).orderBy(desc(audit.id)).limit(100)).map(a => ({ action: a.action, at: a.createdAt.toISOString() })),
  };
}

/** Удалить аккаунт: личные чеки стираются, общие остаются семье без имени автора; если в семье больше никого — стирается всё. */
export async function deleteAccount(db: Db, userId: string): Promise<void> {
  await db.transaction(async tx => {
    const m = await membershipOf(tx, userId);
    await lockFamily(tx, m.familyId);
    await tx.delete(history).where(and(eq(history.familyId, m.familyId), eq(history.authorId, userId), eq(history.priv, true)));
    await tx.delete(users).where(eq(users.id, userId));
    await ensureOwner(tx, m.familyId);
    await bumpRev(tx, m.familyId);
    await dropIfEmpty(tx, m.familyId);
  });
}

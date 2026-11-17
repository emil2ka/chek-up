// Анонимные аккаунты. Токен устройства — случайная строка, в БД только её SHA-256.
// Связывание устройств: на одном выдаём короткий код, на другом вводим — получаем свой токен для того же аккаунта.
import { createHash, randomBytes, randomInt } from 'node:crypto';
import { and, eq, gt, lt } from 'drizzle-orm';
import type { Db } from './db';
import { devices, linkCodes, users } from './db/schema';

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

export async function createAnonymousUser(db: Db, label = ''): Promise<Session> {
  const token = newToken();
  const [u] = await db.insert(users).values({}).returning({ id: users.id });
  await db.insert(devices).values({ tokenHash: hashToken(token), userId: u.id, label: label.slice(0, 60) });
  return { userId: u.id, token };
}

export async function authenticate(db: Db, request: Request): Promise<{ userId: string } | null> {
  const m = /^Bearer (cu_[A-Za-z0-9_-]{20,100})$/.exec(request.headers.get('authorization') ?? '');
  if (!m) return null;
  const [row] = await db.select({ userId: devices.userId }).from(devices).where(eq(devices.tokenHash, hashToken(m[1]))).limit(1);
  return row ?? null;
}

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
export async function redeemLinkCode(db: Db, raw: string, label = ''): Promise<Session | null> {
  const code = normalizeCode(raw);
  if (code.length !== CODE_LEN) return null;
  const [row] = await db.delete(linkCodes).where(and(eq(linkCodes.code, code), gt(linkCodes.expiresAt, new Date()))).returning({ userId: linkCodes.userId });
  if (!row) return null;
  const token = newToken();
  await db.insert(devices).values({ tokenHash: hashToken(token), userId: row.userId, label: label.slice(0, 60) });
  return { userId: row.userId, token };
}

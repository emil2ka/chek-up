// Общие мелочи для route handlers: лимит запросов, IP, JSON-ошибки, чтение тела с потолком размера.
import type { ZodType } from 'zod';
import { authenticate, type Auth } from './auth';
import { getDb, type Db } from './db';

export const fail = (status: number, code: string, message: string) => Response.json({ error: { code, message } }, { status });

export const clientIp = (request: Request) => (request.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'local';

/**
 * Скользящее окно в памяти одного инстанса: защита от случайного спама, а не от целенаправленной атаки.
 * При нескольких инстансах лимит у каждого свой — для хакатона достаточно.
 */
export function rateLimiter(perWindow: number, windowMs: number) {
  const hits = new Map<string, number[]>();
  return (key: string): boolean => {
    const now = Date.now();
    const list = (hits.get(key) ?? []).filter(t => now - t < windowMs);
    list.push(now);
    hits.set(key, list);
    if (hits.size > 5000) hits.clear();
    return list.length > perWindow;
  };
}

/** Тело запроса как JSON по схеме. Больше maxBytes не читаем. */
export async function readJson<T>(request: Request, schema: ZodType<T>, maxBytes = 1_000_000): Promise<{ ok: true; data: T } | { ok: false; res: Response }> {
  const text = await request.text().catch(() => '');
  if (text.length > maxBytes) return { ok: false, res: fail(413, 'too_large', 'Слишком большой запрос') };
  let json: unknown = {};
  if (text.trim()) {
    try { json = JSON.parse(text); } catch { return { ok: false, res: fail(400, 'bad_request', 'Некорректный JSON') }; }
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) return { ok: false, res: fail(400, 'bad_request', 'Данные не по схеме') };
  return { ok: true, data: parsed.data };
}

const noStore = { 'cache-control': 'no-store' };
export const ok = (data: unknown = { ok: true }, status = 200) => Response.json(data, { status, headers: noStore });

/** Ошибка с кодом и текстом, понятным человеку (AuthError, FamilyError). */
type Known = { status: number; code: string; message: string };
const isKnown = (e: unknown): e is Known => e instanceof Error && 'status' in e && 'code' in e && typeof (e as unknown as Known).status === 'number' && typeof (e as unknown as Known).code === 'string';

/** Обёртка route handler: БД, вход, понятные ошибки. */
export async function withAuth(request: Request, tag: string, fn: (ctx: { db: Db; me: Auth }) => Promise<Response>): Promise<Response> {
  return guarded(tag, async db => {
    const me = await authenticate(db, request);
    return me ? fn({ db, me }) : fail(401, 'unauthorized', 'Нужен вход');
  });
}

export async function guarded(tag: string, fn: (db: Db) => Promise<Response>): Promise<Response> {
  try {
    return await fn(await getDb());
  } catch (err) {
    if (isKnown(err)) return fail(err.status, err.code, err.message);
    console.error(`[${tag}]`, err);
    return fail(503, 'unavailable', 'Сервер данных недоступен. Попробуй позже');
  }
}

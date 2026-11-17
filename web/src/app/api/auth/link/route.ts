// POST /api/auth/link — выдать короткий код, чтобы войти в этот же аккаунт с другого устройства.
import { authenticate, createLinkCode } from '@/server/auth';
import { getDb } from '@/server/db';
import { fail, rateLimiter } from '@/server/http';

const limited = rateLimiter(10, 10 * 60_000);

export async function POST(request: Request) {
  try {
    const db = await getDb();
    const me = await authenticate(db, request);
    if (!me) return fail(401, 'unauthorized', 'Нужен вход');
    if (limited(me.userId)) return fail(429, 'rate_limit', 'Слишком много кодов. Подожди немного');
    return Response.json(await createLinkCode(db, me.userId), { headers: { 'cache-control': 'no-store' } });
  } catch (err) {
    console.error('[auth] link', err);
    return fail(503, 'unavailable', 'Сервер данных недоступен. Попробуй позже');
  }
}

// /api/sync — общая БД для веба и мобильного приложения.
//   GET  — забрать полное состояние пользователя;
//   POST — прислать свои изменения; в ответе полное состояние после слияния (клиент принимает его как новую правду).
import { authenticate } from '@/server/auth';
import { getDb } from '@/server/db';
import { fail, rateLimiter, readJson } from '@/server/http';
import { loadState, syncUser } from '@/server/sync';
import { SyncRequestSchema } from '@/lib/syncSchema';

const limited = rateLimiter(120, 60_000);
const headers = { 'cache-control': 'no-store' };

async function handle(request: Request, push: boolean) {
  try {
    const db = await getDb();
    const me = await authenticate(db, request);
    if (!me) return fail(401, 'unauthorized', 'Нужен вход');
    if (limited(me.userId)) return fail(429, 'rate_limit', 'Слишком часто. Подожди немного');
    if (!push) return Response.json(await loadState(db, me.userId), { headers });
    const body = await readJson(request, SyncRequestSchema);
    if (!body.ok) return body.res;
    return Response.json(await syncUser(db, me.userId, body.data), { headers });
  } catch (err) {
    console.error('[sync]', err);
    return fail(503, 'unavailable', 'Сервер данных недоступен. Попробуй позже');
  }
}

export const GET = (request: Request) => handle(request, false);
export const POST = (request: Request) => handle(request, true);

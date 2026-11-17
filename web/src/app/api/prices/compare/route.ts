// POST /api/prices/compare — где позиции этого чека дешевле. Тело: { store, items: [{ n, p }] }.
// Сравнивает с ценами других магазинов из отсканированных чеков пользователей «Чек-апа» (за последние 90 дней).
import { z } from 'zod';
import { authenticate } from '@/server/auth';
import { getDb } from '@/server/db';
import { fail, rateLimiter, readJson } from '@/server/http';
import { compareReceipt } from '@/server/prices';

const limited = rateLimiter(60, 60_000);
const Body = z.object({
  store: z.string().max(200),
  items: z.array(z.object({ n: z.string().min(1).max(200), p: z.number().nonnegative() })).min(1).max(200),
});

export async function POST(request: Request) {
  try {
    const db = await getDb();
    const me = await authenticate(db, request);
    if (!me) return fail(401, 'unauthorized', 'Нужен вход');
    if (limited(me.userId)) return fail(429, 'rate_limit', 'Слишком часто. Подожди немного');
    const body = await readJson(request, Body);
    if (!body.ok) return body.res;
    return Response.json(await compareReceipt(db, body.data), { headers: { 'cache-control': 'no-store' } });
  } catch (err) {
    console.error('[prices]', err);
    return fail(503, 'unavailable', 'Сервер данных недоступен. Попробуй позже');
  }
}

// POST /api/auth/link/redeem — ввести код с другого устройства и получить токен для того же аккаунта.
import { z } from 'zod';
import { redeemLinkCode } from '@/server/auth';
import { getDb } from '@/server/db';
import { clientIp, fail, rateLimiter, readJson } from '@/server/http';

const limited = rateLimiter(10, 10 * 60_000); // подбор кода: 10 попыток за 10 минут с адреса
const Body = z.object({ code: z.string().min(4).max(20), label: z.string().max(60).optional() });

export async function POST(request: Request) {
  if (limited(clientIp(request))) return fail(429, 'rate_limit', 'Слишком много попыток. Подожди немного');
  const body = await readJson(request, Body, 2_000);
  if (!body.ok) return body.res;
  try {
    const s = await redeemLinkCode(await getDb(), body.data.code, body.data.label);
    if (!s) return fail(404, 'bad_code', 'Код не подошёл или устарел. Выдай новый на первом устройстве');
    return Response.json(s, { headers: { 'cache-control': 'no-store' } });
  } catch (err) {
    console.error('[auth] redeem', err);
    return fail(503, 'unavailable', 'Сервер данных недоступен. Попробуй позже');
  }
}

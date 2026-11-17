// POST /api/auth/anonymous — новый анонимный аккаунт и токен для этого устройства.
import { z } from 'zod';
import { createAnonymousUser } from '@/server/auth';
import { getDb } from '@/server/db';
import { clientIp, fail, rateLimiter, readJson } from '@/server/http';

const limited = rateLimiter(20, 60 * 60_000); // 20 новых аккаунтов в час с одного адреса
const Body = z.object({ label: z.string().max(60).optional() });

export async function POST(request: Request) {
  if (limited(clientIp(request))) return fail(429, 'rate_limit', 'Слишком много попыток. Попробуй позже');
  const body = await readJson(request, Body, 2_000);
  if (!body.ok) return body.res;
  try {
    const s = await createAnonymousUser(await getDb(), body.data.label);
    return Response.json(s, { status: 201, headers: { 'cache-control': 'no-store' } });
  } catch (err) {
    console.error('[auth] anonymous', err);
    return fail(503, 'unavailable', 'Сервер данных недоступен. Попробуй позже');
  }
}

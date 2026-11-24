// POST /api/auth/anonymous — гость: новый аккаунт и токен для этого устройства.
import { z } from 'zod';
import { createAnonymousUser } from '@/server/auth';
import { clientIp, fail, guarded, ok, rateLimiter, readJson } from '@/server/http';

const limited = rateLimiter(20, 60 * 60_000); // 20 новых аккаунтов в час с одного адреса
const Body = z.object({ label: z.string().max(60).optional() });

export const POST = (request: Request) => guarded('auth.anonymous', async db => {
  if (limited(clientIp(request))) return fail(429, 'rate_limit', 'Слишком много попыток. Попробуй позже');
  const body = await readJson(request, Body, 2_000);
  return body.ok ? ok(await createAnonymousUser(db, body.data.label), 201) : body.res;
});

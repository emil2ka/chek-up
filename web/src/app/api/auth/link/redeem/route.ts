// POST /api/auth/link/redeem — ввести код с другого устройства и получить токен для того же аккаунта.
// Если устройство уже было гостем, его чеки переезжают в общий аккаунт.
import { z } from 'zod';
import { authenticate, redeemLinkCode } from '@/server/auth';
import { clientIp, fail, guarded, ok, rateLimiter, readJson } from '@/server/http';

const limited = rateLimiter(10, 10 * 60_000); // подбор кода: 10 попыток за 10 минут с адреса
const Body = z.object({ code: z.string().min(4).max(20), label: z.string().max(60).optional() });

export const POST = (request: Request) => guarded('auth.redeem', async db => {
  if (limited(clientIp(request))) return fail(429, 'rate_limit', 'Слишком много попыток. Попробуй позже');
  const body = await readJson(request, Body, 2_000);
  if (!body.ok) return body.res;
  const s = await redeemLinkCode(db, body.data.code, body.data.label, await authenticate(db, request));
  return s ? ok(s) : fail(404, 'bad_code', 'Код не подошёл или устарел. Выдай новый на первом устройстве');
});

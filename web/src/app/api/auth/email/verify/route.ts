// POST /api/auth/email/verify — код из письма → вход. Гостевые данные этого устройства сохраняются.
import { z } from 'zod';
import { authenticate, checkEmailCode, normalizeEmail, signIn } from '@/server/auth';
import { clientIp, fail, guarded, ok, rateLimiter, readJson } from '@/server/http';

const limited = rateLimiter(20, 10 * 60_000);
const Body = z.object({ email: z.string().max(120).transform(normalizeEmail).pipe(z.email()), code: z.string().min(4).max(12), label: z.string().max(60).optional() });

export const POST = (request: Request) => guarded('auth.email', async db => {
  if (limited(clientIp(request))) return fail(429, 'rate_limit', 'Слишком много попыток. Попробуй позже');
  const body = await readJson(request, Body, 2_000);
  if (!body.ok) return body.res;
  const { email, code, label } = body.data;
  if (!(await checkEmailCode(db, email, code))) return fail(400, 'bad_code', 'Код не подошёл или устарел');
  return ok(await signIn(db, { provider: 'email', subject: email, email }, await authenticate(db, request), label));
});

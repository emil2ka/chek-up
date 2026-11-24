// POST /api/auth/link — короткий код, чтобы войти в этот же аккаунт с другого своего устройства.
import { createLinkCode } from '@/server/auth';
import { fail, ok, rateLimiter, withAuth } from '@/server/http';

const limited = rateLimiter(10, 10 * 60_000);

export const POST = (request: Request) => withAuth(request, 'auth.link', async ({ db, me }) =>
  limited(me.userId) ? fail(429, 'rate_limit', 'Слишком много кодов. Подожди немного') : ok(await createLinkCode(db, me.userId)));

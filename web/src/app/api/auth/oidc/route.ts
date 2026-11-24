// POST /api/auth/oidc — вход через Google или Apple: клиент присылает id_token.
import { z } from 'zod';
import { authenticate, signIn } from '@/server/auth';
import { clientIp, fail, guarded, ok, rateLimiter, readJson } from '@/server/http';
import { oidcEnabled, verifyIdToken } from '@/server/oidc';

const limited = rateLimiter(20, 10 * 60_000);
const Body = z.object({ provider: z.enum(['google', 'apple']), idToken: z.string().min(20).max(6000), label: z.string().max(60).optional(), name: z.string().max(60).optional() });

export const POST = (request: Request) => guarded('auth.oidc', async db => {
  if (limited(clientIp(request))) return fail(429, 'rate_limit', 'Слишком много попыток. Попробуй позже');
  const body = await readJson(request, Body, 10_000);
  if (!body.ok) return body.res;
  const { provider, idToken, label, name } = body.data;
  if (!oidcEnabled(provider)) return fail(404, 'disabled', 'Этот способ входа пока не подключён');
  const id = await verifyIdToken(provider, idToken);
  if (!id) return fail(401, 'bad_token', 'Не получилось войти. Попробуй ещё раз');
  return ok(await signIn(db, { ...id, name: id.name ?? name }, await authenticate(db, request), label));
});

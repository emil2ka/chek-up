// POST /api/family/invite — приглашение в семью (код на двое суток, одноразовый).
import { z } from 'zod';
import { createInvite, membershipOf } from '@/server/family';
import { fail, ok, rateLimiter, readJson, withAuth } from '@/server/http';

const limited = rateLimiter(20, 60 * 60_000);
const Body = z.object({ role: z.enum(['adult', 'child']) });

export const POST = (request: Request) => withAuth(request, 'family.invite', async ({ db, me }) => {
  if (limited(me.userId)) return fail(429, 'rate_limit', 'Слишком много приглашений. Подожди немного');
  const body = await readJson(request, Body, 2_000);
  return body.ok ? ok(await createInvite(db, await membershipOf(db, me.userId), body.data.role)) : body.res;
});

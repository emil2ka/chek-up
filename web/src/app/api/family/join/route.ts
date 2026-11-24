// POST /api/family/join — preview: true показывает, куда зовут; иначе вступить. share — видит ли семья мои прошлые чеки.
import { z } from 'zod';
import { joinFamily, previewInvite } from '@/server/family';
import { clientIp, fail, ok, rateLimiter, readJson, withAuth } from '@/server/http';

const limited = rateLimiter(20, 10 * 60_000);
const Body = z.object({ code: z.string().min(6).max(20), preview: z.boolean().optional(), share: z.boolean().optional() });

export const POST = (request: Request) => withAuth(request, 'family.join', async ({ db, me }) => {
  if (limited(clientIp(request))) return fail(429, 'rate_limit', 'Слишком много попыток. Попробуй позже');
  const body = await readJson(request, Body, 2_000);
  if (!body.ok) return body.res;
  if (body.data.preview) {
    const p = await previewInvite(db, body.data.code);
    return p ? ok(p) : fail(404, 'bad_code', 'Приглашение не подошло или устарело. Попроси новое');
  }
  return ok(await joinFamily(db, me.userId, body.data.code, body.data.share ?? true));
});

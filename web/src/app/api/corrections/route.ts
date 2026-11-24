// POST /api/corrections — запомнить исправленные строки чека для этого магазина.
import { z } from 'zod';
import { saveCorrections } from '@/server/corrections';
import { membershipOf } from '@/server/family';
import { fail, ok, rateLimiter, readJson, withAuth } from '@/server/http';

const limited = rateLimiter(60, 60_000);
const n = z.number().nonnegative().max(200_000).optional();
const Body = z.object({
  store: z.string().max(200),
  items: z.array(z.object({
    raw: z.string().min(1).max(160),
    item: z.object({ n: z.string().min(1).max(160), s: n, t: n, f: n, k: n, c: n, b: n, w: z.number().int().min(1).max(26).optional(), nf: z.literal(1).optional(), junk: z.union([z.literal(0), z.literal(1)]).optional() }),
  })).min(1).max(100),
});

export const POST = (request: Request) => withAuth(request, 'corrections', async ({ db, me }) => {
  if (limited(me.userId)) return fail(429, 'rate_limit', 'Слишком часто. Подожди немного');
  const body = await readJson(request, Body, 60_000);
  if (!body.ok) return body.res;
  const m = await membershipOf(db, me.userId);
  if (m.role === 'child') return fail(403, 'forbidden', 'Исправления запоминаем только за взрослыми');
  await saveCorrections(db, m.familyId, body.data.store, body.data.items);
  return ok();
});

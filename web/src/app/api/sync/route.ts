// /api/sync — общая БД для веба и мобильного приложения.
//   POST — прислать свои изменения и получить изменения семьи после `since` (контракт — src/lib/syncSchema.ts).
import { SyncRequestSchema } from '@/lib/syncSchema';
import { fail, ok, rateLimiter, readJson, withAuth } from '@/server/http';
import { syncUser } from '@/server/sync';

const limited = rateLimiter(120, 60_000);

export const POST = (request: Request) => withAuth(request, 'sync', async ({ db, me }) => {
  if (limited(me.userId)) return fail(429, 'rate_limit', 'Слишком часто. Подожди немного');
  const body = await readJson(request, SyncRequestSchema, 4_000_000);
  return body.ok ? ok(await syncUser(db, me.userId, body.data)) : body.res;
});

// POST /api/scan/enrich — показатели и замены для позиций, которых нет в справочнике. Ответ по порядку запроса; null — не оценили.
import { z } from 'zod';
import { scanConfig } from '@/lib/scan/config';
import { ScanError } from '@/lib/scan/errors';
import { ENRICH_MAX, enrichItems } from '@/lib/scan/pipeline';
import { fail, ok, rateLimiter, readJson, withAuth } from '@/server/http';
import { consume } from '@/server/usage';

const limited = rateLimiter(12, 60_000);
const Body = z.object({ items: z.array(z.object({ n: z.string().min(1).max(160), p: z.number().nonnegative().max(10_000_000) })).min(1).max(ENRICH_MAX) });

export const POST = (request: Request) => withAuth(request, 'scan.enrich', async ({ db, me }) => {
  const body = await readJson(request, Body, 40_000);
  if (!body.ok) return body.res;
  if (limited(me.userId)) return fail(429, 'rate_limit', 'Слишком часто. Подожди немного');
  const cfg = scanConfig();
  if (!cfg) return ok({ items: body.data.items.map(() => null) });
  if (!(await consume(db, `enrich:${me.userId}`, 120)) || !(await consume(db, 'enrich:all', 1500))) return fail(429, 'daily_limit', 'На сегодня уточнения закончились');
  try {
    return ok({ items: await enrichItems(body.data.items, cfg) });
  } catch (err) {
    if (!(err instanceof ScanError)) throw err;
    console.warn('[enrich]', err.code, err.cause ?? '');
    return ok({ items: body.data.items.map(() => null) }); // чек уже показан по справочнику — это не ошибка для человека
  }
});

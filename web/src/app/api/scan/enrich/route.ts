// POST /api/scan/enrich — показатели и замены для позиций, которых нет в справочнике. Ответ по порядку запроса; null — не оценили.
import { z } from 'zod';
import { buildItem, lineOf, needsModel } from '@/lib/scan/build';
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
  // ручной ввод из приложения: что есть в справочнике, модели не нужно
  const items = body.data.items.map(it => { const known = buildItem(lineOf(it)); return needsModel(known) ? null : known; });
  const rest = items.flatMap((it, i) => (it ? [] : [i]));
  const cfg = scanConfig();
  if (!rest.length || !cfg) return ok({ items });
  if (!(await consume(db, `enrich:${me.userId}`, 120)) || !(await consume(db, 'enrich:all', 1500))) return fail(429, 'daily_limit', 'На сегодня уточнения закончились');
  try {
    const got = await enrichItems(rest.map(i => body.data.items[i]), cfg);
    rest.forEach((i, k) => { items[i] = got[k]; });
  } catch (err) {
    if (!(err instanceof ScanError)) throw err;
    console.warn('[enrich]', err.code, err.cause ?? ''); // чек уже показан по справочнику — это не ошибка для человека
  }
  return ok({ items });
});

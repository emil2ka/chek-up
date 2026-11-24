// GET /api/account/export — все мои данные одним файлом JSON.
import { connection } from 'next/server';
import { exportData } from '@/server/auth';
import { fail, ok, rateLimiter, withAuth } from '@/server/http';

const limited = rateLimiter(6, 60 * 60_000);

export async function GET(request: Request) {
  await connection(); // не выполнять при сборке
  return withAuth(request, 'account.export', async ({ db, me }) =>
    limited(me.userId) ? fail(429, 'rate_limit', 'Слишком часто. Попробуй позже') : ok(await exportData(db, me)));
}

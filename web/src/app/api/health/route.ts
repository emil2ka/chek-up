// GET /api/health — жив ли сервер и подключена ли БД (для мониторинга и проверки деплоя).
import { sql } from 'drizzle-orm';
import { getDb } from '@/server/db';
import { scanConfig } from '@/lib/scan/config';

export async function GET() {
  const scan = scanConfig();
  try {
    await (await getDb()).execute(sql`select 1`);
    return Response.json({ ok: true, db: process.env.DATABASE_URL ? 'postgres' : 'pglite', scan: scan ? 'ai' : 'demo' }, { headers: { 'cache-control': 'no-store' } });
  } catch {
    return Response.json({ ok: false, db: 'down', scan: scan ? 'ai' : 'demo' }, { status: 503, headers: { 'cache-control': 'no-store' } });
  }
}

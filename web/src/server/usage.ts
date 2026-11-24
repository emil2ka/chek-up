// Дневные счётчики в БД: общий лимит для всех экземпляров сервера (защита платного ключа ИИ и почты).
import { lt, sql } from 'drizzle-orm';
import { addDays, todayIso } from '@/lib/calendar';
import type { Db } from './db';
import { usage } from './db/schema';

/** Потратить одну попытку. false — лимит на сегодня исчерпан. */
export async function consume(db: Db, key: string, limit: number, now = Date.now()): Promise<boolean> {
  const day = todayIso(now);
  const [row] = await db.insert(usage).values({ key, day, n: 1 })
    .onConflictDoUpdate({ target: [usage.key, usage.day], set: { n: sql`${usage.n} + 1` } }).returning({ n: usage.n });
  if (row.n === 1) await db.delete(usage).where(lt(usage.day, addDays(day, -7)));
  return row.n <= limit;
}

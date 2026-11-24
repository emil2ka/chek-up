// Подключение к БД. Одна и та же схема в двух режимах:
//   • DATABASE_URL задан  → обычный Postgres (Supabase, Neon, свой сервер); миграции — `pnpm db:migrate`
//   • DATABASE_URL нет    → встроенный Postgres PGlite в папке .data/pglite (для разработки, без Docker),
//                           миграции применяются сами.
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import * as schema from './schema';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- PGlite и postgres-js дают разные типы результата запроса
export type Db = PgDatabase<any, typeof schema>;

export const migrationsFolder = () => path.join(process.cwd(), 'drizzle');

const g = globalThis as { __chekupDb?: Promise<Db>; __chekupDbFail?: { err: unknown; at: number } };
const RETRY_AFTER_MS = 10_000;

/** Один экземпляр на процесс (в dev Next перезагружает модули, поэтому держим его в globalThis). */
export function getDb(): Promise<Db> {
  const fail = g.__chekupDbFail;
  // после неудачи несколько секунд повторяем ту же ошибку, а не открываем БД заново на каждый запрос
  if (fail && Date.now() - fail.at < RETRY_AFTER_MS) return Promise.reject(fail.err);
  if (!g.__chekupDb) {
    g.__chekupDb = open().catch(err => {
      g.__chekupDb = undefined;
      g.__chekupDbFail = { err, at: Date.now() };
      throw err;
    });
  }
  return g.__chekupDb;
}

/**
 * PGlite не умеет блокировать папку: два процесса на одной папке молча её портят (так бывает, когда dev-сервер
 * перезапустили, а старый остался жить). Поэтому рядом лежит файл с pid владельца, и второй процесс получает понятную ошибку.
 */
function lockDir(dir: string): void {
  const lock = `${dir}.lock`;
  if (existsSync(lock)) {
    const pid = Number(readFileSync(lock, 'utf8'));
    let alive = false;
    try { process.kill(pid, 0); alive = pid !== process.pid; } catch { /* процесса нет — замок остался от прошлого запуска */ }
    if (alive) throw new Error(`Локальная БД ${dir} уже открыта другим процессом (pid ${pid}). Останови второй сервер: kill ${pid}`);
  }
  writeFileSync(lock, String(process.pid));
  process.once('exit', () => { try { unlinkSync(lock); } catch { /* уже удалён */ } });
}

async function open(): Promise<Db> {
  const url = (process.env.DATABASE_URL ?? '').trim();
  if (url) {
    const { drizzle } = await import('drizzle-orm/postgres-js');
    const { default: postgres } = await import('postgres');
    // prepare: false — чтобы работать через пулер Supabase в режиме transaction
    return drizzle(postgres(url, { max: 5, prepare: false }), { schema }) as unknown as Db;
  }
  // у облачного хостинга диск временный: без настоящей базы чеки людей пропали бы при первом же перезапуске
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) throw new Error('DATABASE_URL не задан: на хостинге нужна настоящая Postgres');
  // только для разработки: путь динамический, в серверный бандл тащить проект не нужно
  const dir = path.resolve(/*turbopackIgnore: true*/ process.env.PGLITE_DIR || '.data/pglite');
  mkdirSync(dir, { recursive: true });
  lockDir(dir);
  return openPglite(dir);
}

/** dir не задан — БД в памяти (для тестов). */
export async function openPglite(dir?: string): Promise<Db> {
  const { PGlite } = await import('@electric-sql/pglite');
  const { drizzle } = await import('drizzle-orm/pglite');
  const { migrate } = await import('drizzle-orm/pglite/migrator');
  const db = drizzle(new PGlite(dir), { schema });
  await migrate(db, { migrationsFolder: migrationsFolder() });
  return db as unknown as Db;
}

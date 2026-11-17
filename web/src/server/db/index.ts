// Подключение к БД. Одна и та же схема в двух режимах:
//   • DATABASE_URL задан  → обычный Postgres (Supabase, Neon, свой сервер); миграции — `pnpm db:migrate`
//   • DATABASE_URL нет    → встроенный Postgres PGlite в папке .data/pglite (для разработки, без Docker),
//                           миграции применяются сами.
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import * as schema from './schema';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- PGlite и postgres-js дают разные типы результата запроса
export type Db = PgDatabase<any, typeof schema>;

export const migrationsFolder = () => path.join(process.cwd(), 'drizzle');

const g = globalThis as { __chekupDb?: Promise<Db> };

/** Один экземпляр на процесс (в dev Next перезагружает модули, поэтому держим его в globalThis). */
export function getDb(): Promise<Db> {
  if (!g.__chekupDb) {
    g.__chekupDb = open().catch(err => {
      g.__chekupDb = undefined; // не запоминаем неудачу — следующий запрос попробует снова
      throw err;
    });
  }
  return g.__chekupDb;
}

async function open(): Promise<Db> {
  const url = (process.env.DATABASE_URL ?? '').trim();
  if (url) {
    const { drizzle } = await import('drizzle-orm/postgres-js');
    const { default: postgres } = await import('postgres');
    // prepare: false — чтобы работать через пулер Supabase в режиме transaction
    return drizzle(postgres(url, { max: 5, prepare: false }), { schema }) as unknown as Db;
  }
  // только для разработки: путь динамический, в серверный бандл тащить проект не нужно
  const dir = path.resolve(/*turbopackIgnore: true*/ process.env.PGLITE_DIR || '.data/pglite');
  mkdirSync(dir, { recursive: true });
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

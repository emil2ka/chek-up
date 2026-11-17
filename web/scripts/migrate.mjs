// Применить миграции к Postgres из DATABASE_URL:  pnpm db:migrate
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

const url = (process.env.DATABASE_URL ?? '').trim();
if (!url) {
  console.error('Нужен DATABASE_URL (строка подключения Postgres). Для локальной разработки миграции не нужны — PGlite применяет их сам.');
  process.exit(1);
}
const client = postgres(url, { max: 1, prepare: false });
await migrate(drizzle(client), { migrationsFolder: './drizzle' });
await client.end();
console.log('Миграции применены.');

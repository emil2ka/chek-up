// Применить миграции к Postgres:  pnpm db:migrate
// Адрес: DATABASE_URL, а на Vercel с Supabase — POSTGRES_URL_NON_POOLING (миграциям нужно обычное соединение, не пулер).
// --on-deploy: на сборке Vercel. Миграции идут только перед выкладкой основной версии; без базы сборка не останавливается.
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

const env = process.env, deploy = process.argv.includes('--on-deploy');
const raw = [env.DATABASE_URL, env.POSTGRES_URL_NON_POOLING, env.POSTGRES_URL].map(v => (v ?? '').trim()).find(Boolean);
if (deploy && (env.VERCEL_ENV !== 'production' || !raw)) {
  console.log(raw ? 'Не основная версия: миграции пропущены.' : 'База не подключена: миграции пропущены.');
  process.exit(0);
}
if (!raw) {
  console.error('Нужен DATABASE_URL (строка подключения Postgres). Для локальной разработки миграции не нужны — PGlite применяет их сам.');
  process.exit(1);
}
const url = new URL(raw);
url.searchParams.delete('supa'); // служебный параметр Vercel, Postgres его не понимает
const client = postgres(url.toString(), { max: 1, prepare: false, onnotice: () => {} });
try {
  await migrate(drizzle(client), { migrationsFolder: './drizzle' });
  console.log('Миграции применены.');
} finally {
  await client.end();
}

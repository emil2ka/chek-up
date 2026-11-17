import { defineConfig } from 'drizzle-kit';

// `pnpm db:generate` строит SQL-миграции из src/server/db/schema.ts в папку drizzle/ (БД для этого не нужна).
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/server/db/schema.ts',
  out: './drizzle',
});

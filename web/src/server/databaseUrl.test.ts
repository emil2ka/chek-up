import { getTableConfig, PgTable } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import { databaseUrl } from './db';
import * as schema from './db/schema';

describe('подключение к базе', () => {
  it('своя строка важнее, от интеграции Supabase убираем служебный параметр', () => {
    expect(databaseUrl({})).toBe('');
    expect(databaseUrl({ POSTGRES_URL: 'postgres://u:p@h:6543/db?sslmode=require&supa=base-pooler.x' })).toBe('postgres://u:p@h:6543/db?sslmode=require');
    expect(databaseUrl({ DATABASE_URL: ' postgres://a:b@c/d ', POSTGRES_URL: 'postgres://u:p@h/db' })).toBe('postgres://a:b@c/d');
  });
  it('все таблицы закрыты для публичного API Supabase', () => {
    const open = (Object.values(schema) as unknown[]).filter((t): t is PgTable => t instanceof PgTable).map(getTableConfig).filter(t => !t.enableRLS).map(t => t.name);
    expect(open).toEqual([]);
  });
});

// Перенос базы со старой схемы (аккаунт без семьи) на новую: данные не теряются.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';

const sql = (f: string) => readFileSync(path.join(process.cwd(), 'drizzle', f), 'utf8').split('--> statement-breakpoint');

describe('миграция 0002', () => {
  it('у каждого пользователя появляется семья, чеки получают автора', async () => {
    const db = new PGlite();
    for (const f of ['0000_stale_nico_minoru.sql', '0001_melodic_roulette.sql']) for (const s of sql(f)) await db.exec(s);
    const u = '11111111-1111-4111-8111-111111111111', lone = '22222222-2222-4222-8222-222222222222';
    await db.exec(`insert into users(id) values ('${u}'), ('${lone}');
      insert into profiles(user_id, adults, kids, onboarded, seen, updated_at) values ('${u}', 2, 1, true, '["first"]', 77);
      insert into history(user_id, id, receipt_id, updated_at) values ('${u}', 'a', 'week', 5);
      insert into shop_items(user_id, name) values ('${u}', 'Вода');
      insert into price_points(user_id, entry_id, category, store, unit_price, unit, seen_on) values ('${u}', 'a', 'soda', 'Small', 600, 'л', '2026-11-16');`);
    for (const s of sql('0002_families.sql')) await db.exec(s);
    const fam = (await db.query<{ id: string; adults: number; kids: number }>('select * from families order by adults desc')).rows;
    expect(fam).toHaveLength(2);
    expect(fam[0]).toMatchObject({ id: u, adults: 2, kids: 1, rev: 1 });
    expect((await db.query<{ role: string }>('select * from members')).rows.every(m => m.role === 'owner')).toBe(true);
    expect((await db.query<{ author_id: string; rev: number }>('select * from history')).rows[0]).toMatchObject({ author_id: u, rev: 1 });
    expect((await db.query('select * from shop_items')).rows).toHaveLength(1);
    expect((await db.query('select * from price_points')).rows).toHaveLength(1);
  }, 30_000);
});

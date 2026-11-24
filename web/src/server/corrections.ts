// Память исправлений семьи: что человек исправил один раз, в следующем чеке того же магазина подставится само.
import { and, eq, inArray } from 'drizzle-orm';
import { applyCorrection, rawKey, storeKey, type Correction } from '@/lib/scan/build';
import type { Receipt } from '@/lib/types';
import type { Db } from './db';
import { corrections } from './db/schema';

export async function saveCorrections(db: Db, familyId: string, store: string, list: { raw: string; item: Correction }[]): Promise<void> {
  const at = Date.now();
  for (const { raw, item } of list) {
    const key = rawKey(raw);
    if (!key) continue;
    const row = { familyId, store: storeKey(store), raw: key, item, updatedAt: at };
    await db.insert(corrections).values(row).onConflictDoUpdate({ target: [corrections.familyId, corrections.store, corrections.raw], set: row });
  }
}

export async function applyCorrections(db: Db, familyId: string, r: Receipt): Promise<Receipt> {
  const keys = [...new Set(r.items.map(it => rawKey(it.n)))].filter(Boolean);
  if (!keys.length) return r;
  const rows = await db.select().from(corrections).where(and(eq(corrections.familyId, familyId), eq(corrections.store, storeKey(r.store)), inArray(corrections.raw, keys)));
  if (!rows.length) return r;
  const by = new Map(rows.map(x => [x.raw, x.item as Correction]));
  return { ...r, items: r.items.map(it => { const fix = by.get(rawKey(it.n)); return fix ? applyCorrection(it, fix) : it; }) };
}

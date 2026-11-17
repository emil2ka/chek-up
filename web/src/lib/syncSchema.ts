// Контракт синхронизации (JSON между сервером, вебом и Flutter-приложением).
// Зеркало на стороне Flutter — mobile/lib/core/sync.dart. Меняешь здесь — меняй там.
import { z } from 'zod';
import { ReceiptSchema } from './schema';

const ms = z.number().int().nonnegative();

export const ProfileSyncSchema = z.object({
  adults: z.number().int().min(1).max(6),
  kids: z.number().int().min(0).max(8),
  onboarded: z.boolean(),
  seen: z.array(z.string().max(40)).max(60),
  updatedAt: ms,
});

export const HistorySyncSchema = z.object({
  id: z.string().min(1).max(60),
  receiptId: z.string().min(1).max(120),
  store: z.string().max(200),
  date: z.string().max(20),
  cubes: z.number().int().min(0).max(100000),
  score: z.number().int().min(0).max(100),
  swaps: z.array(z.number().int().min(0).max(500)).max(500),
  receipt: ReceiptSchema.nullable().optional(),
  updatedAt: ms,
  deleted: z.boolean().optional(),
});

export const ShopSyncSchema = z.object({
  name: z.string().min(1).max(200),
  instead: z.string().max(200),
  done: z.boolean(),
  updatedAt: ms,
  deleted: z.boolean().optional(),
});

export const StatsSyncSchema = z.object({
  barcodes: z.number().int().min(0),
  shopDone: z.number().int().min(0),
});

/** Всё поля необязательны: клиент шлёт только то, что у него есть (веб, например, не знает про список покупок). */
export const SyncRequestSchema = z.object({
  profile: ProfileSyncSchema.optional(),
  history: z.array(HistorySyncSchema).max(300).optional(),
  shop: z.array(ShopSyncSchema).max(300).optional(),
  stats: StatsSyncSchema.optional(),
});

export type ProfileSync = z.infer<typeof ProfileSyncSchema>;
export type HistorySync = z.infer<typeof HistorySyncSchema>;
export type ShopSync = z.infer<typeof ShopSyncSchema>;
export type StatsSync = z.infer<typeof StatsSyncSchema>;
export type SyncRequest = z.infer<typeof SyncRequestSchema>;

/** Ответ: полное состояние пользователя на сервере после слияния. */
export type SyncState = {
  profile: ProfileSync | null;
  history: HistorySync[];
  shop: ShopSync[];
  stats: StatsSync;
};

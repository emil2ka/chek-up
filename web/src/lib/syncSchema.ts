// Контракт синхронизации (JSON между сервером, вебом и Flutter-приложением).
// Зеркало на стороне Flutter — mobile/lib/core/store.dart. Меняешь здесь — меняй там.
//
// Клиент шлёт только изменившееся и номер последней виденной правки (since). Сервер отвечает изменениями после него
// и новым номером (cursor). Если семья сменилась или номера нет — full: true и полное состояние.
import { z } from 'zod';
import { isIso } from './calendar';
import { ReceiptSchema } from './schema';

const ms = z.number().int().nonnegative();
const idx = z.array(z.number().int().min(0).max(500)).max(500);

export const ProfileSyncSchema = z.object({
  onboarded: z.boolean(),
  seen: z.array(z.string().max(40)).max(60),
  lang: z.enum(['ru', 'kk']).optional(),
  updatedAt: ms,
});

export const FamilySyncSchema = z.object({
  name: z.string().max(60).optional(),
  adults: z.number().int().min(1).max(6),
  kids: z.number().int().min(0).max(8),
  goal: z.number().int().min(0).max(50),
  updatedAt: ms,
});

export const HistorySyncSchema = z.object({
  id: z.string().min(1).max(60),
  receiptId: z.string().min(1).max(120),
  store: z.string().max(200),
  date: z.string().max(20),
  cubes: z.number().int().min(0).max(100000),
  score: z.number().int().min(0).max(100),
  swaps: idx,
  off: idx.optional(),
  tag: z.enum(['', 'guests']).optional(),
  priv: z.boolean().optional(),
  /** автор — заполняет сервер, от клиента не принимается */
  by: z.string().max(60).optional(),
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

export const WeekSyncSchema = z.object({
  week: z.string().refine(isIso),
  state: z.enum(['closed', 'none', 'open']),
  updatedAt: ms,
});

export const StatsSyncSchema = z.object({
  barcodes: z.number().int().min(0),
  shopDone: z.number().int().min(0),
  /** личный рекорд стрика; считает сервер */
  bestWeeks: z.number().int().min(0).optional(),
});

/** Больше за один запрос не принимаем: длинный журнал клиент отправляет частями. */
export const PUSH_MAX = 200;

/** Все поля необязательны: клиент шлёт только то, что изменилось. */
export const SyncRequestSchema = z.object({
  since: z.number().int().nonnegative().optional(),
  familyId: z.string().max(60).optional(),
  profile: ProfileSyncSchema.optional(),
  family: FamilySyncSchema.optional(),
  history: z.array(HistorySyncSchema).max(PUSH_MAX).optional(),
  shop: z.array(ShopSyncSchema).max(PUSH_MAX).optional(),
  weeks: z.array(WeekSyncSchema).max(PUSH_MAX).optional(),
  stats: StatsSyncSchema.optional(),
});

export const RoleSchema = z.enum(['owner', 'adult', 'child']);
export const MemberSchema = z.object({ id: z.string(), name: z.string(), role: RoleSchema, me: z.boolean() });

const CellSchema = z.object({ week: z.string(), kind: z.enum(['full', 'outline', 'none', 'frozen', 'miss', 'now', 'late']), closed: z.boolean() });
export const StreakSchema = z.object({
  current: z.number().int(), best: z.number().int(), freezes: z.number().int(), total: z.number().int(),
  level: z.number().int(), next: z.number().int().nullable(), cells: z.array(CellSchema),
});

export const SyncStateSchema = z.object({
  cursor: z.number().int().nonnegative(),
  full: z.boolean(),
  me: z.object({ id: z.string(), name: z.string(), email: z.string(), role: RoleSchema }),
  family: FamilySyncSchema.extend({ id: z.string(), name: z.string(), members: z.array(MemberSchema) }),
  profile: ProfileSyncSchema.nullable(),
  history: z.array(HistorySyncSchema),
  shop: z.array(ShopSyncSchema),
  weeks: z.array(WeekSyncSchema),
  stats: StatsSyncSchema,
  streak: StreakSchema,
});

export type ProfileSync = z.infer<typeof ProfileSyncSchema>;
export type FamilySync = z.infer<typeof FamilySyncSchema>;
export type HistorySync = z.infer<typeof HistorySyncSchema>;
export type ShopSync = z.infer<typeof ShopSyncSchema>;
export type WeekSync = z.infer<typeof WeekSyncSchema>;
export type StatsSync = z.infer<typeof StatsSyncSchema>;
export type SyncRequest = z.infer<typeof SyncRequestSchema>;
export type SyncState = z.infer<typeof SyncStateSchema>;
export type Member = z.infer<typeof MemberSchema>;
export type RoleName = z.infer<typeof RoleSchema>;

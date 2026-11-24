// Схема чека на Zod: ей проверяется ответ распознавания (сервер и клиент).
import { z } from 'zod';
import type { Receipt } from './types';

export const SwapItemSchema = z.object({
  n: z.string().min(1),
  p: z.number().nonnegative(),
  s: z.number().nonnegative(),
  t: z.number().nonnegative().optional(),
  f: z.number().nonnegative().optional(),
  k: z.number().nonnegative().optional(),
  c: z.number().nonnegative().optional(),
  b: z.number().nonnegative().optional(),
});

export const ReceiptItemSchema = SwapItemSchema.extend({
  junk: z.union([z.literal(0), z.literal(1)]).optional(),
  swap: SwapItemSchema.optional(),
  x: z.enum(['alcohol', 'energy']).optional(),
  nf: z.literal(1).optional(),
  w: z.number().int().min(1).max(26).optional(),
  q: z.literal(1).optional(),
  src: z.enum(['ref', 'ai', 'user']).optional(),
  raw: z.string().max(160).optional(),
});

export const ReceiptSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  store: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  items: z.array(ReceiptItemSchema).min(1),
  approx: z.boolean().optional(),
  refund: z.boolean().optional(),
  fiscal: z.string().max(80).optional(),
  time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  sum: z.number().nonnegative().optional(),
  masked: z.boolean().optional(),
  via: z.enum(['photo', 'qr', 'manual']).optional(),
});

/** Ответ POST /api/scan */
export const ScanResponseSchema = z.object({
  receipt: ReceiptSchema,
  /** уведомление для пользователя (например, про демо-режим) или null */
  notice: z.string().nullable(),
  /** позиции без справочника: показатели для них клиент запросит отдельно (POST /api/scan/enrich) */
  pending: z.array(z.number().int().nonnegative()).default([]),
});
export type ScanResponse = z.infer<typeof ScanResponseSchema>;

/** Ответ POST /api/cart: что лежит в корзине до оплаты. Цен может не быть (p = 0). */
export const CartResponseSchema = z.object({
  cart: z.object({
    kind: z.enum(['basket', 'order']),
    store: z.string(),
    /** часть товаров не видна */
    hidden: z.boolean(),
    items: z.array(ReceiptItemSchema).min(1),
  }),
  notice: z.string().nullable(),
  pending: z.array(z.number().int().nonnegative()).default([]),
});
export type CartResponse = z.infer<typeof CartResponseSchema>;

/** Корзина, как она хранится на устройстве. */
const nums = z.array(z.number().int().nonnegative()).catch([]);
export const CartSchema = z.object({
  id: z.string().min(1), createdAt: z.number(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  kind: z.enum(['basket', 'order']), store: z.string().catch(''), hidden: z.boolean().catch(false),
  items: z.array(ReceiptItemSchema).min(1), out: nums, swaps: nums,
  doneAt: z.number().optional(), demo: z.literal(true).optional(),
  fact: z.object({
    entryId: z.string(), planned: z.number(), kept: z.number(), money: z.number(), slipped: z.array(z.string()),
    saved: z.object({ sugar: z.number(), salt: z.number(), fat: z.number(), kcal: z.number(), carbs: z.number(), protein: z.number() }),
  }).optional(),
});

// Схема и тип Receipt из types.ts должны совпадать.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const receiptMatches: Same<z.infer<typeof ReceiptSchema>, Receipt> = true;
void receiptMatches;

// Схема чека на Zod: ей проверяется ответ распознавания (сервер и клиент).
import { z } from 'zod';
import type { Receipt } from './types';

export const SwapItemSchema = z.object({
  n: z.string().min(1),
  p: z.number().nonnegative(),
  s: z.number().nonnegative(),
});

export const ReceiptItemSchema = SwapItemSchema.extend({
  junk: z.union([z.literal(0), z.literal(1)]).optional(),
  swap: SwapItemSchema.optional(),
});

export const ReceiptSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  store: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  items: z.array(ReceiptItemSchema).min(1),
  approx: z.boolean().optional(),
});

/** Ответ POST /api/scan */
export const ScanResponseSchema = z.object({
  receipt: ReceiptSchema,
  /** уведомление для пользователя (например, про демо-режим) или null */
  notice: z.string().nullable(),
});
export type ScanResponse = z.infer<typeof ScanResponseSchema>;

// Схема и тип Receipt из types.ts должны совпадать.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const receiptMatches: Same<z.infer<typeof ReceiptSchema>, Receipt> = true;
void receiptMatches;

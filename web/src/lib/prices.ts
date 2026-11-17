// Где дешевле: сервер сравнивает позиции чека с ценами других магазинов из чеков пользователей «Чек-апа».
import { z } from 'zod';
import { postAuthed, SyncError } from './sync';
import type { Receipt } from './types';

const OfferSchema = z.object({
  name: z.string(),
  category: z.string(),
  unit: z.enum(['л', 'кг']),
  yourPrice: z.number(),
  store: z.string(),
  bestPrice: z.number(),
  n: z.number(),
  saving: z.number(),
});
const ResultSchema = z.object({ offers: z.array(OfferSchema), total: z.number(), compared: z.number() });
export type Offer = z.infer<typeof OfferSchema>;
export type CompareResult = z.infer<typeof ResultSchema>;

export async function compareReceipt(receipt: Pick<Receipt, 'store' | 'items'>): Promise<CompareResult> {
  const raw = await postAuthed('/api/prices/compare', { store: receipt.store, items: receipt.items.map(i => ({ n: i.n, p: i.p })) });
  const parsed = ResultSchema.safeParse(raw);
  if (!parsed.success) throw new SyncError('bad_response', 'Ответ сервера не по схеме');
  return parsed.data;
}

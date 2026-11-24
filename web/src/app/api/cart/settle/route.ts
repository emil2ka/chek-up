// POST /api/cart/settle — сверить новый чек с корзинами устройства. Для мобильного приложения: у него нет справочника категорий.
// Ничего не хранит: корзины приходят в запросе, ответ — какая подошла и что получилось.
import { z } from 'zod';
import { matchCart } from '@/lib/cart';
import { CartSchema, ReceiptSchema } from '@/lib/schema';
import { fail, ok, rateLimiter, readJson, withAuth } from '@/server/http';

const limited = rateLimiter(30, 60_000);
const Body = z.object({ entryId: z.string().min(1).max(60), receipt: ReceiptSchema.extend({ items: ReceiptSchema.shape.items.max(120) }), carts: z.array(CartSchema.extend({ items: CartSchema.shape.items.max(120) })).min(1).max(5) });

export const POST = (request: Request) => withAuth(request, 'cart.settle', async ({ me }) => {
  const body = await readJson(request, Body, 200_000);
  if (!body.ok) return body.res;
  if (limited(me.userId)) return fail(429, 'rate_limit', 'Слишком часто. Подожди немного');
  for (const c of body.data.carts) {
    const fact = matchCart(c, body.data.receipt, body.data.entryId);
    if (fact) return ok({ cartId: c.id, fact });
  }
  return ok({ cartId: null, fact: null });
});

// Корзины на этом устройстве (localStorage). Только для клиентских компонентов. Новые сверху.
import { todayIso } from './calendar';
import { cartAnalysis, matchCart } from './cart';
import { createStore } from './persist';
import { CartSchema } from './schema';
import type { Cart, CartDraft, CartFact, Receipt } from './types';

const MAX = 30;
/** Корзина ждёт чека столько часов. */
const WAIT_MS = 36 * 3_600_000;

const NONE: Cart[] = [];
const store = createStore<Cart[]>('chekup.carts', raw => (Array.isArray(raw) ? raw.flatMap(c => { const p = CartSchema.safeParse(c); return p.success ? [p.data] : []; }) : NONE), NONE);

export const carts = {
  subscribe: store.subscribe,
  get: store.get,
  serverSnapshot: store.serverSnapshot,
  byId: (id: string): Cart | null => store.get().find(c => c.id === id) ?? null,
  add(d: CartDraft, o: { demo?: true } = {}): Cart {
    const c: Cart = { ...d, id: 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), createdAt: Date.now(), date: todayIso(), out: [], swaps: [], ...o };
    store.update(list => [c, ...list.filter(x => !(o.demo && x.demo))].slice(0, MAX));
    return c;
  },
  patch(id: string, change: Partial<Omit<Cart, 'id'>>): void { store.update(list => list.map(c => (c.id === id ? { ...c, ...change } : c))); },
  /** «Готово, на кассу» */
  finish(id: string): void { carts.patch(id, { doneAt: Date.now() }); },
  remove(id: string): void { store.update(list => list.filter(c => c.id !== id)); },
  clear: store.clear,
  /** Записан новый чек: если он про недавнюю корзину, запомнить, что получилось. */
  settle(receipt: Receipt, entryId: string): CartFact | null {
    for (const c of store.get()) {
      const fact = matchCart(c, receipt, entryId);
      if (fact) { carts.patch(c.id, { fact }); return fact; }
    }
    return null;
  },
};

/** Корзина, которая ждёт чека с кассы. */
export const waitingCart = (list: readonly Cart[], now = Date.now()): Cart | null =>
  list.find(c => !!c.doneAt && !c.fact && !c.demo && now - c.doneAt < WAIT_MS) ?? null;
export const factFor = (list: readonly Cart[], entryId: string): CartFact | null => list.find(c => c.fact?.entryId === entryId)?.fact ?? null;
export const cartCubes = (c: Cart): number => cartAnalysis(c).cubes;

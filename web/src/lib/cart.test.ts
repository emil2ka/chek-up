import { describe, expect, it } from 'vitest';
import { advise, cartAnalysis, cartMoney, decide, likeness, matchCart, moves, weekAdd } from './cart';
import { DEMO_CART } from './data';
import { buildCartItem, buildItem } from './scan/build';
import { parseCart } from './scan/parse';
import type { Cart, Receipt } from './types';

const cart = (o: Partial<Cart> = {}): Cart => ({ ...DEMO_CART, id: 'c1', createdAt: 0, date: '2026-11-24', out: [], swaps: [], ...o });
const names = (list: ReturnType<typeof moves>, c = cart()) => list.map(m => `${m.kind}:${c.items[m.i].n.split(',')[0]}`);
const receipt = (lines: string[], date = '2026-11-24'): Receipt => ({ id: 'r', title: 'Чек', store: 'Magnum', date, items: lines.map(n => buildItem({ name: n, qty: 1, price: 500 })) });

describe('советы по корзине', () => {
  it('вредное с хорошей заменой — заменить, без замены — убрать, обычную еду не трогаем', () => {
    expect(names(moves(cart().items))).toEqual(['swap:Кола', 'swap:Печенье сахарное', 'out:Шоколад молочный', 'out:Чипсы сметана']);
  });
  it('хватает двух-трёх решений, корзина становится заметно лучше', () => {
    const a = advise(cart());
    expect(a.tone).toBe('fix');
    expect(a.enough).toBeGreaterThanOrEqual(1);
    expect(a.enough).toBeLessThanOrEqual(3);
    expect(a.after.cubes).toBeLessThan(a.before.cubes / 2);
    expect(a.after.score).toBeGreaterThan(a.before.score);
    expect(a.metric).toBe('sugar');
  });
  it('хорошую корзину хвалим', () => {
    const a = advise(cart({ items: DEMO_CART.items.slice(4) }));
    expect(a.moves).toEqual([]);
    expect(a.tone).toBe('good');
  });
  it('без цен оценка не зависит от денег, а экономия не выдумывается', () => {
    const c = cart({ items: DEMO_CART.items.map(it => ({ ...it, p: 0, ...(it.swap ? { swap: { ...it.swap, p: 0 } } : {}) })), out: [2], swaps: [0] });
    expect(cartMoney(c)).toBeNull();
    expect(cartAnalysis(c, [], []).share).toBeCloseTo(4 / 9);
    expect(cartAnalysis(c).score).toBeGreaterThan(cartAnalysis(c, [], []).score);
  });
  it('с ценами считает разницу', () => { expect(cartMoney(cart({ out: [2], swaps: [0] }))).toBe(1390 + 560); });
  it('запас сахара не советует убрать и в неделю берёт долей', () => {
    const it_ = buildItem({ name: 'Сахар-песок 1 кг', qty: 1, price: 500 });
    const c = cart({ items: [it_, ...DEMO_CART.items.slice(4)] });
    expect(moves(c.items)).toEqual([]);
    expect(weekAdd(c, [], [], 'sugar')).toBeLessThan(it_.s);
  });
  it('четыре яблока — это не четыре килограмма', () => {
    const a = buildCartItem({ name: 'Яблоки', qty: 4, price: 0 });
    expect(a.n).toBe('Яблоки, 4 шт');
    expect(a.k!).toBeLessThan(600);
  });
  it('пиво советует убрать, хотя сахара в нём нет', () => {
    const b = buildItem({ name: 'Пиво светлое 0,5 л', qty: 2, price: 0 });
    expect(moves([b]).map(m => m.kind).length).toBe(1);
  });
});

describe('сверка с чеком', () => {
  const planned = () => { const c = cart(); return { ...c, ...decide(moves(c.items)), doneAt: 1 }; };
  it('похожие товары узнаёт, разные — нет', () => {
    expect(likeness('Кола, 2 л', 'Напиток Coca-Cola 2 л')).toBeGreaterThan(0.34);
    expect(likeness('Молоко 2,5%, 1 л', 'Шоколад молочный 90 г')).toBe(0);
    expect(likeness('Шоколад молочный, 180 г', 'Шоколад тёмный 85% 100 г')).toBe(0);
    expect(likeness('Яблоки, 1 кг', 'Огурцы 1 кг')).toBeLessThan(0.34);
  });
  it('всё получилось', () => {
    const f = matchCart(planned(), receipt(['Филе куриное 1 кг', 'Гречка 800 г', 'Молоко 2,5% 1 л', 'Яблоки 1 кг', 'Хлеб ржаной 400 г', 'Вода минеральная 2 л']), 'e1');
    expect(f).toMatchObject({ entryId: 'e1', planned: 4, kept: 4, slipped: [] });
    expect(f!.saved.sugar).toBe(212 + 115 + 99 + 2);
  });
  it('вместо минералки взял сладкую воду — её сахар вычитаем', () => {
    const f = matchCart(planned(), receipt(['Филе куриное 1 кг', 'Гречка 800 г', 'Молоко 2,5% 1 л', 'Яблоки 1 кг', 'Вода минеральная с лимоном 2 л']), 'e1')!;
    expect(f.kept).toBe(4);
    expect(f.saved.sugar).toBe(212 + 115 + 99 + 2 - 80);
  });
  it('сорвалось: купил шоколад', () => {
    const f = matchCart(planned(), receipt(['Филе куриное 1 кг', 'Гречка 800 г', 'Молоко 2,5% 1 л', 'Шоколад молочный 180 г']), 'e1');
    expect(f).toMatchObject({ planned: 4, kept: 3, slipped: ['Шоколад молочный, 180 г'] });
  });
  it('чужой чек, поздний чек, возврат и неподтверждённая корзина не подходят', () => {
    const same = ['Филе куриное 1 кг', 'Гречка 800 г', 'Молоко 2,5% 1 л', 'Яблоки 1 кг'];
    expect(matchCart(planned(), receipt(['Порошок стиральный', 'Рыба 1 кг']), 'e1')).toBeNull();
    expect(matchCart(planned(), receipt(same, '2026-11-27'), 'e1')).toBeNull();
    expect(matchCart(planned(), { ...receipt(same), refund: true }, 'e1')).toBeNull();
    expect(matchCart({ ...planned(), doneAt: undefined }, receipt(same), 'e1')).toBeNull();
  });
});

describe('ответ модели про корзину', () => {
  const ans = (o: object) => parseCart({ kind: 'basket', store: '', hidden: false, items: [], ...o });
  const code = (fn: () => unknown) => { try { fn(); return ''; } catch (e) { return (e as { code: string }).code; } };
  it('цены нет — ноль, повторы с разных кадров не складываются', () => {
    expect(ans({ items: [{ name: 'Молоко 1 л', qty: 2, price: 0, sure: true }, { name: 'молоко 1 л', qty: 1, price: 0, sure: true }, { name: 'Чипсы', qty: 1, price: -5, sure: false }] }).lines)
      .toEqual([{ name: 'Молоко 1 л', qty: 2, price: 0 }, { name: 'Чипсы', qty: 1, price: 0, unsure: true }]);
  });
  it('в заказе выкидывает доставку и сборы', () => {
    expect(ans({ kind: 'order', items: [{ name: 'Доставка', qty: 1, price: 900, sure: true }, { name: 'Кефир 1 л', qty: 1, price: 520, sure: true }] }).lines.map(l => l.name)).toEqual(['Кефир 1 л']);
  });
  it('цена за штуку или за всё — решает сумма заказа', () => {
    const items = [{ name: 'Кола 1,5 л', qty: 2, price: 690, sure: true }, { name: 'Хлеб', qty: 1, price: 300, sure: true }];
    expect(ans({ kind: 'order', total: 1680, items }).lines.map(l => l.price)).toEqual([1380, 300]);
    expect(ans({ kind: 'order', total: 990, items }).lines.map(l => l.price)).toEqual([690, 300]);
    expect(ans({ kind: 'order', items }).lines.map(l => l.price)).toEqual([690, 300]);
  });
  it('чек, не продукты и пустая корзина — понятные ошибки', () => {
    expect(code(() => ans({ kind: 'receipt' }))).toBe('is_receipt');
    expect(code(() => ans({ kind: 'other' }))).toBe('not_cart');
    expect(code(() => ans({}))).toBe('cart_empty');
  });
});

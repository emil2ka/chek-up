import { describe, expect, it } from 'vitest';
import { confirmedSwaps, findDuplicate, sameFood } from './plan';
import type { HistoryEntry, Receipt, ReceiptItem } from './types';

const cola: ReceiptItem = { n: 'Кола, 1 л', p: 620, s: 106, swap: { n: 'Минералка с лимоном, 1 л', p: 280, s: 0 } };
const yog: ReceiptItem = { n: 'Йогурт питьевой, 270 г', p: 480, s: 30, swap: { n: 'Кефир 1%, 900 мл', p: 420, s: 0 } };
const water: ReceiptItem = { n: 'Вода минеральная Tassay 1 л', p: 300, s: 0 };
const kefir: ReceiptItem = { n: 'Кефир Food Master 2,5% 900мл', p: 450, s: 0 };

let seq = 0;
const entry = (date: string, items: ReceiptItem[], extra: Partial<HistoryEntry> = {}, rec: Partial<Receipt> = {}): HistoryEntry => {
  const id = `e${++seq}`;
  return { id, receiptId: `r${seq}`, store: 'Magnum', date, cubes: 0, score: 0, swaps: [], savedAt: 0, ...extra, receipt: { id: `r${seq}`, title: '', store: 'Magnum', date, items, approx: true, ...rec } };
};
const of = (e: HistoryEntry) => e.receipt ?? null;

describe('sameFood', () => {
  it('узнаёт продукт с другим названием', () => {
    expect(sameFood('Минералка с лимоном, 1 л', 'Вода минеральная Tassay 1 л')).toBe(true);
    expect(sameFood('Кефир 1%, 900 мл', 'Кефир Food Master 2,5% 900мл')).toBe(true);
    expect(sameFood('Яблоки, 1 кг', 'Яблоко Апорт 1,2 кг')).toBe(true);
    expect(sameFood('Чай зелёный без сахара', 'Чай зеленый Пиала 100 г')).toBe(true);
  });
  it('не путает разные', () => {
    expect(sameFood('Кефир 1%', 'Йогурт питьевой')).toBe(false);
    expect(sameFood('Сырки глазированные', 'Сыр Голландский')).toBe(false);
    expect(sameFood('1 л', 'Кола')).toBe(false);
  });
});

describe('confirmedSwaps', () => {
  it('включённая замена сама по себе ничего не экономит', () => {
    expect(confirmedSwaps([entry('2026-11-16', [cola], { swaps: [0] })], of)).toEqual([]);
  });

  it('следующий чек подтверждает, разница — по фактической цене', () => {
    const plan = entry('2026-11-16', [cola], { swaps: [0] }), fact = entry('2026-11-20', [water]);
    const [c] = confirmedSwaps([fact, plan], of);
    expect(c).toMatchObject({ planId: plan.id, factId: fact.id, money: 320, from: 'Кола, 1 л' });
    expect(c.saved.sugar).toBe(106);
  });

  it('если купили и замену, и исходный товар — не подтверждено', () => {
    expect(confirmedSwaps([entry('2026-11-16', [cola], { swaps: [0] }), entry('2026-11-20', [water, cola])], of)).toEqual([]);
  });

  it('тот же день, возврат, «не для нас» и слишком поздно — не считаются', () => {
    const plan = entry('2026-11-01', [cola], { swaps: [0] });
    expect(confirmedSwaps([plan, entry('2026-11-01', [water])], of)).toEqual([]);
    expect(confirmedSwaps([plan, entry('2026-11-05', [water], {}, { refund: true })], of)).toEqual([]);
    expect(confirmedSwaps([plan, entry('2026-11-05', [water], { off: [0] })], of)).toEqual([]);
    expect(confirmedSwaps([plan, entry('2027-01-05', [water])], of)).toEqual([]);
  });

  it('одна покупка подтверждает только один план, план — один раз', () => {
    const a = entry('2026-11-01', [cola], { swaps: [0] }), b = entry('2026-11-02', [cola], { swaps: [0] });
    expect(confirmedSwaps([a, b, entry('2026-11-05', [water])], of)).toHaveLength(1);
    expect(confirmedSwaps([a, entry('2026-11-05', [water]), entry('2026-11-09', [water])], of)).toHaveLength(1);
  });

  it('переплата тоже честная', () => {
    const c = confirmedSwaps([entry('2026-11-01', [yog], { swaps: [0] }), entry('2026-11-05', [{ ...kefir, p: 600 }])], of);
    expect(c[0].money).toBe(-120);
  });
});

describe('findDuplicate', () => {
  const base = entry('2026-11-16', [cola, yog, kefir]);
  const again = (rec: Partial<Receipt> = {}, items: ReceiptItem[] = [cola, yog, kefir]): Receipt => ({ id: 'new', title: '', store: 'Magnum', date: '2026-11-16', items, approx: true, ...rec });

  it('второй скан прочитал названия чуть иначе — всё равно дубль', () => {
    const items = [{ ...cola, n: 'Напиток Coca-Cola 1л' }, { ...yog, n: 'Йогурт Питьев.' }, kefir];
    expect(findDuplicate(again({ store: 'ТОО Magnum Cash&Carry' }, items), [base], of)?.id).toBe(base.id);
  });
  it('другой день, сумма, магазин или время — не дубль', () => {
    expect(findDuplicate(again({ date: '2026-11-17' }), [base], of)).toBeNull();
    expect(findDuplicate(again({ store: 'Small' }), [base], of)).toBeNull();
    expect(findDuplicate(again({}, [cola, yog]), [base], of)).toBeNull();
    const timed = entry('2026-11-16', [cola, yog, kefir], {}, { time: '10:15' });
    expect(findDuplicate(again({ time: '19:40' }), [timed], of)).toBeNull();
  });
  it('фискальный ключ решает точно', () => {
    const f = entry('2026-11-16', [cola], {}, { fiscal: '1:2' });
    expect(findDuplicate(again({ fiscal: '1:2', date: '2026-11-20' }), [f], of)?.id).toBe(f.id);
    expect(findDuplicate(again({ fiscal: '1:3' }, [cola]), [f], of)).toBeNull();
  });
  it('возврат не считается дублем покупки, сам себя чек не находит', () => {
    expect(findDuplicate(again({ refund: true }), [base], of)).toBeNull();
    expect(findDuplicate(again(), [base], of, base.id)).toBeNull();
  });
});

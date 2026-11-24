import { describe, expect, it } from 'vitest';
import { analyze } from '../engine';
import { ReceiptSchema } from '../schema';
import { buildItem, buildReceipt } from './build';
import type { Estimate } from './parse';
import { amountFromName, findReference } from './reference';

const est = (o: Partial<Estimate> & { sugar: number }): Estimate => ({ salt: 0, fat: 0, kcal: 0, carbs: 0, protein: 0, flag: null, junk: false, swap: null, ...o });

describe('справочник', () => {
  it.each([
    ['Напиток Coca-Cola 1 л', 'soda'],
    ['НАП Б/А КОКА-КОЛА 1Л', 'soda'],
    ['Coca-Cola Zero 0,5 л', null],
    ['Сок яблочный Gracio 1 л', 'juice'],
    ['Шырын алма 1л', 'juice'],
    ['Молоко Простоквашино 3,2% 1 л', 'plain-dairy'],
    ['МОЛ ПРОСТ 3,2 1Л', 'plain-dairy'],
    ['Йогурт питьевой клубника 270 г', 'sweet-yogurt'],
    ['Йогурт натуральный 500 г', 'plain-dairy'],
    ['Шоколад тёмный 85% 100 г', 'dark-choc'],
    ['Шоколад молочный Казахстан 90 г', 'chocolate'],
    ['Балмұздақ пломбир', 'ice-cream'],
    ['Картофель 1 кг', 'veg'],
    ['Колбаса докторская 400 г', 'sausage'],
    ['Сосиски молочные', 'sausage'],
    ['Доширак с говядиной 90 г', 'noodles'],
    ['Пицца Пепперони замороженная', 'fastfood'],
    ['Майонез Провансаль 400 г', 'mayo'],
    ['Сыр Российский весовой', 'cheese'],
    ['Масло сливочное 82% 180 г', 'butter'],
    ['Масло подсолнечное 1 л', 'oil'],
    ['Сметана 20% 400 г', 'cream'],
    ['Пиво светлое 0,5 л', 'beer'],
    ['Вино красное сухое 0,75 л', 'wine'],
    ['Водка 0,5 л', 'spirits'],
    ['Виноград кишмиш 1 кг', 'veg'],
    ['Филе куриное охлаждённое', 'meat'],
    ['Лосось охлаждённый 400 г', 'fish'],
    ['Яйцо С1 10 шт', 'eggs'],
    ['Гречка ядрица 800 г', 'grains'],
    ['Миндаль 200 г', 'nuts'],
    ['Сельдь слабосолёная 300 г', 'salty-fish'],
    ['Сахар-песок 1 кг', 'sugar'],
    ['Вода Asem без газа 1,5 л', 'water'],
  ])('%s → %s', (name, key) => expect(findReference(name)?.key ?? null).toBe(key));
});

describe('объём из названия', () => {
  it.each([
    ['Кола 1Л', 1000],
    ['Сок 0,5 л', 500],
    ['Йогурт 270г', 270],
    ['Вода 6х0,5л', 3000],
    ['МОЛ ПРОСТ 3,2 1Л', 1000],
    ['Кефир 900 мл', 900],
    ['Сахар 2 кг', 2000],
    ['Хлеб ржаной', null],
  ])('%s → %s', (name, g) => expect(amountFromName(name)).toBe(g));
});

describe('buildItem', () => {
  it('справочник с объёмом побеждает «плавающую» оценку модели', () => {
    const it1 = buildItem({ name: 'Напиток Coca-Cola 1 л', qty: 1, price: 620 }, est({ sugar: 300 }));
    expect(it1.s).toBe(106);
    expect(it1.junk).toBe(1);
    expect(it1.swap).toMatchObject({ n: 'Минералка с лимоном, 1 л', s: 0 });
    expect(it1.swap!.p).toBeGreaterThan(0);
  });

  it('количество умножает сахар; название получает «, 2 шт»', () => {
    const it2 = buildItem({ name: 'Кола 0,5 л', qty: 2, price: 700 }, undefined);
    expect(it2.s).toBe(106);
    expect(it2.n).toBe('Кола 0,5 л, 2 шт');
  });

  it('ноль сахара в молоке, даже если модель ошиблась', () => {
    expect(buildItem({ name: 'Молоко 2,5% 1 л', qty: 1, price: 560 }, est({ sugar: 48 })).s).toBe(0);
  });

  it('неизвестный товар — оценка модели и её замена', () => {
    const it3 = buildItem({ name: 'Батончик протеиновый X', qty: 1, price: 900 }, est({ sugar: 12, junk: true, swap: { n: 'Орехи 50 г', p: 600, s: 0, t: 0, f: 3, k: 300, c: 0, b: 0 } }));
    expect(it3).toMatchObject({ s: 12, junk: 1, swap: { n: 'Орехи 50 г', p: 600, s: 0 } });
  });

  it('замена, где сахара не меньше, отбрасывается', () => {
    const it4 = buildItem({ name: 'Батончик X', qty: 1, price: 900 }, est({ sugar: 12, junk: true, swap: { n: 'Конфеты', p: 500, s: 40, t: 0, f: 0, k: 200, c: 0, b: 0 } }));
    expect(it4.swap).toBeUndefined();
  });

  it('весовой товар: qty в кг', () => {
    expect(buildItem({ name: 'Карамель леденцовая', qty: 0.4, price: 900 }, undefined).s).toBe(240);
  });
});

describe('соль, жиры, калории, алкоголь', () => {
  it('известная категория считается по справочнику на 100 г', () => {
    const sausage = buildItem({ name: 'Колбаса докторская 400 г', qty: 1, price: 1480 }, undefined);
    expect(sausage).toMatchObject({ t: 8.8, f: 36, k: 1160, junk: 1 });
    const cola = buildItem({ name: 'Напиток Coca-Cola 1 л', qty: 1, price: 620 }, undefined);
    expect(cola).toMatchObject({ s: 106, f: 0, k: 420 });
  });

  it('количество и вес умножают соль и жиры', () => {
    const cheese = buildItem({ name: 'Сыр Российский', qty: 0.3, price: 2100 }, undefined);
    expect(cheese).toMatchObject({ t: 5.4, f: 51, k: 1020 });
    const eggs = buildItem({ name: 'Яйцо С1 10 шт', qty: 1, price: 800 }, undefined);
    expect(eggs.t).toBeGreaterThan(1);
  });

  it('оценка модели не перебивает справочник по соли и жирам', () => {
    const it = buildItem({ name: 'Колбаса докторская 400 г', qty: 1, price: 1480 }, est({ sugar: 0, salt: 0.1, fat: 0.5, kcal: 10 }));
    expect(it).toMatchObject({ t: 8.8, f: 36 });
  });

  it('неизвестный товар: показатели берутся из оценки модели', () => {
    const it = buildItem({ name: 'Закуска Х', qty: 1, price: 900 }, est({ sugar: 4, salt: 3.2, fat: 18, kcal: 700 }));
    expect(it).toMatchObject({ s: 4, t: 3.2, f: 18, k: 700 });
  });

  it('алкоголь и энергетики помечаются и считаются вредными', () => {
    const beer = buildItem({ name: 'Пиво светлое 0,5 л', qty: 2, price: 1300 }, undefined);
    expect(beer).toMatchObject({ x: 'alcohol', junk: 1, k: 430 });
    const energy = buildItem({ name: 'Энергетик Flash 0,45 л', qty: 1, price: 590 }, undefined);
    expect(energy).toMatchObject({ x: 'energy', junk: 1 });
    // модель тоже может пометить неизвестный напиток
    expect(buildItem({ name: 'Напиток ХХХ', qty: 1, price: 700 }, est({ sugar: 0, flag: 'alcohol' }))).toMatchObject({ x: 'alcohol', junk: 1 });
  });

  it('замена предлагается и для солёного, и для жирного, а не только для сладкого', () => {
    const sausage = buildItem({ name: 'Колбаса докторская 400 г', qty: 1, price: 1480 }, undefined);
    expect(sausage.swap).toMatchObject({ n: 'Грудка куриная отварная, 400 г' });
    expect(sausage.swap!.t).toBeLessThan(sausage.t! / 2);
    const noodles = buildItem({ name: 'Доширак 90 г', qty: 1, price: 350 }, undefined);
    expect(noodles.swap).toBeDefined();
  });

  it('замена, которая хуже по соли и жирам, отбрасывается', () => {
    const it = buildItem({ name: 'Закуска Х', qty: 1, price: 900 }, est({ sugar: 0, salt: 4, fat: 10, kcal: 400, junk: true, swap: { n: 'Колбаса', p: 800, s: 0, t: 9, f: 20, k: 600, c: 0, b: 0 } }));
    expect(it.swap).toBeUndefined();
  });

  it('углеводы и белки считаются по справочнику и включают сахар', () => {
    const cola = buildItem({ name: 'Напиток Coca-Cola 1 л', qty: 1, price: 620 }, undefined);
    expect(cola).toMatchObject({ s: 106, c: 106, b: 0 });
    const eggs = buildItem({ name: 'Яйцо С1 10 шт', qty: 1, price: 800 }, undefined);
    expect(eggs.b).toBeGreaterThan(60);
    const grechka = buildItem({ name: 'Гречка ядрица 800 г', qty: 1, price: 690 }, undefined);
    expect(grechka).toMatchObject({ c: 560, b: 80 });
    // неизвестный товар: оценка модели, углеводов не меньше сахара
    const x = buildItem({ name: 'Закуска Х', qty: 1, price: 900 }, est({ sugar: 20, carbs: 5, protein: 12 }));
    expect(x).toMatchObject({ c: 20, b: 12 });
    // замена колбасы несёт больше белка и меньше соли
    const sausage = buildItem({ name: 'Колбаса докторская 400 г', qty: 1, price: 1480 }, undefined);
    expect(sausage.swap).toMatchObject({ b: 112 });
  });

  it('чек проходит схему и содержит все показатели', () => {
    const r = buildReceipt({ store: 'Small', date: '2026-11-16', lines: [{ name: 'Пиво светлое 0,5 л', qty: 1, price: 650 }, { name: 'Сыр Российский', qty: 0.3, price: 2100 }] }, new Map());
    expect(ReceiptSchema.safeParse(r).success).toBe(true);
    const a = analyze(r);
    expect(a.flagged).toMatchObject({ count: 1, alcohol: 650 });
    expect(a.totals.fat).toBeGreaterThan(50);
  });
});

describe('buildReceipt', () => {
  const x = {
    store: 'Magnum',
    date: '2026-11-16',
    lines: [
      { name: 'Напиток Coca-Cola 1 л', qty: 1, price: 620 },
      { name: 'Хлеб ржаной', qty: 1, price: 320 },
    ],
  };

  it('собирает чек по схеме Receipt с пометкой approx', () => {
    const r = buildReceipt(x, new Map());
    expect(ReceiptSchema.safeParse(r).success).toBe(true);
    expect(r).toMatchObject({ store: 'Magnum', date: '2026-11-16', title: 'Чек из Magnum', approx: true });
    expect(r.id).toMatch(/^scan-/);
    expect(analyze(r).cubes).toBe(Math.round((106 + 12) / 5));
  });

  it('тот же чек → тот же id (повторный скан не плодит записи)', () => {
    expect(buildReceipt(x, new Map()).id).toBe(buildReceipt(structuredClone(x), new Map()).id);
  });

  it('без магазина и даты — «Мой чек» и сегодняшняя дата', () => {
    const r = buildReceipt({ ...x, store: '', date: '' }, new Map(), new Date('2026-11-16T09:00:00Z'));
    expect(r).toMatchObject({ title: 'Мой чек', store: 'Магазин', date: '2026-11-16' });
  });
});

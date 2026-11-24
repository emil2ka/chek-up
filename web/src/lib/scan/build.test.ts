import { describe, expect, it } from 'vitest';
import { analyze } from '../engine';
import { ReceiptSchema } from '../schema';
import { applyCorrection, buildItem, buildReceipt as build, lineOf, needsModel, rawKey, storeKey } from './build';
import type { Extracted } from './parse';
import type { Estimate } from './parse';
import { amountFromName, findReference, isNonFood } from './reference';

const buildReceipt = (x: Partial<Extracted> & Pick<Extracted, 'lines'>, _e: unknown = null, today?: string) => build({ store: '', date: '', time: '', total: 0, refund: false, ...x }, undefined, { today });

const est = (o: Partial<Estimate> & { sugar: number }): Estimate => ({ salt: 0, fat: 0, kcal: 0, carbs: 0, protein: 0, name: '', food: true, flag: null, junk: false, swap: null, ...o });

describe('справочник', () => {
  it.each([
    ['Напиток Coca-Cola 1 л', 'soda'],
    ['НАП Б/А КОКА-КОЛА 1Л', 'soda'],
    ['Coca-Cola Zero 0,5 л', 'zero-drink'],
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
    const it3 = buildItem({ name: 'Закуска Орион X', qty: 1, price: 900 }, est({ sugar: 12, junk: true, swap: { n: 'Орехи 50 г', p: 600, s: 0, t: 0, f: 3, k: 300, c: 0, b: 0 } }));
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
    const r = buildReceipt({ ...x, store: '', date: '' }, null, '2026-11-16');
    expect(r).toMatchObject({ title: 'Мой чек', store: 'Магазин', date: '2026-11-16' });
  });
});

describe('не еда и запасы', () => {
  it.each(['Стиральный порошок Persil 3 кг', 'Пакет майка', 'Туалетная бумага 4 рулона', 'Шампунь 400 мл', 'Корм для кошек Whiskas', 'Гель для душа', 'Салфетки влажные', 'Подгузники Pampers 4', 'Фольга пищевая', 'Средство для мытья посуды Fairy', 'Зубная паста', 'Соль для посудомоечных машин'])('%s — не еда', n => {
    expect(isNonFood(n)).toBe(true);
    expect(buildItem({ name: n, qty: 1, price: 900 })).toMatchObject({ nf: 1, s: 0 });
  });
  it.each(['Чай в пакетиках 100 шт', 'Сухое молоко', 'Паста томатная', 'Крем-сыр', 'Мыльная опера', 'Шоколад Ариель', 'Каша в пакетиках'])('%s — не бытовая химия', n => {
    expect(isNonFood(n)).toBe(false);
  });
  it('сахар, мука, масло растягиваются по весу, хлеб и кола — нет', () => {
    expect(buildItem({ name: 'Сахар-песок 1 кг', qty: 1, price: 500 })).toMatchObject({ s: 1000, w: 8 });
    expect(buildItem({ name: 'Сахар-песок 5 кг', qty: 1, price: 2500 })).toMatchObject({ s: 5000, w: 26 });
    expect(buildItem({ name: 'Мука в/с 2 кг', qty: 1, price: 700 }).w).toBe(5);
    expect(buildItem({ name: 'Соль поваренная 1 кг', qty: 1, price: 120 })).toMatchObject({ t: 970, w: 24 });
    expect(buildItem({ name: 'Хлеб 400 г', qty: 1, price: 200 }).w).toBeUndefined();
    expect(buildItem({ name: 'Кола 1 л', qty: 1, price: 600 }).w).toBeUndefined();
  });
});

describe('расширенный справочник', () => {
  it.each([
    ['Кола Zero 1 л', 'zero-drink'], ['Напиток Coca-Cola без сахара 0,5 л', 'zero-drink'], ['Напиток Coca-Cola 1 л', 'soda'],
    ['Масса творожная с изюмом 180 г', 'curd-mass'], ['Сырок глазированный 45 г', 'glazed-curd'], ['Сыр плавленый Hochland', 'processed-cheese'], ['Курт 100 г', 'kurt'], ['Құрт үй', 'kurt'],
    ['Мёд натуральный 500 г', 'honey'], ['Торт Медовик 1 кг', 'cake'], ['Изюм 200 г', 'dried-fruit'], ['Шоколад молочный с изюмом 90 г', 'chocolate'], ['Чак-чак 300 г', 'chak-chak'],
    ['Хлопья овсяные 800 г', 'oats'], ['Печенье овсяное 300 г', 'cookies'], ['Каша быстрого приготовления Быстров', 'instant-porridge'], ['Паста томатная 270 г', 'tomato-paste'], ['Nutella 350 г', 'choc-paste'],
    ['Соль йодированная 1 кг', 'salt'], ['Огурцы солёные 500 г', 'pickles'], ['Мука пшеничная 2 кг', 'flour'], ['Рис Акмарал 800 г', 'rice'], ['Күріш 1 кг', 'rice'], ['Казы 500 г', 'qazy'],
    ['Котлеты куриные 400 г', 'nuggets'], ['Молоко 2,5% 1 л', 'plain-dairy'], ['Молоко овсяное 1 л', 'plant-milk'], ['Кофе 3 в 1 MacCoffee', 'coffee-3in1'], ['Салат Оливье 300 г', 'salad-ready'], ['Орбит мята', 'gum'],
  ])('%s → %s', (name, key) => expect(findReference(name)?.key).toBe(key));
  it('у всех категорий разумные числа и разные ключи', async () => {
    const { REFERENCE } = await import('./reference');
    expect(new Set(REFERENCE.map(r => r.key)).size).toBe(REFERENCE.length);
    expect(REFERENCE.length).toBeGreaterThan(95);
    for (const r of REFERENCE) {
      for (const v of [r.per100, r.salt100, r.fat100, r.carbs100, r.protein100]) expect(v, r.key).toBeGreaterThanOrEqual(0);
      expect(r.per100, r.key).toBeLessThanOrEqual(Math.max(r.carbs100, r.per100 ? r.carbs100 + 1 : 0) + 0.01);
      expect(r.kcal100, r.key).toBeLessThanOrEqual(905);
      expect(r.typical, r.key).toBeGreaterThan(0);
    }
  });
});

describe('количество в названии', () => {
  it('вес и штуки сохраняются и читаются обратно', () => {
    expect(buildItem({ name: 'Бананы', qty: 1.24, price: 900 }).n).toBe('Бананы, 1,24 кг');
    expect(buildItem({ name: 'Яблоки Апорт 1,240 кг', qty: 1.24, price: 806 }).n).toBe('Яблоки Апорт 1,240 кг');
    const two = buildItem({ name: 'Сырок глазированный 45 г', qty: 2, price: 440 });
    expect(two.n).toBe('Сырок глазированный 45 г, 2 шт');
    expect(lineOf(two)).toEqual({ name: 'Сырок глазированный 45 г', qty: 2, price: 440 });
    expect(buildItem(lineOf(two))).toEqual(two);
  });
  it('сомнительная строка помечена, неизвестной нужна модель', () => {
    expect(buildItem({ name: 'Кола 1 л', qty: 1, price: 600, unsure: true }).q).toBe(1);
    expect(needsModel(buildItem({ name: 'ORION XQ-17', qty: 1, price: 600 }))).toBe(true);
    expect(needsModel(buildItem({ name: 'Кола 1 л', qty: 1, price: 600 }))).toBe(false);
    expect(needsModel(buildItem({ name: 'Пакет майка', qty: 1, price: 30 }))).toBe(false);
  });
});

describe('исправления', () => {
  const read = buildItem({ name: 'НАП ГАЗ ТЕСТ', qty: 1, price: 500 });
  it('новое название пересчитывает показатели, цена остаётся', () => {
    const fixed = applyCorrection(read, { n: 'Кола 1 л' });
    expect(fixed).toMatchObject({ n: 'Кола 1 л', p: 500, s: 106, raw: 'НАП ГАЗ ТЕСТ', src: 'user' });
  });
  it('введённые числа важнее справочника, снимается пометка сомнения', () => {
    const x = applyCorrection({ ...read, q: 1 }, { n: 'Кола 1 л', s: 40 });
    expect(x.s).toBe(40);
    expect(x.q).toBeUndefined();
  });
  it('можно пометить не едой и вернуть обратно', () => {
    const nf = applyCorrection(read, { n: read.n, nf: 1 });
    expect(nf).toMatchObject({ nf: 1, s: 0 });
    expect(applyCorrection(nf, { n: 'Кола 1 л', s: 106 }).nf).toBeUndefined();
  });
  it('ключи магазина и строки не зависят от регистра, кавычек и формы собственности', () => {
    expect(storeKey('ТОО «MAGNUM Cash&Carry»')).toBe(storeKey('magnum cash carry'));
    expect(rawKey('МОЛ ПРОСТ 3,2%  1Л')).toBe(rawKey('мол прост 3 2 1л'));
  });
});

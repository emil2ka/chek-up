import { describe, expect, it } from 'vitest';
import { analyze } from '../engine';
import { ReceiptSchema } from '../schema';
import { buildItem, buildReceipt } from './build';
import type { Estimate } from './parse';
import { amountFromName, findReference } from './reference';

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
    ['Картофель 1 кг', 'staple'],
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
    const est: Estimate = { sugar: 300, junk: false, swap: null };
    const it1 = buildItem({ name: 'Напиток Coca-Cola 1 л', qty: 1, price: 620 }, est);
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
    expect(buildItem({ name: 'Молоко 2,5% 1 л', qty: 1, price: 560 }, { sugar: 48, junk: false, swap: null }).s).toBe(0);
  });

  it('неизвестный товар — оценка модели и её замена', () => {
    const it3 = buildItem({ name: 'Батончик протеиновый X', qty: 1, price: 900 }, { sugar: 12, junk: true, swap: { n: 'Орехи 50 г', p: 600, s: 0 } });
    expect(it3).toMatchObject({ s: 12, junk: 1, swap: { n: 'Орехи 50 г', p: 600, s: 0 } });
  });

  it('замена, где сахара не меньше, отбрасывается', () => {
    const it4 = buildItem({ name: 'Батончик X', qty: 1, price: 900 }, { sugar: 12, junk: true, swap: { n: 'Конфеты', p: 500, s: 40 } });
    expect(it4.swap).toBeUndefined();
  });

  it('весовой товар: qty в кг', () => {
    expect(buildItem({ name: 'Карамель леденцовая', qty: 0.4, price: 900 }, undefined).s).toBe(240);
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

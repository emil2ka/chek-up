import { describe, expect, it } from 'vitest';
import { ScanError } from './errors';
import { extractJson, normalizeDate, parseEnrichment, parseExtraction } from './parse';

const code = (fn: () => unknown) => {
  try { fn(); } catch (e) { return e instanceof ScanError ? e.code : 'other'; }
  return 'ok';
};

const good = {
  is_receipt: true,
  store: 'Magnum',
  date: '2026-11-16',
  items: [
    { name: 'Напиток Coca-Cola 1 л', qty: 1, price: 620 },
    { name: 'Молоко Простоквашино 3,2% 1 л', qty: 2, price: 1120 },
  ],
};

describe('parseExtraction: корректный ответ', () => {
  it('принимает объект', () => {
    const x = parseExtraction(good);
    expect(x.store).toBe('Magnum');
    expect(x.date).toBe('2026-11-16');
    expect(x.lines).toEqual([
      { name: 'Напиток Coca-Cola 1 л', qty: 1, price: 620 },
      { name: 'Молоко Простоквашино 3,2% 1 л', qty: 2, price: 1120 },
    ]);
  });

  it('принимает строку и JSON в ```-блоке с пояснением вокруг', () => {
    const raw = 'Вот результат:\n```json\n' + JSON.stringify(good) + '\n```\nГотово.';
    expect(parseExtraction(raw).lines).toHaveLength(2);
  });

  it('понимает числа строками: «1 250,00 ₸», «0,512»', () => {
    const x = parseExtraction({ ...good, items: [{ name: 'Сыр весовой', qty: '0,512', price: '1 250,00 ₸' }] });
    expect(x.lines[0]).toEqual({ name: 'Сыр весовой', qty: 0.512, price: 1250 });
  });

  it('выкидывает служебные строки, но не «Картофель»', () => {
    const x = parseExtraction({
      ...good,
      items: [
        { name: 'Картофель 1 кг', qty: 1, price: 300 },
        { name: 'ИТОГО', qty: 1, price: 920 },
        { name: 'Оплата картой', qty: 1, price: 920 },
        { name: 'НДС 12%', qty: 1, price: 98 },
      ],
    });
    expect(x.lines.map(l => l.name)).toEqual(['Картофель 1 кг']);
  });

  it('чинит странное количество и неверную дату', () => {
    const x = parseExtraction({ ...good, date: '31.02.2026', items: [{ name: 'Хлеб', qty: -3, price: 200 }] });
    expect(x.lines[0].qty).toBe(1);
    expect(x.date).toBe('');
  });
});

describe('parseExtraction: отрицательные и нулевые цены', () => {
  it('скидки и возвраты не считаются товарами', () => {
    const x = parseExtraction({
      ...good,
      items: [
        { name: 'Шоколад молочный 90 г', qty: 1, price: 750 },
        { name: 'Скидка по карте', qty: 1, price: -75 },
        { name: 'Пакет', qty: 1, price: 0 },
        { name: 'Возврат товара', qty: 1, price: -620 },
      ],
    });
    expect(x.lines).toEqual([{ name: 'Шоколад молочный 90 г', qty: 1, price: 750 }]);
  });

  it('если остались только отрицательные — это пустой чек', () => {
    expect(code(() => parseExtraction({ ...good, items: [{ name: 'Возврат', qty: 1, price: -620 }] }))).toBe('empty');
  });
});

describe('parseExtraction: пустой чек и не чек', () => {
  it('пустой список позиций → empty', () => {
    expect(code(() => parseExtraction({ ...good, items: [] }))).toBe('empty');
  });
  it('is_receipt=false → not_receipt', () => {
    expect(code(() => parseExtraction({ is_receipt: false, store: '', date: '', items: [] }))).toBe('not_receipt');
  });
});

describe('parseExtraction: мусор', () => {
  it.each([
    ['не JSON', 'Извините, я не могу прочитать изображение'],
    ['битый JSON', '{"is_receipt": true, "items": [ {"name": "Кола"'],
    ['null', null],
    ['число', 42],
    ['нет is_receipt', { items: [] }],
    ['items не массив, цены не числа', { is_receipt: true, items: [{ name: 'Кола', qty: 1, price: 'дорого' }] }],
  ])('%s → понятная ошибка, а не падение', (_, raw) => {
    expect(['unreadable', 'empty']).toContain(code(() => parseExtraction(raw)));
  });

  it('extractJson не пропускает текст без JSON', () => {
    expect(code(() => extractJson('просто текст'))).toBe('unreadable');
  });
});

describe('parseEnrichment', () => {
  it('берёт корректные оценки и замену', () => {
    const m = parseEnrichment({
      items: [
        { i: 0, sugar_g: 106, junk: true, swap_name: 'Минералка 1 л', swap_price: 280, swap_sugar_g: 0 },
        { i: 1, sugar_g: 0, junk: false, swap_name: '', swap_price: 0, swap_sugar_g: 0 },
      ],
    }, 2);
    expect(m.get(0)).toEqual({ sugar: 106, salt: 0, fat: 0, kcal: 0, carbs: 0, protein: 0, flag: null, junk: true, swap: { n: 'Минералка 1 л', p: 280, s: 0, t: 0, f: 0, k: 0, c: 0, b: 0 } });
    expect(m.get(1)?.swap).toBeNull();
  });

  it('пропускает чужие номера, дубли и отрицательный сахар', () => {
    const m = parseEnrichment({
      items: [
        { i: 5, sugar_g: 10, junk: true, swap_name: '', swap_price: 0, swap_sugar_g: 0 },
        { i: 0, sugar_g: -4, junk: true, swap_name: '', swap_price: 0, swap_sugar_g: 0 },
        { i: 1, sugar_g: 3, junk: false, swap_name: 'X', swap_price: -10, swap_sugar_g: 0 },
        { i: 1, sugar_g: 99, junk: true, swap_name: '', swap_price: 0, swap_sugar_g: 0 },
      ],
    }, 2);
    expect([...m.keys()]).toEqual([1]);
    expect(m.get(1)).toEqual({ sugar: 3, salt: 0, fat: 0, kcal: 0, carbs: 0, protein: 0, flag: null, junk: false, swap: null });
  });

  it('мусор → пустая карта (чек соберётся по справочнику)', () => {
    expect(parseEnrichment('ой', 3).size).toBe(0);
    expect(parseEnrichment({ items: 'нет' }, 3).size).toBe(0);
  });
});

describe('normalizeDate', () => {
  const now = new Date('2026-11-16T10:00:00Z');
  it.each([
    ['2026-11-16', '2026-11-16'],
    ['16.11.2026', '2026-11-16'],
    ['16.11.26 14:02', '2026-11-16'],
    ['', ''],
    ['2027-01-01', ''],
    ['1999-01-01', ''],
  ])('%s → %s', (s, want) => expect(normalizeDate(s, now)).toBe(want));

  it('соль, жиры, калории, алкоголь и показатели замены читаются; мусор в новых полях не валит чек', () => {
    const m = parseEnrichment({ items: [
      { i: 0, sugar_g: 0, salt_g: '9,2', sat_fat_g: 36, kcal: 1160, flag: '', junk: true, swap_name: 'Грудка 400 г', swap_price: 1700, swap_sugar_g: 0, swap_salt_g: 3.2, swap_sat_fat_g: 1.2, swap_kcal: 560 },
      { i: 1, sugar_g: 0, salt_g: -5, sat_fat_g: 'много', kcal: null, flag: 'alcohol', junk: true, swap_name: '', swap_price: 0, swap_sugar_g: 0 },
      { i: 2, sugar_g: 10, flag: 'что-то', junk: false, swap_name: '', swap_price: 0, swap_sugar_g: 0 },
    ] }, 3);
    expect(m.get(0)).toMatchObject({ salt: 9.2, fat: 36, kcal: 1160, flag: null, swap: { n: 'Грудка 400 г', t: 3.2, f: 1.2, k: 560 } });
    expect(m.get(1)).toMatchObject({ salt: 0, fat: 0, kcal: 0, flag: 'alcohol' });
    expect(m.get(2)).toMatchObject({ sugar: 10, flag: null });
  });
});

import { describe, expect, it } from 'vitest';
import { RECEIPTS } from './data';
import { METRICS, amountTxt, analyze, bigCap, bigNum, cubesOfValue, isCubeMetric, METRIC_IDS, money, num1, pl, CUBES, valueOf, verdict } from './engine';
import { ReceiptSchema } from './schema';
import type { Receipt } from './types';

const byId = (id: string) => RECEIPTS.find(r => r.id === id)!;
const allSwaps = (r: Receipt) => r.items.flatMap((x, i) => (x.swap ? [i] : []));

describe('показатели', () => {
  it('кубиками отображается только сахар', () => {
    expect(METRIC_IDS.filter(isCubeMetric)).toEqual(['sugar']);
    expect(bigNum(METRICS.fat.adult, 'fat')).toBe('20');
  });

  it('подписи под цифрой', () => {
    expect([bigCap(5, 'sugar'), bigCap(3, 'salt'), bigCap(22, 'fat'), bigCap(5, 'kcal'), bigCap(5, 'carbs'), bigCap(5, 'protein')]).toEqual(['кубик сахара', 'г соли', 'г насыщенных жиров', 'ккал', 'г углеводов', 'г белка']);
    expect([bigNum(10, 'sugar'), bigNum(0.5, 'salt'), bigNum(18, 'protein')]).toEqual(['2', '0,5', '18']);
  });

  it('количества с единицами', () => {
    expect([amountTxt(106, 'sugar'), amountTxt(0.5, 'salt'), amountTxt(2.34, 'salt'), amountTxt(460, 'kcal')]).toEqual(['106 г', '0,5 г', '2,3 г', '460 ккал']);
    expect(num1(4)).toBe('4');
  });

  it('у старых чеков без соли и жиров показатели равны нулю', () => {
    const old: Receipt = { id: 'old', title: '', store: '', date: '2026-01-01', items: [{ n: 'Кола, 1 л', p: 620, s: 106, junk: 1 }] };
    const a = analyze(old);
    expect(a.totals).toEqual({ sugar: 106, salt: 0, fat: 0, kcal: 0, carbs: 0, protein: 0 });
    expect(valueOf(old.items[0], 'salt')).toBe(0);
    expect(cubesOfValue(106, 'sugar')).toBe(21);
  });
});

describe('analyze на демо-чеках', () => {
  it('обычная неделя', () => {
    const a = analyze(byId('week'));
    expect(a.cubesBy).toEqual({ sugar: 73, salt: 41, fat: 50, kcal: 54, carbs: 136, protein: 91 });
    expect(a.totals).toMatchObject({ carbs: 1363, protein: 545 });
    expect(a.cubes).toBe(a.cubesBy.sugar);
    expect(a.sugar).toBe(a.totals.sugar);
    expect(a.flagged).toMatchObject({ count: 2, sum: 1240, alcohol: 650, energy: 590 });
    expect(a.score).toBe(51);
    expect(a.why.map(w => w.k)).toEqual(['junk', 'sugar', 'flagged', 'fat']);
    expect(verdict(a.score).label).toBe('Так себе');
  });

  it('вечеринка — корзина-бомба, спортсмен — отлично', () => {
    expect(verdict(analyze(byId('party')).score).label).toBe('Корзина-бомба');
    expect(verdict(analyze(byId('fit')).score).label).toBe('Отлично');
  });

  it('замены снижают вред по всем показателям, кроме калорий там, где замена «сытнее»', () => {
    for (const r of RECEIPTS) {
      const before = analyze(r), after = analyze(r, allSwaps(r));
      expect(after.score).toBeGreaterThanOrEqual(before.score);
      for (const m of ['sugar', 'salt', 'fat'] as const) expect(after.totals[m]).toBeLessThanOrEqual(before.totals[m]);
    }
    const w = byId('week');
    // колбаса → куриная грудка: соли становится меньше
    const i = w.items.findIndex(x => x.n.startsWith('Колбаса'));
    expect(analyze(w, [i]).totals.salt).toBeLessThan(analyze(w).totals.salt - 5);
  });

  it('энергетик и пиво попадают в отдельную строку, замена её убирает', () => {
    const w = byId('week');
    const i = w.items.findIndex(x => x.x === 'energy');
    expect(analyze(w, [i]).flagged).toMatchObject({ count: 1, energy: 0, alcohol: 650 });
  });

  it('демо-чеки проходят схему сервера', () => {
    for (const r of RECEIPTS) expect(ReceiptSchema.safeParse(r).success).toBe(true);
  });
});

describe('оценка не зависит от размера корзины', () => {
  const times = (r: Receipt, n: number): Receipt => ({ ...r, items: Array.from({ length: n }, () => r.items).flat() });
  it('та же еда в три раза больше — тот же балл', () => {
    for (const r of RECEIPTS) expect(analyze(times(r, 3)).score).toBe(analyze(r).score);
  });
  it('запас входит недельной долей: мешок сахара впрок не делает корзину бомбой', () => {
    const food = byId('fit').items;
    const now: Receipt = { ...byId('fit'), items: [...food, { n: 'Сахар 1 кг', p: 500, s: 1000, k: 4000, c: 1000 }] };
    const stock: Receipt = { ...now, items: [...food, { n: 'Сахар 1 кг', p: 500, s: 1000, k: 4000, c: 1000, w: 8 }] };
    expect(analyze(stock).score).toBeGreaterThan(analyze(now).score + 10);
    expect(analyze(stock).totals.sugar).toBe(analyze(now).totals.sugar); // в самом чеке сахара столько же
  });
  it('не еда и «не для нас» в оценку не входят, деньги не-еды считаются', () => {
    const w = byId('week');
    const soap: Receipt = { ...w, items: [...w.items, { n: 'Порошок', p: 9000, s: 0, nf: 1 }] };
    expect(analyze(soap).score).toBe(analyze(w).score);
    expect(analyze(soap).total - analyze(w).total).toBe(9000);
    const off = analyze(w, [], w.items.map((_, i) => i));
    expect(off).toMatchObject({ total: 0, score: 100, offCount: w.items.length, cubes: 0 });
    expect(off.items.every(it => it.off)).toBe(true);
  });
  it('пустой и «водный» чек не ломают расчёт', () => {
    expect(analyze({ id: 'x', title: '', store: '', date: '2026-01-01', items: [{ n: 'Вода', p: 200, s: 0, k: 0 }] }).score).toBe(100);
    expect(analyze({ id: 'x', title: '', store: '', date: '2026-01-01', items: [{ n: 'Кола', p: 620, s: 106, k: 420, junk: 1 }] }).score).toBeLessThan(45);
  });
});

describe('форматирование', () => {
  it('склонения и деньги', () => {
    expect([pl(1, CUBES), pl(3, CUBES), pl(11, CUBES), pl(21, CUBES)]).toEqual(['кубик', 'кубика', 'кубиков', 'кубик']);
    expect(money(3490)).toBe('3\u00A0490\u00A0₸');
  });
});

import { describe, expect, it } from 'vitest';
import { RECEIPTS } from './data';
import { analyze } from './engine';
import { badges, weekStats } from './insights';
import { familyDaily, familyDailyCubes, familyDailyCubesOf, familyDailyG } from './profile';
import { CATALOG, searchCatalog } from './catalog';
import type { HistoryEntry } from './types';

const NOW = new Date(2026, 10, 16, 12); // 16 ноября 2026
const solo = { adults: 1, kids: 0 };

const entry = (receiptId: string, swaps: number[] = [], date?: string): HistoryEntry => {
  const r = RECEIPTS.find(x => x.id === receiptId)!;
  const a = analyze(r, swaps);
  return { id: `h-${receiptId}`, receiptId, store: r.store, date: date ?? r.date, cubes: a.cubes, score: a.score, swaps, savedAt: 0 };
};

describe('норма семьи', () => {
  it('складывает взрослых и детей', () => {
    expect(familyDailyG({ adults: 2, kids: 1 })).toBe(130);
    expect(familyDailyCubes({ adults: 2, kids: 1 })).toBe(26);
    expect(familyDailyCubes(solo)).toBe(10);
  });
});

describe('weekStats', () => {
  it('пустая история — нули и семь дней', () => {
    const w = weekStats([], solo, NOW);
    expect(w.days).toHaveLength(7);
    expect(w.days[6]).toMatchObject({ iso: '2026-11-16', today: true });
    expect(w.days[0].iso).toBe('2026-11-10');
    expect(w.cubes).toBe(0);
    expect(w.receipts).toHaveLength(0);
    expect(w.normCubes).toBe(70);
  });

  it('суммирует чеки недели и раскладывает по дням', () => {
    const w = weekStats([entry('week'), entry('party'), entry('fit')], solo, NOW);
    const sum = RECEIPTS.reduce((s, r) => s + analyze(r).sugar, 0);
    expect(w.sugar).toBe(sum);
    expect(w.cubes).toBe(Math.round(sum / 5));
    expect(w.receipts).toHaveLength(3);
    expect(w.days.find(d => d.iso === '2026-11-16')!.cubes).toBe(73);
    expect(w.days.find(d => d.iso === '2026-11-14')!.cubes).toBe(192);
    expect(w.ratio).toBeGreaterThan(1);
    expect(w.sources[0].grams).toBeGreaterThanOrEqual(w.sources[1].grams);
  });

  it('учитывает замены: меньше сахара и есть экономия', () => {
    const w = weekStats([entry('week', [1, 3, 11])], solo, NOW); // кола, сок, питьевой йогурт
    expect(w.cubes).toBe(26);
    expect(w.saved).toBe(540);
    expect(w.cubesSaved).toBe(47);
  });

  it('считает все четыре показателя: итог, кубики, норму и источники', () => {
    const w = weekStats([entry('week'), entry('fit')], solo, NOW);
    const a = analyze(RECEIPTS[0]), b = analyze(RECEIPTS[2]);
    for (const m of ['sugar', 'salt', 'fat', 'kcal'] as const) {
      expect(w.metrics[m].total).toBeCloseTo(a.totals[m] + b.totals[m], 1);
      expect(w.metrics[m].normCubes).toBe(70); // у каждого показателя норма взрослого — 10 кубиков в день
    }
    expect(w.metrics.salt.sources[0].name).toMatch(/Колбаса/);   // больше всего соли — в колбасе
    expect(w.metrics.fat.sources[0].name).toMatch(/Сыр|Яйцо|Колбаса|Молоко|Шоколад|Лосось/);
    expect(w.days.find(d => d.iso === '2026-11-16')!.by.salt).toBe(analyze(RECEIPTS[0]).cubesBy.salt);
    expect(w.flagged).toBe(1240);
  });

  it('замены меняют и соль: колбаса → куриная грудка', () => {
    const i = RECEIPTS[0].items.findIndex(x => x.n.startsWith('Колбаса'));
    const w0 = weekStats([entry('week')], solo, NOW), w1 = weekStats([entry('week', [i])], solo, NOW);
    expect(w1.metrics.salt.total).toBeLessThan(w0.metrics.salt.total - 5);
    expect(w1.metrics.salt.cubesSaved).toBeGreaterThan(10);
  });

  it('норма семьи у каждого показателя своя', () => {
    const fam = { adults: 2, kids: 1 };
    expect([familyDaily(fam, 'sugar'), familyDaily(fam, 'salt'), familyDaily(fam, 'fat'), familyDaily(fam, 'kcal')]).toEqual([130, 13, 56, 5500]);
    expect(familyDailyCubesOf(fam, 'salt')).toBe(26);
    expect(weekStats([], fam, NOW).metrics.kcal.normCubes).toBe(193); // 5500 ккал × 7 дней / 200
  });

  it('не берёт чеки старше семи дней и чеки из будущего', () => {
    const w = weekStats([entry('week', [], '2026-11-09'), entry('fit', [], '2026-11-17')], solo, NOW);
    expect(w.receipts).toHaveLength(0);
  });

  it('пропускает запись, для которой нет чека', () => {
    const broken: HistoryEntry = { id: 'x', receiptId: 'нет-такого', store: '?', date: '2026-11-16', cubes: 5, score: 50, swaps: [], savedAt: 0 };
    expect(weekStats([broken], solo, NOW).receipts).toHaveLength(0);
  });
});

describe('badges', () => {
  const get = (list: ReturnType<typeof badges>, id: string) => list.find(b => b.id === id)!;

  it('без чеков ничего не получено', () => {
    expect(badges([], solo, NOW).every(b => !b.done)).toBe(true);
  });

  it('первый чек, чистая корзина и корзина-бомба', () => {
    const list = badges([entry('party'), entry('fit')], solo, NOW);
    expect(get(list, 'first').done).toBe(true);
    expect(get(list, 'clean').done).toBe(true);
    expect(get(list, 'bomb').done).toBe(true);
    expect(get(list, 'swap').done).toBe(false);
    expect(get(list, 'three').progress).toEqual([2, 3]);
  });

  it('замены дают значки и прогресс', () => {
    const all = RECEIPTS.find(r => r.id === 'party')!.items.map((_, i) => i);
    const list = badges([entry('party', all)], solo, NOW);
    expect(get(list, 'swap').done).toBe(true);
    expect(get(list, 'minus50').done).toBe(true);
    expect(get(list, 'saver').done).toBe(true);
  });

  it('неделя в норме требует двух чеков', () => {
    const big = { adults: 6, kids: 8 };
    expect(get(badges([entry('fit')], big, NOW), 'norm').done).toBe(false);
    expect(get(badges([entry('fit'), entry('week')], big, NOW), 'norm').done).toBe(true);
    expect(get(badges([entry('fit'), entry('party')], solo, NOW), 'norm').done).toBe(false);
  });
});

describe('справочник продуктов', () => {
  it('у всех позиций уникальные id и неотрицательный сахар', () => {
    expect(new Set(CATALOG.map(c => c.id)).size).toBe(CATALOG.length);
    expect(CATALOG.every(c => c.g >= 0 && c.name && c.portion)).toBe(true);
  });

  it('ищет без учёта регистра и буквы ё, сортирует по сахару', () => {
    const cola = searchCatalog('КОЛА', 'all');
    expect(cola.length).toBeGreaterThanOrEqual(2);
    expect(cola[0].g).toBeGreaterThanOrEqual(cola[1].g);
    expect(searchCatalog('мед', 'all').some(c => c.id === 'honey')).toBe(true);
    expect(searchCatalog('', 'dairy').every(c => c.cat === 'dairy')).toBe(true);
    expect(searchCatalog('такогонет', 'all')).toHaveLength(0);
  });
});

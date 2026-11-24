import { describe, expect, it } from 'vitest';
import type { HistorySync } from '@/lib/syncSchema';
import { canSee, canWriteEntry, clampTime, maskReceipt, mergeProfile, mergeStats, newer, nextEntry, type StoredEntry } from './merge';

const inc = (x: Partial<HistorySync> = {}): HistorySync => ({ id: 'a', receiptId: 'r', store: '', date: '2026-11-16', cubes: 0, score: 0, swaps: [], updatedAt: 1000, ...x });
const stored = (x: Partial<StoredEntry> = {}): StoredEntry => ({ ...inc(), authorId: 'mum', ...x });

describe('время правок', () => {
  it('часы клиента, убежавшие вперёд, не дают вечной победы', () => {
    expect(clampTime(9_999_999, 1000)).toBe(61_000);
    expect(clampTime(500, 1000)).toBe(500);
  });
  it('равное время — остаётся серверная версия', () => {
    expect(newer(inc({ updatedAt: 5 }), inc({ updatedAt: 5 }))).toBe(false);
    expect(newer(inc({ updatedAt: 6 }), inc({ updatedAt: 5 }))).toBe(true);
    expect(newer(inc(), undefined)).toBe(true);
  });
});

describe('права на чек', () => {
  it('взрослый правит общее, чужое личное — нет', () => {
    expect(canWriteEntry('adult', 'dad', stored())).toBe(true);
    expect(canWriteEntry('owner', 'dad', stored({ priv: true }))).toBe(false);
    expect(canWriteEntry('adult', 'mum', stored({ priv: true }))).toBe(true);
  });
  it('ребёнок добавляет свои и правит только их', () => {
    expect(canWriteEntry('child', 'kid', undefined)).toBe(true);
    expect(canWriteEntry('child', 'kid', stored())).toBe(false);
    expect(canWriteEntry('child', 'kid', stored({ authorId: 'kid' }))).toBe(true);
  });
  it('автор не меняется, личным чек делает только автор', () => {
    expect(nextEntry(inc({ priv: true }), stored(), 'dad', 2000)).toMatchObject({ authorId: 'mum', priv: false });
    expect(nextEntry(inc({ priv: true }), stored(), 'mum', 2000)).toMatchObject({ authorId: 'mum', priv: true });
    expect(nextEntry(inc(), undefined, 'dad', 2000)).toMatchObject({ authorId: 'dad', priv: false });
  });
  it('личное видит только автор', () => {
    expect(canSee('dad', { priv: true, authorId: 'mum' })).toBe(false);
    expect(canSee('mum', { priv: true, authorId: 'mum' })).toBe(true);
    expect(canSee('dad', { authorId: 'mum' })).toBe(true);
  });
});

describe('чек глазами ребёнка', () => {
  it('без цен, суммы и алкоголя, номера позиций на месте', () => {
    const m = maskReceipt({ id: 'r', title: '', store: 'Magnum', date: '2026-11-16', sum: 1270, items: [
      { n: 'Кола', p: 620, s: 106, swap: { n: 'Вода', p: 280, s: 0 } }, { n: 'Пиво', p: 650, s: 0, x: 'alcohol', junk: 1 },
    ] });
    expect(m.masked).toBe(true);
    expect(m.sum).toBeUndefined();
    expect(m.items[0]).toMatchObject({ n: 'Кола', p: 0, s: 106, swap: { n: 'Вода', p: 0 } });
    expect(m.items[1]).toEqual({ n: 'Скрыто', p: 0, s: 0, nf: 1 });
    expect(JSON.stringify(m)).not.toMatch(/Пиво|620|650|1270/);
  });
});

describe('профиль и счётчики', () => {
  const p = (x: object = {}) => ({ onboarded: false, seen: ['a'], lang: 'ru' as const, updatedAt: 10, ...x });
  it('побеждает новый, достижения объединяются, знакомство не забывается', () => {
    expect(mergeProfile(p({ onboarded: true }), p({ seen: ['b'], lang: 'kk', updatedAt: 20 }))).toEqual({ onboarded: true, seen: ['a', 'b'], lang: 'kk', updatedAt: 20 });
    expect(mergeProfile(p(), p({ seen: ['b'], lang: 'kk', updatedAt: 5 }))).toMatchObject({ seen: ['a', 'b'], lang: 'ru', updatedAt: 10 });
    expect(mergeProfile(null, p())).toEqual(p());
    expect(mergeProfile(p(), undefined)).toEqual(p());
  });
  it('счётчики только растут', () => {
    expect(mergeStats({ barcodes: 5, shopDone: 1 }, { barcodes: 2, shopDone: 3 })).toEqual({ barcodes: 5, shopDone: 3 });
  });
});

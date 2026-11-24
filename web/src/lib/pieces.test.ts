import { describe, expect, it } from 'vitest';
import { METRIC_IDS } from './engine';
import { PIECES, PIECE_SHAPES, pieceVertices, SHAPE_OF } from './pieces';
import { saltGrainCount } from './saltGrains';

const cross = (v: { x: number; y: number }[], i: number) => {
  const p = v[i], n = v[(i + 1) % v.length], t = v[(i + 2) % v.length];
  return (n.x - p.x) * (t.y - n.y) - (n.y - p.y) * (t.x - n.x);
};

describe('фигурки', () => {
  it('у каждого показателя, кроме сахара, своя фигурка со своим выпуклым контуром', () => {
    expect(new Set(METRIC_IDS.filter(m => m !== 'sugar').map(m => SHAPE_OF[m as keyof typeof SHAPE_OF])).size).toBe(5);
    expect(new Set(PIECE_SHAPES.map(s => JSON.stringify(pieceVertices(s, 30)))).size).toBe(5);
    for (const s of PIECE_SHAPES) {
      const v = pieceVertices(s, 30);
      v.forEach((_, i) => expect(cross(v, i), s).toBeGreaterThan(0));
    }
  });
  it('контур столкновений не больше квадрата фигурки', () => {
    for (const s of PIECE_SHAPES) for (const [x, y] of PIECES[s].hull) { expect(Math.abs(x)).toBeLessThanOrEqual(.5); expect(Math.abs(y)).toBeLessThanOrEqual(.5); }
  });
  it('минимализм: не больше одной детали внутри', () => {
    for (const s of PIECE_SHAPES) expect([PIECES[s].inner, PIECES[s].line, PIECES[s].facets].filter(Boolean).length).toBeLessThanOrEqual(1);
  });
});

describe('крупинки соли', () => {
  it('небольшой вес видно, большой чек не перегружает', () => {
    expect([saltGrainCount(0), saltGrainCount(.01), saltGrainCount(1.1)]).toEqual([0, 1, 13]);
    expect(saltGrainCount(8)).toBeLessThan(saltGrainCount(20.3));
    expect(saltGrainCount(1e6)).toBe(248);
  });
});

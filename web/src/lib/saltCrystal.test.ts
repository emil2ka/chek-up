import { describe, expect, it } from 'vitest';
import { saltGrainCount, saltVertices } from './saltCrystal';

describe('крупинки соли', () => {
  it('показывает небольшой вес и ограничивает нагрузку больших чеков', () => {
    expect([saltGrainCount(0), saltGrainCount(.01), saltGrainCount(1.1)]).toEqual([0, 1, 13]);
    expect(saltGrainCount(8)).toBeLessThan(saltGrainCount(20.3));
    expect(saltGrainCount(20.3)).toBeLessThan(saltGrainCount(32));
    expect(saltGrainCount(1e6)).toBe(248);
  });

  it('использует разные выпуклые формы для спрайтов и коллизий', () => {
    const outlines = Array.from({ length: 4 }, (_, index) => saltVertices(index, 16));
    expect(new Set(outlines.map(outline => JSON.stringify(outline))).size).toBe(4);
    for (const vertices of outlines) {
      for (const [index, point] of vertices.entries()) {
        const next = vertices[(index + 1) % vertices.length];
        const tail = vertices[(index + 2) % vertices.length];
        const cross = (next.x - point.x) * (tail.y - next.y) - (next.y - point.y) * (tail.x - next.x);
        expect(cross).toBeGreaterThan(0);
      }
    }
  });
});

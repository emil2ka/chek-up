import { describe, expect, it } from 'vitest';
import { FOOD_MATERIALS, foodVertices, type FoodShape } from './foodPiece';

describe('формы для физики', () => {
  it('использует отдельный выпуклый контур для каждого материала', () => {
    const outlines = Object.keys(FOOD_MATERIALS).map(shape => foodVertices(shape as FoodShape, 30));
    expect(new Set(outlines.map(outline => JSON.stringify(outline))).size).toBe(outlines.length);
    for (const vertices of outlines) {
      for (const [index, point] of vertices.entries()) {
        const next = vertices[(index + 1) % vertices.length];
        const tail = vertices[(index + 2) % vertices.length];
        expect((next.x - point.x) * (tail.y - next.y) - (next.y - point.y) * (tail.x - next.x)).toBeGreaterThan(0);
      }
    }
  });

  it('масло тяжелее и меньше отскакивает, чем батон', () => {
    expect(FOOD_MATERIALS.butter.density).toBeGreaterThan(FOOD_MATERIALS.bread.density);
    expect(FOOD_MATERIALS.butter.restitution).toBeLessThan(FOOD_MATERIALS.bread.restitution);
    expect(FOOD_MATERIALS.egg.friction).toBeLessThan(FOOD_MATERIALS.butter.friction);
  });
});

// Куча на экране результата: размер кубика, раскладка по размеру героя, счётчик (перенос prototype/src/result-pile.js).
// Не строит разметку — получает готовые элементы; вызывается из эффекта Result.tsx.
import { SugarPile, type PilePalette } from '@/lib/pile';
import { cubeSize } from './model';

export type PileEls = {
  /** блок с синим фоном (его низ — пол кучи) */
  hero: HTMLElement;
  /** блок с цифрой (куча помещается под ним) */
  head: HTMLElement;
  /** белая карточка (берём радиус скругления) */
  sheet: HTMLElement;
  canvas: HTMLCanvasElement;
};
export type PileHandle = { set(n: number): void; destroy(): void };

export function attachPile({ hero, head, sheet, canvas }: PileEls, maxCubes: number, onCount: (n: number) => void, palette?: PilePalette | readonly PilePalette[]): PileHandle {
  const radius = parseFloat(getComputedStyle(sheet).borderTopLeftRadius) || 0;
  const pile = new SugarPile(canvas, { onCount, floorRadius: radius, palette });

  const relayout = () => {
    const W = hero.clientWidth, H = hero.clientHeight;
    if (!W || !H) return;
    const top = head.offsetTop + head.offsetHeight + 8;
    // холст чуть выше пола: кубики в скруглённых углах карточки не обрезаются
    const shape = palette && 'shape' in palette ? palette.shape : undefined;
    const fitted = cubeSize(W, H - top, maxCubes);
    const size = shape === 'salt' ? Math.max(10, Math.min(18, W * .045))
      : shape === 'bread' ? Math.min(56, fitted * 1.22) : fitted;
    pile.layout(W, H + radius, H, size);
  };
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(relayout) : null;
  ro?.observe(hero);
  ro?.observe(head);
  addEventListener('resize', relayout);
  relayout();

  return {
    set: n => pile.set(n),
    destroy() {
      ro?.disconnect();
      removeEventListener('resize', relayout);
      pile.destroy();
    },
  };
}

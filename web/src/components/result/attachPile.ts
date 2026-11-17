// Куча на экране результата: размер кубика, раскладка по размеру героя, счётчик (перенос prototype/src/result-pile.js).
// Не строит разметку — получает готовые элементы; вызывается из эффекта Result.tsx.
import { SugarPile } from '@/lib/pile';
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

export function attachPile({ hero, head, sheet, canvas }: PileEls, maxCubes: number, onCount: (n: number) => void): PileHandle {
  const radius = parseFloat(getComputedStyle(sheet).borderTopLeftRadius) || 0;
  const pile = new SugarPile(canvas, { onCount, floorRadius: radius });

  let lw = 0, lh = 0;
  const relayout = () => {
    const W = hero.clientWidth, H = hero.clientHeight;
    if (!W || !H || (Math.abs(W - lw) < 1 && Math.abs(H - lh) < 1)) return;
    lw = W; lh = H;
    const top = head.offsetTop + head.offsetHeight + 8;
    // холст чуть выше пола: кубики в скруглённых углах карточки не обрезаются
    pile.layout(W, H + radius, H, cubeSize(W, H - top, maxCubes));
  };
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(relayout) : null;
  ro?.observe(hero);
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

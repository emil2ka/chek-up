// Куча на экране результата: размер кубика, раскладка по размеру героя, счётчик.
// Не строит разметку — получает готовые элементы. В React это будет один useEffect с теми же шагами.
import { SugarPile } from './pile.js';
import { cubeSize } from './result-model.js';

/**
 * @param hero    блок с синим фоном (его низ — пол кучи)
 * @param head    блок с цифрой (куча помещается под ним)
 * @param sheet   белая карточка (берём радиус скругления)
 * @param canvas  холст кучи
 * @param maxCubes под какое количество подбирать размер кубика
 * @param onCount(n) на каждое появление и исчезновение кубика
 * @returns { set(n), destroy() }
 */
export function attachPile({ hero, head, sheet, canvas, maxCubes, onCount }) {
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
  const ro = 'ResizeObserver' in window ? new ResizeObserver(relayout) : null;
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

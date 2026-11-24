// Фигурки показателей — одна семья с кубиком сахара: простой силуэт, мягкий свет сверху-слева, максимум одна деталь.
//   соль — кристалл, жиры — капля, калории — огонёк, углеводы — зерно, белок — яйцо.
// Силуэты заданы в квадрате 100×100 с центром в нуле; ими же рисуются значки интерфейса (MetricIcon) и считаются столкновения.
// Зеркало на Dart — mobile/lib/ui/food_piece.dart.
import type { MetricId } from './types';

export type PieceShape = 'crystal' | 'drop' | 'flame' | 'grain' | 'egg';
export const PIECE_SHAPES: readonly PieceShape[] = ['crystal', 'drop', 'flame', 'grain', 'egg'];
export const SHAPE_OF: Record<Exclude<MetricId, 'sugar'>, PieceShape> = { salt: 'crystal', fat: 'drop', kcal: 'flame', carbs: 'grain', protein: 'egg' };

type Tone = readonly [light: string, mid: string, dark: string];
export type Piece = {
  body: string;
  colors: Tone;
  /** единственная деталь: вторая форма внутри или линия */
  inner?: { path: string; colors: Tone };
  line?: { path: string; color: string; width: number };
  /** грани кристалла: путь и прозрачность белого (меньше нуля — тень) */
  facets?: readonly (readonly [path: string, light: number])[];
  /** цвет тонкого контура и толщина светлой фаски */
  rim: string;
  edge?: number;
  /** выпуклый контур для столкновений, в долях стороны */
  hull: readonly (readonly [number, number])[];
  material: { friction: number; frictionStatic: number; frictionAir: number; restitution: number; density: number };
};

export const PIECES: Record<PieceShape, Piece> = {
  crystal: {
    body: 'M-4 -46Q0 -50 4 -46L25 -27Q29 -23 29 -17L29 15Q29 21 25 25L4 46Q0 50 -4 46L-25 25Q-29 21 -29 15L-29 -17Q-29 -23 -25 -27Z',
    colors: ['#FFF6F9', '#FFD3E0', '#EE8FAD'],
    facets: [
      ['M0 -50L-29 -22L-13 -14L0 -27Z', 0.75],
      ['M0 -50L29 -22L13 -14L0 -27Z', 0.34],
      ['M-29 -22L-29 20L-13 12L-13 -14Z', 0.42],
      ['M29 -22L29 20L13 12L13 -14Z', -0.16],
      ['M-29 20L0 50L0 25L-13 12Z', -0.06],
      ['M29 20L0 50L0 25L13 12Z', -0.3],
      ['M0 -27L13 -14L13 12L0 25L-13 12L-13 -14Z', 0.66],
    ],
    rim: 'rgba(168, 52, 96, .24)',
    edge: 5,
    hull: [[-.29, -.20], [0, -.48], [.29, -.20], [.29, .19], [0, .48], [-.29, .19]],
    material: { friction: .6, frictionStatic: .9, frictionAir: .015, restitution: .14, density: .0023 },
  },
  drop: {
    body: 'M0 -48C4 -48 6 -45 9 -40C18 -24 37 -8 37 14C37 34 21 48 0 48C-21 48 -37 34 -37 14C-37 -8 -18 -24 -9 -40C-6 -45 -4 -48 0 -48Z',
    colors: ['#FFF3B8', '#FFCE45', '#F39B0E'],
    rim: 'rgba(160, 86, 0, .26)',
    hull: [[-.36, .06], [-.25, -.18], [0, -.48], [.25, -.18], [.36, .06], [.33, .27], [.17, .44], [-.17, .44], [-.33, .27]],
    material: { friction: .45, frictionStatic: .7, frictionAir: .011, restitution: .12, density: .0026 },
  },
  flame: {
    body: 'M3 -47C5 -49 9 -47 10 -44C15 -28 38 -16 38 13C38 34 21 48 0 48C-21 48 -38 34 -38 12C-38 -2 -31 -12 -25 -20C-23 -23 -19 -22 -18 -19C-16 -14 -14 -11 -10 -9C-13 -23 -9 -37 3 -47Z',
    colors: ['#FFC58A', '#FF7F45', '#E8412A'],
    inner: { path: 'M2 -4C3 -6 6 -6 7 -4C10 6 21 11 21 25C21 38 12 46 0 46C-12 46 -21 38 -21 25C-21 16 -16 11 -12 6C-10 4 -8 5 -7 7C-6 9 -5 10 -3 11C-4 5 -2 0 2 -4Z', colors: ['#FFF4C7', '#FFDB73', '#FFB63B'] },
    rim: 'rgba(140, 24, 8, .24)',
    edge: 6,
    hull: [[-.37, .06], [-.24, -.21], [.05, -.48], [.30, -.16], [.38, .10], [.33, .29], [.17, .44], [-.17, .44], [-.33, .29]],
    material: { friction: .48, frictionStatic: .72, frictionAir: .012, restitution: .24, density: .0020 },
  },
  grain: {
    body: 'M0 -49C4 -49 8 -45 12 -40C24 -26 29 -8 27 12C25 34 13 48 0 49C-13 48 -25 34 -27 12C-29 -8 -24 -26 -12 -40C-8 -45 -4 -49 0 -49Z',
    colors: ['#FFEBC2', '#F3BE6E', '#C9812F'],
    line: { path: 'M0 -26C3 -10 3 12 0 32', color: 'rgba(140, 78, 18, .46)', width: 5.5 },
    rim: 'rgba(110, 58, 8, .26)',
    hull: [[-.27, .02], [-.18, -.30], [0, -.49], [.18, -.30], [.27, .02], [.21, .30], [0, .49], [-.21, .30]],
    material: { friction: .55, frictionStatic: .8, frictionAir: .010, restitution: .2, density: .0020 },
  },
  egg: {
    body: 'M0 -48C20 -48 37 -18 38 9C38 32 22 47 0 47C-22 47 -38 32 -38 9C-37 -18 -20 -48 0 -48Z',
    colors: ['#FFFFFF', '#FFFAF0', '#E3D4C3'],
    inner: { path: 'M0 -9A20 20 0 1 1 0 31A20 20 0 1 1 0 -9Z', colors: ['#FFE283', '#FFBE2E', '#F28E0B'] },
    rim: 'rgba(120, 82, 40, .22)',
    hull: [[-.36, .20], [-.35, -.06], [-.21, -.36], [0, -.48], [.21, -.36], [.35, -.06], [.36, .20], [.20, .42], [-.20, .42]],
    material: { friction: .24, frictionStatic: .42, frictionAir: .008, restitution: .26, density: .0030 },
  },
};

/** Крупинки соли чуть разного размера; остальные фигурки одинаковые. */
export const pieceScale = (shape: PieceShape, variant: number): number => (shape === 'crystal' ? [.86, 1.04, .94, 1.12][variant % 4] : 1);
export const pieceVertices = (shape: PieceShape, size: number, variant = 0) => {
  const s = size * pieceScale(shape, variant);
  return PIECES[shape].hull.map(([x, y]) => ({ x: x * s, y: y * s }));
};

/** Нарисовать фигурку с центром в нуле. Свет не крутится вместе с ней: блик всегда сверху-слева. */
export function drawPiece(ctx: CanvasRenderingContext2D, shape: PieceShape, size: number, variant = 0, angle = 0): void {
  const p = PIECES[shape], k = size * pieceScale(shape, variant) / 100;
  const body = new Path2D(p.body);
  // направление света в координатах повёрнутой фигурки
  const turn = (x: number, y: number) => [x * Math.cos(angle) + y * Math.sin(angle), -x * Math.sin(angle) + y * Math.cos(angle)] as const;
  const shade = (c: Tone, r: number, cx = 0, cy = 0) => {
    const [ax, ay] = turn(-r * .72, -r), [bx, by] = turn(r * .6, r);
    const g = ctx.createLinearGradient(cx + ax, cy + ay, cx + bx, cy + by);
    g.addColorStop(0, c[0]); g.addColorStop(.5, c[1]); g.addColorStop(1, c[2]);
    return g;
  };

  ctx.save();
  ctx.rotate(angle);
  ctx.scale(k, k);
  ctx.lineCap = ctx.lineJoin = 'round';

  // мягкая тень и плотная у самого края — как у кубика
  ctx.save();
  ctx.fillStyle = p.colors[2];
  ctx.shadowColor = 'rgba(4, 16, 105, .40)';
  ctx.shadowBlur = size * .30; ctx.shadowOffsetY = size * .15;
  ctx.fill(body);
  ctx.shadowColor = 'rgba(4, 16, 105, .26)';
  ctx.shadowBlur = size * .08; ctx.shadowOffsetY = size * .05;
  ctx.fill(body);
  ctx.restore();

  ctx.fillStyle = shade(p.colors, 46);
  ctx.fill(body);

  ctx.save();
  ctx.clip(body);
  for (const [path, light] of p.facets ?? []) {
    ctx.fillStyle = light > 0 ? `rgba(255,255,255,${light})` : `rgba(196,58,110,${-light})`;
    ctx.fill(new Path2D(path));
  }
  if (p.inner) {
    ctx.fillStyle = shade(p.inner.colors, 22, 0, shape === 'egg' ? 11 : 22);
    ctx.fill(new Path2D(p.inner.path));
  }
  if (p.line) {
    ctx.strokeStyle = p.line.color; ctx.lineWidth = p.line.width;
    ctx.stroke(new Path2D(p.line.path));
  }
  // фаска: светлый край сверху-слева, тень снизу-справа
  const [ex, ey] = turn(-40, -44), [fx, fy] = turn(40, 46);
  const edge = ctx.createLinearGradient(ex, ey, fx, fy);
  edge.addColorStop(0, 'rgba(255,255,255,.95)');
  edge.addColorStop(.42, 'rgba(255,255,255,.18)');
  edge.addColorStop(1, p.rim);
  ctx.strokeStyle = edge; ctx.lineWidth = p.edge ?? 10;
  ctx.stroke(body);
  // короткий блик
  if (shape !== 'crystal') {
    const [hx, hy] = turn(shape === 'grain' ? -11 : -17, shape === 'egg' ? -19 : -6);
    ctx.translate(hx, hy);
    ctx.rotate(-angle - .62);
    const hl = ctx.createRadialGradient(0, 0, 0, 0, 0, 15);
    hl.addColorStop(0, 'rgba(255,255,255,.92)'); hl.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = hl;
    ctx.scale(1, .42);
    ctx.beginPath(); ctx.arc(0, 0, 15, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();

  ctx.strokeStyle = p.rim; ctx.lineWidth = Math.max(1, 1 / k);
  ctx.stroke(body);
  ctx.restore();
}

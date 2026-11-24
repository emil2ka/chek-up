const OUTLINES = [
  [[-.50, -.09], [-.23, -.42], [.16, -.46], [.43, -.22], [.49, .11], [.21, .39], [-.19, .42], [-.46, .23]],
  [[-.52, .08], [-.34, -.30], [-.04, -.46], [.34, -.35], [.50, -.02], [.32, .24], [-.06, .40], [-.39, .33]],
  [[-.46, -.15], [-.13, -.44], [.18, -.39], [.50, -.13], [.42, .18], [.07, .45], [-.31, .32], [-.48, .07]],
  [[-.50, .00], [-.24, -.32], [.09, -.39], [.41, -.25], [.50, .05], [.31, .29], [-.04, .38], [-.40, .24]],
] as const;

const SCALE = [.85, 1.04, .92, 1.11] as const;
type Point = { x: number; y: number };

export function saltGrainCount(grams: number): number {
  if (!Number.isFinite(grams) || grams <= 0) return 0;
  const estimate = grams <= 14 ? grams * 12 : 168 + 74 * Math.log1p((grams - 14) / 9);
  return Math.min(248, Math.max(1, Math.round(estimate)));
}

export function saltVertices(variant: number, size: number): Point[] {
  const index = variant % OUTLINES.length;
  const scale = size * SCALE[index];
  return OUTLINES[index].map(([x, y]) => ({ x: x * scale, y: y * scale }));
}

export function drawSaltCrystal(ctx: CanvasRenderingContext2D, variant: number, size: number, angle: number) {
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const rotated = (x: number, y: number): Point => ({ x: x * cos - y * sin, y: x * sin + y * cos });
  const edge = saltVertices(variant, size).map(({ x, y }) => rotated(x, y));
  const ridge = rotated(size * .045, -size * .085);
  const table = edge.map(({ x, y }, index) => {
    const cut = index % 3 === 0 ? .47 : .63;
    return { x: ridge.x + x * cut, y: ridge.y + y * cut };
  });
  const trace = (points: Point[]) => {
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (const { x, y } of points.slice(1)) ctx.lineTo(x, y);
    ctx.closePath();
  };

  ctx.save();
  ctx.lineJoin = 'round';
  trace(edge);
  ctx.save();
  ctx.fillStyle = '#879ed5';
  ctx.shadowColor = 'rgba(8,21,76,.5)';
  ctx.shadowBlur = size * .28;
  ctx.shadowOffsetY = size * .16;
  ctx.fill();
  ctx.restore();

  const crystal = ctx.createLinearGradient(-size * .5, -size * .44, size * .39, size * .5);
  crystal.addColorStop(0, '#fcfeff');
  crystal.addColorStop(.42, '#cee4fb');
  crystal.addColorStop(.76, '#8faee1');
  crystal.addColorStop(1, '#6381bc');
  ctx.fillStyle = crystal;
  ctx.fill();

  for (let index = 0; index < edge.length; index++) {
    const next = (index + 1) % edge.length;
    const face = edge[index], end = edge[next];
    const dx = end.x - face.x, dy = end.y - face.y;
    const light = (dx - dy * .63) / Math.hypot(dx, dy);
    ctx.fillStyle = light > 0
      ? `rgba(255,255,255,${.12 + light * .45})`
      : `rgba(34,72,153,${.10 - light * .32})`;
    trace([face, end, table[next], table[index]]);
    ctx.fill();
  }

  const surface = ctx.createLinearGradient(-size * .27, -size * .26, size * .29, size * .29);
  surface.addColorStop(0, 'rgba(255,255,255,.91)');
  surface.addColorStop(.46, 'rgba(239,249,255,.72)');
  surface.addColorStop(.53, 'rgba(174,206,243,.45)');
  surface.addColorStop(1, 'rgba(220,236,255,.69)');
  trace(table);
  ctx.fillStyle = surface;
  ctx.fill();

  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(.35, size * .045);
  for (let index = 0; index < edge.length; index++) {
    const start = edge[index], end = edge[(index + 1) % edge.length];
    const shine = (end.x - start.x - (end.y - start.y) * .63) / Math.hypot(end.x - start.x, end.y - start.y);
    if (shine < .52) continue;
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.strokeStyle = `rgba(249,254,255,${shine * .78})`;
    ctx.stroke();
  }
  ctx.restore();
}

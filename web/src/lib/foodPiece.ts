export type FoodShape = 'butter' | 'bread' | 'egg' | 'ember';

export const FOOD_MATERIALS = {
  butter: { friction: .78, frictionStatic: .94, frictionAir: .012, restitution: .065, density: .0041 },
  bread: { friction: .57, frictionStatic: .79, frictionAir: .010, restitution: .24, density: .0019 },
  egg: { friction: .23, frictionStatic: .4, frictionAir: .008, restitution: .28, density: .0031 },
  ember: { friction: .49, frictionStatic: .74, frictionAir: .012, restitution: .24, density: .0022 },
} as const;

const HULLS = {
  butter: [[-.51, -.09], [-.29, -.33], [.51, -.22], [.52, .05], [.31, .28], [-.50, .15]],
  bread: [[-.52, .02], [-.39, -.21], [-.09, -.30], [.28, -.27], [.49, -.14], [.53, .05], [.38, .23], [-.29, .26]],
  egg: [[-.35, .24], [-.36, -.05], [-.22, -.33], [0, -.48], [.22, -.33], [.36, -.05], [.35, .24], [.21, .44], [-.21, .44]],
  ember: [[-.47, -.04], [-.32, -.31], [.02, -.43], [.33, -.29], [.47, -.03], [.39, .23], [.11, .39], [-.30, .31]],
} as const;

export const foodVertices = (shape: FoodShape, size: number) => HULLS[shape].map(([x, y]) => ({ x: x * size, y: y * size }));

const egg = 'M0 -48C19 -48 36 -17 37 9C38 32 22 47 0 47C-23 47 -39 31 -38 8C-37 -18 -18 -48 0 -48Z';
const butter = 'M-49 -11L-30 -30Q-27 -33 -23 -32L48 -22Q52 -21 52 -17L52 2Q52 5 49 8L33 25Q31 28 27 27L-47 15Q-51 14 -51 10L-51 -7Q-51 -10 -49 -11Z';
const butterTop = 'M-49 -11L-30 -30Q-27 -33 -23 -32L48 -22Q52 -21 51 -18L33 1Q31 4 27 3L-47 -8Q-50 -8 -49 -11Z';
const butterEnd = 'M32 2L51 -18Q52 -20 52 -17L52 2Q52 5 49 8L33 25Q31 28 27 27L28 5Z';
const butterEdge = 'M-46 -8L27 3Q31 4 33 1L49 -16';
const bread = 'M-50 -4C-47 -19 -28 -27 -8 -29C13 -31 37 -25 47 -13C55 -5 52 9 44 17C27 30 -3 31 -28 24C-43 20 -55 9 -50 -4Z';
const breadBase = 'M-51 0C-40 10 -22 15 -1 16C20 17 40 11 51 1C52 9 48 15 44 17C27 30 -3 31 -28 24C-42 21 -51 11 -51 0Z';
const breadScore = 'M-9 -13C-5 -18 4 -17 10 -11C11 -8 7 -8 4 -9C-1 -12 -5 -13 -9 -13Z';
const breadScoreRim = 'M-7 -12C-1 -12 4 -10 8 -9';
const coal = 'M-47 -4L-33 -31 -2 -43 31 -29 47 -4 37 25 11 39 -29 33Z';
const fault = 'M-31 24L-20 9 -6 7 -4 -4 6 -10 14 -24 29 -25M-4 -4L-17 -13 -18 -22M6 -10L19 -2 30 -2 39 8M11 34L11 19 3 16 -6 7';

export function drawFoodPiece(ctx: CanvasRenderingContext2D, shape: FoodShape, size: number, variant = 0, angle = 0) {
  ctx.save();
  ctx.scale(size / 100, size / 100);
  ctx.rotate(angle);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const lightX = -24 * Math.cos(angle) - 29 * Math.sin(angle);
  const lightY = 24 * Math.sin(angle) - 29 * Math.cos(angle);
  const gradient = (colors: readonly [string, string, string]) => {
    const shade = ctx.createRadialGradient(lightX * .55, lightY * .77, 1, 0, 3, 56);
    shade.addColorStop(0, colors[0]);
    shade.addColorStop(.57, colors[1]);
    shade.addColorStop(1, colors[2]);
    return shade;
  };
  const fill = (path: string, color: string | CanvasGradient) => {
    ctx.fillStyle = color; ctx.fill(new Path2D(path));
  };
  const stroke = (path: string, color: string, width: number) => {
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke(new Path2D(path));
  };
  const silhouette = { egg, butter, bread, ember: coal }[shape];
  ctx.save();
  ctx.shadowColor = 'rgba(8,18,65,.39)';
  ctx.shadowBlur = size * .18;
  ctx.shadowOffsetY = size * .115;
  fill(silhouette, '#27365d');
  ctx.restore();
  if (shape === 'egg') {
    const colors = variant % 3 === 1
      ? ['#fffaf0', '#e8c7ad', '#9d6e60']
      : variant % 3 === 2 ? ['#fffef6', '#eaded0', '#827983'] : ['#fff5df', '#e6b892', '#a16754'];
    fill(egg, gradient([colors[0], colors[1], colors[2]]));
    ctx.clip(new Path2D(egg));
    ctx.fillStyle = 'rgba(113,60,43,.26)';
    for (let index = 0; index < 15; index++) {
      const x = ((index * 61 + variant * 31) % 65) - 32;
      const y = ((index * 23 + variant * 17) % 74) - 35;
      ctx.beginPath(); ctx.arc(x, y, index % 5 === 0 ? 1.65 : .94, 0, Math.PI * 2); ctx.fill();
    }
  } else if (shape === 'butter') {
    fill(butter, gradient(['#fff3b4', '#f3d080', '#d69d4c']));
    fill(butterEnd, gradient(['#edc975', '#d7a754', '#b67d39']));
    fill(butterTop, gradient(['#fffbe0', '#ffecaa', '#f1d284']));
    stroke(butterEdge, 'rgba(255,252,224,.86)', 2.5);
  } else if (shape === 'bread') {
    fill(bread, gradient(['#edb969', '#cf8039', '#914622']));
    fill(breadBase, gradient(['#ca853f', '#a95d2b', '#743f25']));
    for (const offset of [-24, 0, 24]) {
      ctx.save();
      ctx.translate(offset, Math.abs(offset) * .095);
      ctx.rotate(.64);
      stroke(breadScore, '#a14e22', 4.6);
      fill(breadScore, '#ffe0a3');
      stroke(breadScoreRim, '#fff0c1', 2.4);
      ctx.restore();
    }
  } else {
    fill(coal, gradient(['#76645f', '#3d303a', '#1c1426']));
    fill('M-46-5L-33-31 -2-43 -10-22 -21-9Z', 'rgba(236,164,117,.16)');
    fill('M-8 18L7 -8 30 -10 38 24 11 39Z', 'rgba(13,10,26,.29)');
    ctx.save();
    ctx.globalAlpha *= .5;
    stroke(fault, '#883e2d', 7.5);
    ctx.restore();
    stroke(fault, variant % 2 ? '#e0783c' : '#c75a37', 2.1);
    stroke('M-5 6L-4-4 6-10 12-21M20-2L29-2', '#ffd983', 1.4);
  }
  ctx.restore();
}

// Куча кубиков сахара: matter-js + canvas 2D. Перенос prototype/src/pile.js с типами.
// Контракт (его менять нельзя, на нём держится главный экран):
//   new SugarPile(canvas, { onCount, floorRadius? }) — onCount(n) вызывается при появлении и исчезновении каждого кубика;
//                                       floorRadius — радиус скругления карточки, на которой лежит куча (необязательно):
//                                       кубики у краёв ложатся на скругление, а не висят в воздухе
//   layout(width, height, floorY, size) — размеры в CSS-пикселях; floorY — уровень пола; size — сторона кубика
//   add(n) / remove(n) / set(n)         — досыпать, убрать с анимацией, привести количество к n
//   count                               — к какому количеству придёт куча (без исчезающих, с ещё не высыпавшимися)
//   destroy()                           — остановить цикл и снять обработчики
// Только в браузере: создавать в эффекте клиентского компонента.
import Matter from 'matter-js';

const { Engine, Bodies, Body, Composite, Sleeping } = Matter;

export type SugarPileOptions = {
  onCount?: (n: number) => void;
  floorRadius?: number;
};

type Cube = Matter.Body & { v: number };
type Pop = { x: number; y: number; a: number; v: number; t: number; quiet: boolean };
type Spark = { x: number; y: number; vx: number; vy: number; t: number; life: number; s: number; star: boolean; rot: number };
type Down = { x: number; y: number; t: number };
type Grain = readonly [x: number, y: number, size: number, tone: number];

const STEP = 1000 / 60;          // фиксированный шаг физики
const ANG = 12;                  // сколько поворотов «запекаем» на четверть оборота (свет не крутится с кубиком)
const QUARTER = Math.PI / 2;
const Q = QUARTER / ANG;
const VARIANTS = 4;              // разных рисунков крупинок
const POUR_MS = 2400;            // за сколько высыпается вся порция
const POP_MS = 340;
const TAU = Math.PI * 2;

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
function seeded(seed: number): () => number {
  let s = seed % 2147483647 || 1;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

export class SugarPile {
  private readonly cv: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly onCount: (n: number) => void;
  private readonly floorRadius: number;

  private readonly eng: Matter.Engine;
  private readonly world: Matter.World;
  private cubes: Cube[] = [];     // тела в мире
  private walls: Matter.Body[] = [];
  private pops: Pop[] = [];       // лопающиеся кубики
  private sparks: Spark[] = [];   // искры и крупинки
  private queue = 0;              // ещё не высыпались
  private popQueue = 0;           // ждут, чтобы лопнуть
  private spawnEvery = 40;
  private spawnAcc = 0;
  private popEvery = 50;
  private popAcc = 0;
  private acc = 0;
  private quiet = 0;
  private raf = 0;
  private last = 0;
  private ready = false;
  private dead = false;
  private visible = true;
  private reduced: boolean;
  private asked = false;
  private down: Down | null = null;
  private bins: number[] | null = null;

  private w = 0;
  private h = 0;
  private floor = 0;
  private size = 0;
  private dpr = 1;
  private D = 0;
  private sprites: HTMLCanvasElement[][] | null = null;
  private spark: HTMLCanvasElement | null = null;

  private readonly mq: MediaQueryList;
  private readonly io: IntersectionObserver | null = null;

  constructor(canvas: HTMLCanvasElement, { onCount, floorRadius = 0 }: SugarPileOptions = {}) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('SugarPile: canvas 2D недоступен');
    this.cv = canvas;
    this.ctx = ctx;
    this.onCount = onCount ?? (() => {});
    this.floorRadius = floorRadius;

    this.eng = Engine.create({ enableSleeping: true });
    this.eng.gravity.y = 1.1;
    this.eng.positionIterations = 7;
    this.eng.velocityIterations = 5;
    this.world = this.eng.world;

    this.mq = matchMedia('(prefers-reduced-motion: reduce)');
    this.reduced = this.mq.matches;
    this.mq.addEventListener?.('change', this.onMq);

    document.addEventListener('visibilitychange', this.onVis);
    canvas.addEventListener('pointerdown', this.onDown);
    canvas.addEventListener('pointerup', this.onUp);
    canvas.addEventListener('pointercancel', this.onCancel);
    addEventListener('deviceorientation', this.onTilt);

    if ('IntersectionObserver' in window) {
      this.io = new IntersectionObserver(([en]) => {
        this.visible = en.isIntersecting;
        if (this.visible) this.draw();
      });
      this.io.observe(canvas);
    }
  }

  get count(): number { return this.cubes.length + this.queue - this.popQueue; }

  layout(width: number, height: number, floorY: number, size: number): void {
    if (this.dead) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const same = width === this.w && height === this.h && floorY === this.floor && size === this.size && dpr === this.dpr;
    if (same && this.ready) return;

    // переносим уже лежащие кубики в новую раскладку
    if (this.ready && this.cubes.length) {
      const k = size / this.size, kx = width / this.w;
      for (const b of this.cubes) {
        if (k !== 1) Body.scale(b, k, k);
        Body.setPosition(b, {
          x: clamp(b.position.x * kx, size * 0.6, width - size * 0.6),
          y: floorY - (this.floor - b.position.y) * k,
        });
      }
    }

    const bakeNeeded = size !== this.size || dpr !== this.dpr || !this.sprites;
    this.w = width; this.h = height; this.floor = floorY; this.size = size; this.dpr = dpr;
    this.cv.width = Math.round(width * dpr);
    this.cv.height = Math.round(height * dpr);
    this.cv.style.width = width + 'px';
    this.cv.style.height = height + 'px';
    if (bakeNeeded) this.bake();
    this.buildWalls();
    this.ready = true;
    this.wakeAll();
    if (this.reduced && this.queue) this.dropInstant();
    this.draw();
    this.kick();
  }

  add(n: number): void {
    n = Math.max(0, Math.round(n) || 0);
    if (!n || this.dead) return;
    const back = Math.min(n, this.popQueue); // сначала отменяем ещё не лопнувшие
    this.popQueue -= back; n -= back;
    if (!n) return;
    this.queue += n;
    this.spawnEvery = clamp(POUR_MS / this.queue, 6, 160);
    if (this.reduced && this.ready) { this.dropInstant(); this.draw(); return; }
    this.kick();
  }

  remove(n: number): void {
    n = Math.max(0, Math.round(n) || 0);
    if (!n || this.dead) return;
    const back = Math.min(n, this.queue); // сначала отменяем ещё не высыпавшиеся
    this.queue -= back; n -= back;
    n = Math.min(n, this.cubes.length - this.popQueue);
    if (n <= 0) return;
    this.popQueue += n;
    this.popEvery = clamp(900 / this.popQueue, 18, 95);
    if (this.reduced) {
      while (this.popQueue > 0) this.popOne(true);
      this.settle();
    }
    this.kick();
  }

  set(n: number): void {
    const d = Math.max(0, Math.round(n) || 0) - this.count;
    if (d > 0) this.add(d); else if (d < 0) this.remove(-d);
  }

  /** Подбросить кубики рядом с точкой (координаты холста, CSS-пиксели). */
  toss(x: number, y: number): void {
    if (this.reduced || !this.ready) return;
    const S = this.size, R = Math.max(96, S * 3.4);
    let hit = false;
    for (const b of this.cubes) {
      const dx = b.position.x - x, dy = b.position.y - y, d = Math.hypot(dx, dy) || 1;
      if (d > R) continue;
      const k = 1 - d / R;
      Sleeping.set(b, false);
      Body.setVelocity(b, { x: b.velocity.x + (dx / d) * 7.5 * k + rnd(-1, 1), y: b.velocity.y - (10 + S * 0.12) * k });
      Body.setAngularVelocity(b, rnd(-0.45, 0.45) * k);
      hit = true;
    }
    if (hit) { this.wakeAll(); this.kick(); }
  }

  destroy(): void {
    this.dead = true;
    cancelAnimationFrame(this.raf); this.raf = 0;
    document.removeEventListener('visibilitychange', this.onVis);
    removeEventListener('deviceorientation', this.onTilt);
    this.cv.removeEventListener('pointerdown', this.onDown);
    this.cv.removeEventListener('pointerup', this.onUp);
    this.cv.removeEventListener('pointercancel', this.onCancel);
    this.mq.removeEventListener?.('change', this.onMq);
    this.io?.disconnect();
    Composite.clear(this.world, false);
    Engine.clear(this.eng);
    this.cubes = []; this.pops = []; this.sparks = []; this.sprites = null;
  }

  // ——— обработчики ———

  private onMq = () => { this.reduced = this.mq.matches; };

  private onVis = () => {
    if (document.hidden) { cancelAnimationFrame(this.raf); this.raf = 0; }
    else { this.draw(); this.kick(); }
  };

  // тап: подбрасываем кубики рядом с пальцем (только если это тап, а не прокрутка)
  private onDown = (e: PointerEvent) => {
    this.down = { x: e.clientX, y: e.clientY, t: performance.now() };
    this.askTilt();
  };
  private onUp = (e: PointerEvent) => {
    const d = this.down; this.down = null;
    if (!d || performance.now() - d.t > 600 || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 12) return;
    const r = this.cv.getBoundingClientRect();
    this.toss(e.clientX - r.left, e.clientY - r.top);
  };
  private onCancel = () => { this.down = null; };

  // наклон телефона меняет гравитацию по горизонтали
  private onTilt = (e: DeviceOrientationEvent) => {
    if (this.reduced || e.gamma == null) return;
    const gx = clamp(e.gamma / 32, -0.95, 0.95);
    if (Math.abs(gx - this.eng.gravity.x) < 0.04) return;
    this.eng.gravity.x = gx;
    this.wakeAll();
    this.kick();
  };

  private askTilt() {
    // iOS спрашивает разрешение на датчики только по жесту пользователя
    type DOE = { requestPermission?: () => Promise<string> };
    const D = (window as unknown as { DeviceOrientationEvent?: DOE }).DeviceOrientationEvent;
    if (this.asked || !D || typeof D.requestPermission !== 'function') return;
    this.asked = true;
    try { D.requestPermission().catch(() => {}); } catch { /* отказ — молча */ }
  }

  // ——— мир ———

  private buildWalls() {
    if (this.walls.length) Composite.remove(this.world, this.walls);
    const { w, h, floor } = this;
    const R = clamp(this.floorRadius, 0, w / 4);
    const T = 200, opt = { isStatic: true, friction: 0.9, restitution: 0.1 };
    const tall = h * 8 + 2000;
    this.walls = [
      Bodies.rectangle(-T / 2, floor - tall / 2 + T, T, tall, opt),
      Bodies.rectangle(w + T / 2, floor - tall / 2 + T, T, tall, opt),
    ];
    if (R > 1) {
      // пол повторяет форму карточки: прямой верх и скруглённые углы
      this.walls.push(
        Bodies.rectangle(w / 2, floor + T / 2, w - 2 * R, T, opt),
        Bodies.circle(R, floor + R, R, opt, 24),
        Bodies.circle(w - R, floor + R, R, opt, 24),
        Bodies.rectangle(w / 2, floor + R + T / 2, w, T, opt),
      );
    } else {
      this.walls.push(Bodies.rectangle(w / 2, floor + T / 2, w + 2 * T, T, opt));
    }
    Composite.add(this.world, this.walls);
  }

  // Спрайты: на каждый рисунок крупинок и каждый шаг поворота — свой кадр.
  // Свет и тень заданы в мировых координатах, поэтому блик всегда сверху-слева, а тень всегда снизу.
  private bake() {
    const S = this.size, dpr = this.dpr;
    const D = Math.ceil(S * 2.6);
    const px = Math.ceil(D * dpr);
    const c = D / 2, h = S / 2, r = S * 0.2;
    this.D = D;
    const sprites: HTMLCanvasElement[][] = [];
    for (let v = 0; v < VARIANTS; v++) {
      const row: HTMLCanvasElement[] = [];
      const rand = seeded(7919 * (v + 3));
      const grains: Grain[] = [];
      const nG = Math.round(clamp(S * S / 12, 40, 260));
      for (let i = 0; i < nG; i++) {
        grains.push([(rand() - 0.5) * S * 0.94, (rand() - 0.5) * S * 0.94, (0.5 + rand()) * clamp(S / 36, 0.55, 1.3), rand()]);
      }
      const glints = Array.from({ length: 3 }, () => [(rand() - 0.5) * S * 0.7, (rand() - 0.5) * S * 0.7, 0.6 + rand() * 0.5] as const);

      for (let k = 0; k < ANG; k++) {
        const cv = document.createElement('canvas');
        cv.width = cv.height = px;
        const g = cv.getContext('2d');
        if (!g) continue;
        g.scale(dpr, dpr);
        const th = k * Q;
        const shape = (inset = 0) => {
          g.beginPath();
          g.save(); g.translate(c, c); g.rotate(th);
          const s = S - inset * 2;
          if (typeof g.roundRect === 'function') g.roundRect(-s / 2, -s / 2, s, s, Math.max(0, r - inset));
          else g.rect(-s / 2, -s / 2, s, s);
          g.restore();
        };

        // мягкая тень + плотная контактная тень
        g.save();
        shape();
        g.fillStyle = '#C9D4F5';
        g.shadowColor = 'rgba(4, 16, 105, .42)';
        g.shadowBlur = S * 0.34 * dpr; g.shadowOffsetY = S * 0.17 * dpr;
        g.fill();
        g.shadowColor = 'rgba(4, 16, 105, .28)';
        g.shadowBlur = S * 0.08 * dpr; g.shadowOffsetY = S * 0.05 * dpr;
        g.fill();
        g.restore();

        // тело кубика
        shape();
        const lg = g.createLinearGradient(c - h, c - h * 1.15, c + h * 0.9, c + h * 1.1);
        lg.addColorStop(0, '#FFFFFF');
        lg.addColorStop(0.5, '#F3F6FF');
        lg.addColorStop(1, '#C3CFF4');
        g.fillStyle = lg;
        g.fill();

        g.save();
        shape(); g.clip();
        // мягкое сияние сверху-слева
        const rg = g.createRadialGradient(c - h * 0.5, c - h * 0.6, 0, c - h * 0.5, c - h * 0.6, S * 0.8);
        rg.addColorStop(0, 'rgba(255,255,255,.95)');
        rg.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = rg;
        g.fillRect(c - S, c - S, S * 2, S * 2);
        // притенение снизу-справа
        const sh = g.createRadialGradient(c + h * 0.9, c + h * 1.0, 0, c + h * 0.9, c + h * 1.0, S * 0.9);
        sh.addColorStop(0, 'rgba(96, 120, 210, .32)');
        sh.addColorStop(1, 'rgba(96, 120, 210, 0)');
        g.fillStyle = sh;
        g.fillRect(c - S, c - S, S * 2, S * 2);

        // крупинки сахара в координатах грани
        g.translate(c, c); g.rotate(th);
        for (const [x, y, s, t] of grains) {
          g.fillStyle = t < 0.55 ? 'rgba(128, 150, 220, .30)' : t < 0.85 ? 'rgba(255, 255, 255, .95)' : 'rgba(150, 170, 235, .5)';
          g.fillRect(x, y, s, s);
        }
        // искорки-кристаллы
        for (const [x, y, a] of glints) {
          const l = S * 0.09 * a;
          g.fillStyle = 'rgba(255,255,255,.95)';
          g.fillRect(x - l, y - 0.4, l * 2, 0.8);
          g.fillRect(x - 0.4, y - l, 0.8, l * 2);
        }
        g.restore();

        // фаска: светлая сверху-слева, голубоватая снизу-справа
        g.save();
        shape(); g.clip();
        shape();
        g.lineWidth = Math.max(1.2, S * 0.13);
        const eg = g.createLinearGradient(c - h, c - h, c + h, c + h);
        eg.addColorStop(0, 'rgba(255,255,255,1)');
        eg.addColorStop(0.45, 'rgba(255,255,255,.35)');
        eg.addColorStop(1, 'rgba(105, 130, 215, .55)');
        g.strokeStyle = eg;
        g.stroke();
        g.restore();

        // блик-штрих
        g.save();
        shape(); g.clip();
        g.translate(c - h * 0.38, c - h * 0.62);
        g.rotate(-0.42);
        const hl = g.createLinearGradient(-S * 0.24, 0, S * 0.24, 0);
        hl.addColorStop(0, 'rgba(255,255,255,0)');
        hl.addColorStop(0.5, 'rgba(255,255,255,1)');
        hl.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = hl;
        g.beginPath(); g.ellipse(0, 0, S * 0.26, Math.max(0.8, S * 0.045), 0, 0, TAU); g.fill();
        g.restore();

        // тонкий контур, чтобы кубик читался и на белой карточке
        shape();
        g.lineWidth = 1;
        g.strokeStyle = 'rgba(40, 70, 190, .16)';
        g.stroke();

        row.push(cv);
      }
      sprites.push(row);
    }
    this.sprites = sprites;

    // искра
    const sp = document.createElement('canvas');
    const SP = 32;
    sp.width = sp.height = SP;
    const g = sp.getContext('2d');
    if (g) {
      const rg = g.createRadialGradient(16, 16, 0, 16, 16, 16);
      rg.addColorStop(0, 'rgba(255,255,255,1)');
      rg.addColorStop(0.25, 'rgba(225,235,255,.85)');
      rg.addColorStop(1, 'rgba(200,215,255,0)');
      g.fillStyle = rg; g.fillRect(0, 0, SP, SP);
      g.fillStyle = '#fff';
      g.beginPath();
      g.moveTo(16, 0); g.quadraticCurveTo(17.5, 14.5, 32, 16); g.quadraticCurveTo(17.5, 17.5, 16, 32);
      g.quadraticCurveTo(14.5, 17.5, 0, 16); g.quadraticCurveTo(14.5, 14.5, 16, 0);
      g.fill();
    }
    this.spark = sp;
  }

  // высота поверхности кучи по колонкам — сыплем туда, где пониже, с лёгким уклоном к центру
  private surface(): number[] {
    const S = this.size, n = Math.max(3, Math.floor(this.w / S));
    const bins = new Array<number>(n).fill(this.floor);
    for (const b of this.cubes) {
      const i = clamp(Math.floor(b.position.x / this.w * n), 0, n - 1);
      const top = b.position.y - S * 0.6;
      if (top < bins[i]) bins[i] = top;
    }
    return bins;
  }

  private pickX(bins: number[]): number {
    const S = this.size, W = this.w, n = bins.length;
    let best = 0, bestScore = -Infinity;
    for (let t = 0; t < 3; t++) {
      const x = t === 0
        ? W / 2 + (Math.random() + Math.random() - 1) * (W / 2 - S * 0.7)
        : rnd(S * 0.7, W - S * 0.7);
      const i = clamp(Math.floor(x / W * n), 0, n - 1);
      const score = bins[i] - Math.abs(x - W / 2) * 0.22 + rnd(0, S * 0.6);
      if (score > bestScore) { bestScore = score; best = x; }
    }
    return best;
  }

  private makeCube(x: number, y: number): Cube {
    const S = this.size;
    const b = Bodies.rectangle(x, y, S, S, {
      chamfer: { radius: S * 0.2, qualityMin: 2, qualityMax: 3 },
      friction: 0.5, frictionStatic: 0.85, frictionAir: 0.008,
      restitution: 0.18, density: 0.002, sleepThreshold: 45,
      angle: Math.random() * TAU,
    }) as Cube;
    b.v = (Math.random() * VARIANTS) | 0;
    Composite.add(this.world, b);
    this.cubes.push(b);
    return b;
  }

  private spawn(i: number) {
    const S = this.size;
    if (!this.bins) this.bins = this.surface();
    const x = this.pickX(this.bins);
    const b = this.makeCube(x, -S * (0.9 + i * 1.15) - rnd(0, S * 0.5));
    Body.setVelocity(b, { x: rnd(-1, 1), y: rnd(4, 7) });
    Body.setAngularVelocity(b, rnd(-0.22, 0.22));
    this.queue--;
    this.onCount(this.cubes.length);
  }

  // без анимации: кладём сразу и досчитываем физику, пока всё не уляжется
  private dropInstant() {
    const S = this.size;
    while (this.queue > 0) {
      const bins = this.surface();
      const x = this.pickX(bins);
      const i = clamp(Math.floor(x / this.w * bins.length), 0, bins.length - 1);
      this.makeCube(x, bins[i] - S * 0.6);
      this.queue--;
      this.onCount(this.cubes.length);
    }
    this.settle();
  }

  private settle() {
    for (let i = 0; i < 360; i++) {
      Engine.update(this.eng, STEP);
      if (i > 30 && this.cubes.every(b => b.isSleeping)) break;
    }
    for (const b of this.cubes) Sleeping.set(b, true);
  }

  private popOne(quiet: boolean) {
    let top: Cube | null = null;
    for (const b of this.cubes) if (!top || b.position.y < top.position.y) top = b;
    if (!top) { this.popQueue = 0; return; }
    this.popQueue--;
    this.cubes.splice(this.cubes.indexOf(top), 1);
    Composite.remove(this.world, top);
    this.wakeAll();
    const { x, y } = top.position, S = this.size;
    this.pops.push({ x, y, a: top.angle, v: top.v, t: 0, quiet });
    if (!quiet) {
      for (let i = 0; i < 9; i++) {
        const a = rnd(0, TAU), sp = rnd(1.6, 4.8) * (S / 32 + 0.4);
        this.sparks.push({
          x: x + Math.cos(a) * S * 0.3, y: y + Math.sin(a) * S * 0.3,
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - rnd(1, 2.5),
          t: 0, life: rnd(420, 720), s: rnd(0.22, 0.42) * S, star: i % 3 !== 2, rot: rnd(0, TAU),
        });
      }
    }
    this.onCount(this.cubes.length);
  }

  private wakeAll() {
    for (const b of this.cubes) if (b.isSleeping) Sleeping.set(b, false);
    this.quiet = 0;
  }

  private busy(): boolean {
    return this.queue > 0 || this.popQueue > 0 || this.pops.length > 0 || this.sparks.length > 0
      || this.cubes.some(b => !b.isSleeping);
  }

  private kick() {
    if (this.raf || this.dead || !this.ready || document.hidden) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  private frame = (now: number) => {
    this.raf = 0;
    if (this.dead || document.hidden) return;
    const dt = clamp(now - this.last, 0, 64);
    this.last = now;
    this.tick(dt);
    if (this.visible) this.draw();
    if (this.busy()) this.raf = requestAnimationFrame(this.frame);
  };

  private tick(dt: number) {
    // высыпаем по очереди
    if (this.queue > 0) {
      this.spawnAcc += dt;
      this.bins = null;
      let i = 0;
      while (this.queue > 0 && this.spawnAcc >= this.spawnEvery) {
        this.spawnAcc -= this.spawnEvery;
        this.spawn(i++);
      }
    } else this.spawnAcc = this.spawnEvery; // следующий кубик появится сразу

    // лопаем по очереди
    if (this.popQueue > 0) {
      this.popAcc += dt;
      while (this.popQueue > 0 && this.popAcc >= this.popEvery) {
        this.popAcc -= this.popEvery;
        this.popOne(false);
      }
    } else this.popAcc = this.popEvery;

    // физика фиксированным шагом
    this.acc += dt;
    let steps = 0;
    while (this.acc >= STEP && steps < 4) { Engine.update(this.eng, STEP); this.acc -= STEP; steps++; }
    if (steps === 4) this.acc = 0;

    // улетевшие за край возвращаем сверху
    const S = this.size;
    let maxV = 0;
    for (const b of this.cubes) {
      const p = b.position;
      if (p.y > this.floor + S * 3 || p.x < -S * 2 || p.x > this.w + S * 2) {
        Body.setPosition(b, { x: rnd(S, this.w - S), y: -S * 2 });
        Body.setVelocity(b, { x: 0, y: 4 });
      }
      if (!b.isSleeping) maxV = Math.max(maxV, b.speed, Math.abs(b.angularVelocity) * S);
    }
    // если всё почти замерло — усыпляем, чтобы остановить цикл
    if (this.queue === 0 && this.popQueue === 0) {
      this.quiet = maxV < 0.18 ? this.quiet + dt : 0;
      if (this.quiet > 650) for (const b of this.cubes) if (!b.isSleeping) Sleeping.set(b, true);
    }

    // эффекты
    for (const p of this.pops) p.t += dt;
    this.pops = this.pops.filter(p => p.t < (p.quiet ? 200 : POP_MS));
    const k = dt / STEP;
    for (const s of this.sparks) {
      s.t += dt; s.x += s.vx * k; s.y += s.vy * k; s.vy += 0.16 * k; s.vx *= 0.985; s.rot += 0.08 * k;
    }
    this.sparks = this.sparks.filter(s => s.t < s.life);
  }

  private cube(x: number, y: number, a: number, v: number, scale: number, alpha: number) {
    if (!this.sprites) return;
    const t = a / Q, ki = Math.round(t), r = a - ki * Q;
    const k = ((ki % ANG) + ANG) % ANG;
    const spr = this.sprites[v]?.[k];
    if (!spr) return;
    const d = this.dpr * scale, cs = Math.cos(r) * d, sn = Math.sin(r) * d;
    const ctx = this.ctx;
    ctx.globalAlpha = alpha;
    ctx.setTransform(cs, sn, -sn, cs, x * this.dpr, y * this.dpr);
    ctx.drawImage(spr, -this.D / 2, -this.D / 2, this.D, this.D);
  }

  private draw() {
    if (!this.ready || this.dead || !this.sprites) return;
    const ctx = this.ctx, dpr = this.dpr, S = this.size;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, this.cv.width, this.cv.height);

    // снизу вверх: верхние кубики отбрасывают тень на нижние
    const list = this.cubes.slice().sort((a, b) => b.position.y - a.position.y);
    for (const b of list) this.cube(b.position.x, b.position.y, b.angle, b.v, 1, 1);

    for (const p of this.pops) {
      const q = clamp(p.t / (p.quiet ? 200 : POP_MS), 0, 1);
      if (p.quiet) { this.cube(p.x, p.y, p.a, p.v, 1, 1 - q); continue; }
      const e = 1 - Math.pow(1 - q, 3);
      this.cube(p.x, p.y, p.a, p.v, 1 + 0.6 * e, Math.max(0, 1 - q * q * 1.1));
      // вспышка-кольцо
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalAlpha = (1 - q) * 0.85;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = Math.max(1, S * 0.14 * (1 - q));
      ctx.beginPath(); ctx.arc(p.x, p.y, S * (0.55 + 1.3 * e), 0, TAU); ctx.stroke();
    }

    for (const s of this.sparks) {
      const q = s.t / s.life;
      ctx.globalAlpha = (1 - q) * (1 - q);
      if (s.star && this.spark) {
        const z = s.s * (1 - q * 0.5) * dpr, cs = Math.cos(s.rot) * z / 32, sn = Math.sin(s.rot) * z / 32;
        ctx.setTransform(cs, sn, -sn, cs, s.x * dpr, s.y * dpr);
        ctx.drawImage(this.spark, -16, -16);
      } else {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.fillStyle = '#fff';
        const z = s.s * 0.35;
        ctx.fillRect(s.x - z / 2, s.y - z / 2, z, z);
      }
    }
    ctx.globalAlpha = 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
}

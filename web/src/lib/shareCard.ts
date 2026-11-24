// Карточка для «Поделиться»: картинка 1080×1920 в стиле «Гора сахара». Только для клиента.
import { bigCap, bigNum, isCubeMetric, METRIC_IDS, METRICS } from './engine';
import { t } from './i18n';
import { PALETTES, skinFor, type PilePalette } from './pile';
import { drawFoodPiece } from './foodPiece';
import { drawSaltCrystal, saltGrainCount } from './saltCrystal';
import type { MetricId, Tone } from './types';

export type ShareCardData = {
  /** какой показатель на большой цифре */
  metric: MetricId;
  /** кубиков по каждому показателю */
  cubesBy: Record<MetricId, number>;
  totals: Record<MetricId, number>;
  available: readonly MetricId[];
  /** «62 из 100 · неплохо», «5 недель подряд» */
  pill: string;
  tone: Tone;
  /** строка над цифрой */
  kick?: string;
  /** строка на белой карточке */
  question?: string;
  /** вид кубика по стрику */
  level?: number;
  /** «Magnum · 16 ноября» */
  where: string;
};

const W = 1080, H = 1920;
const TONE: Record<Tone, string> = { good: '#19B36B', mid: '#F2A20C', bad: '#F0433A' };
/** больше кубиков на картинке не рисуем */
const MAX_DRAWN = 150;

function seeded(seed: number) {
  let s = seed % 2147483647 || 1;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath();
  if (c.roundRect) c.roundRect(x, y, w, h, r);
  else c.rect(x, y, w, h);
}

function cube(c: CanvasRenderingContext2D, x: number, y: number, s: number, angle: number, rnd: () => number, pal: PilePalette) {
  c.save();
  c.translate(x, y);
  if (pal.shape === 'salt') {
    drawSaltCrystal(c, Math.floor(rnd() * 4), s, angle);
    c.restore();
    return;
  }
  c.rotate(angle);
  c.shadowColor = 'rgba(6, 16, 90, .38)';
  c.shadowBlur = s * 0.3;
  c.shadowOffsetY = s * 0.14;
  const g = c.createLinearGradient(-s / 2, -s / 2, s / 2, s / 2);
  g.addColorStop(0, pal.body[0]);
  g.addColorStop(1, pal.body[2]);
  c.fillStyle = g;
  if (pal.shape) {
    drawFoodPiece(c, pal.shape, s, Math.floor(rnd() * 4));
    c.restore();
    return;
  }
  roundRect(c, -s / 2, -s / 2, s, s, s * 0.17);
  c.fill();
  c.shadowColor = 'transparent';
  c.clip();
  c.fillStyle = `rgba(${pal.grainA}, .5)`;
  for (let i = 0; i < 6; i++) {
    const d = Math.max(2, s * 0.045);
    c.fillRect((rnd() - 0.5) * s * 0.7, (rnd() - 0.5) * s * 0.7, d, d);
  }
  c.strokeStyle = 'rgba(255, 255, 255, .95)';
  c.lineWidth = Math.max(2, s * 0.045);
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(-s * 0.28, -s * 0.37);
  c.lineTo(s * 0.18, -s * 0.37);
  c.stroke();
  c.restore();
}

/** Кубики рядами снизу вверх, с небольшим разбросом — как улёгшаяся куча. */
function pile(c: CanvasRenderingContext2D, count: number, floorY: number, top: number, pal: PilePalette) {
  const n = Math.min(count, MAX_DRAWN);
  if (!n) return;
  const rnd = seeded(count * 7919 + 13);
  const s = Math.max(44, Math.min(132, Math.sqrt(0.62 * W * (floorY - top) / n)));
  const perRow = Math.max(1, Math.floor((W + s * 0.3) / (s * 1.04)));
  const rows = Math.ceil(n / perRow);
  let left = n;
  // рисуем сверху вниз, чтобы нижние ряды перекрывали верхние тенью
  const layout: { x: number; y: number; a: number }[][] = [];
  for (let r = 0; r < rows; r++) {
    const k = Math.min(perRow - (r % 2), left);
    left -= k;
    const span = k * s * 1.04;
    const x0 = (W - span) / 2 + s * 0.52 + (r % 2 ? (rnd() - 0.5) * s * 0.3 : 0);
    layout.push(Array.from({ length: k }, (_, i) => ({
      x: x0 + i * s * 1.04 + (rnd() - 0.5) * s * 0.12,
      y: floorY - s * 0.5 - r * s * 0.93 + (rnd() - 0.5) * s * 0.1,
      a: (rnd() - 0.5) * (r === rows - 1 ? 0.9 : 0.34),
    })));
    if (left <= 0) break;
  }
  for (let r = layout.length - 1; r >= 0; r--) for (const p of layout[r]) cube(c, p.x, p.y, s, p.a, rnd, pal);
}

export async function renderShareCard(d: ShareCardData): Promise<Blob> {
  const css = getComputedStyle(document.documentElement);
  const FONT_D = css.getPropertyValue('--font-d').trim() || 'sans-serif', FONT_T = css.getPropertyValue('--font-t').trim() || 'sans-serif';
  // шрифты уже подключены в приложении — дожидаемся нужных начертаний
  await Promise.all([
    document.fonts.load(`900 400px ${FONT_D}`, '0чқ'),
    document.fonts.load(`500 60px ${FONT_D}`, 'чқ'),
    document.fonts.load(`700 44px ${FONT_T}`, 'чқ₸'),
  ]).catch(() => null);

  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const c = cv.getContext('2d');
  if (!c) throw new Error('canvas недоступен');

  // фон
  const bg = c.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#1238F5'); bg.addColorStop(0.55, '#3F6BFF'); bg.addColorStop(1, '#86A8FF');
  c.fillStyle = bg; c.fillRect(0, 0, W, H);
  const glow = c.createRadialGradient(W / 2, 640, 0, W / 2, 640, 720);
  glow.addColorStop(0, 'rgba(150, 185, 255, .5)'); glow.addColorStop(1, 'rgba(150, 185, 255, 0)');
  c.fillStyle = glow; c.fillRect(0, 0, W, H);

  c.textBaseline = 'alphabetic';
  // логотип
  c.fillStyle = '#fff';
  roundRect(c, 84, 96, 74, 74, 19); c.fill();
  c.fillStyle = '#86A8FF';
  for (const [x, y] of [[104, 116], [128, 122], [112, 140], [132, 144]]) c.fillRect(x, y, 8, 8);
  c.fillStyle = '#fff';
  c.font = `800 54px ${FONT_D}`;
  c.fillText('чек-ап', 182, 153);

  // плашка с оценкой
  const { pill } = d;
  c.font = `700 42px ${FONT_T}`;
  const pw = c.measureText(pill).width + 118;
  const px = (W - pw) / 2, py = 286;
  c.shadowColor = 'rgba(6, 18, 110, .3)'; c.shadowBlur = 40; c.shadowOffsetY = 14;
  c.fillStyle = 'rgba(255, 255, 255, .96)';
  roundRect(c, px, py, pw, 96, 48); c.fill();
  c.shadowColor = 'transparent';
  c.fillStyle = TONE[d.tone];
  c.beginPath(); c.arc(px + 50, py + 48, 15, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#0D1440';
  c.fillText(pill, px + 84, py + 63);

  // цифра
  c.textAlign = 'center';
  c.fillStyle = '#fff';
  c.font = `500 56px ${FONT_D}`;
  c.fillText(d.kick ?? t('В моём чеке'), W / 2, 510);
  const cubes = d.metric === 'salt' ? saltGrainCount(d.totals.salt) : d.cubesBy[d.metric];
  const available = d.available.includes(d.metric);
  const num = available ? bigNum(d.totals[d.metric], d.metric) : '—';
  let size = num.length >= 3 ? 400 : 480;
  c.font = `900 ${size}px ${FONT_D}`;
  while (c.measureText(num).width > W - 140 && size > 200) { size -= 20; c.font = `900 ${size}px ${FONT_D}`; }
  c.shadowColor = 'rgba(8, 22, 140, .35)'; c.shadowBlur = 80; c.shadowOffsetY = 26;
  c.fillText(num, W / 2, 530 + size * 0.78);
  c.shadowColor = 'transparent';
  c.font = `500 56px ${FONT_D}`;
  c.fillText(available ? bigCap(d.totals[d.metric], d.metric) : t('нет данных'), W / 2, 530 + size * 0.78 + 96);

  // куча и белая карточка
  const sheetTop = H - 330;
  pile(c, cubes, sheetTop + 6, 530 + size * 0.78 + 150, d.metric === 'sugar' ? skinFor(d.level ?? 0) : PALETTES[d.metric]);
  c.shadowColor = 'rgba(8, 20, 90, .35)'; c.shadowBlur = 70; c.shadowOffsetY = -18;
  c.fillStyle = '#fff';
  roundRect(c, 0, sheetTop, W, 420, 84); c.fill();
  c.shadowColor = 'transparent';
  c.fillStyle = '#0D1440';
  c.font = `800 50px ${FONT_D}`;
  c.fillText(d.question ?? t('А сколько в твоей корзине?'), W / 2, sheetTop + 104);
  // сводка по показателям
  const colW = (W - 120) / METRIC_IDS.length;
  METRIC_IDS.forEach((m, i) => {
    const cx = 60 + colW * (i + 0.5);
    c.fillStyle = METRICS[m].color;
    c.beginPath(); c.arc(cx, sheetTop + 140, 8, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#0D1440';
    c.font = `800 34px ${FONT_D}`;
    c.fillText(d.available.includes(m) ? bigNum(d.totals[m], m) : '—', cx, sheetTop + 192, colW - 10);
    c.fillStyle = '#6B76A8';
    c.font = `700 32px ${FONT_T}`;
    c.fillText(m === 'kcal' ? t('Ккал') : `${t(METRICS[m].short)} · ${isCubeMetric(m) ? t('куб.') : t(METRICS[m].unit)}`, cx, sheetTop + 232, colW - 10);
  });
  c.fillStyle = '#6B76A8';
  c.font = `700 36px ${FONT_T}`;
  c.fillText(d.where, W / 2, sheetTop + 296);

  return new Promise<Blob>((resolve, reject) =>
    cv.toBlob(b => (b ? resolve(b) : reject(new Error('не удалось собрать картинку'))), 'image/png'),
  );
}

/** Поделиться картинкой через системное меню; если нельзя — скачать её. Возвращает, что получилось. */
export async function shareCard(d: ShareCardData, text: string): Promise<'shared' | 'saved' | 'cancelled'> {
  const blob = await renderShareCard(d);
  const file = new File([blob], 'chek-up.png', { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] }) && navigator.share) {
    try {
      await navigator.share({ files: [file], title: t('Чек-ап'), text });
      return 'shared';
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return 'cancelled';
      // не получилось поделиться — ниже сохраняем файл
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'chek-up.png';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return 'saved';
}

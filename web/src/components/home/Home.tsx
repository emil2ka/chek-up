'use client';
// Главный экран: заголовок, кнопки, живые кубики внизу, шторка с примерами и «Мои чеки».
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { AnimatePresence } from 'motion/react';
import { SugarPile, PALETTES, skinFor } from '@/lib/pile';
import { t } from '@/lib/i18n';
import type { JobInfo } from '@/lib/outbox';
import type { Streak } from '@/lib/streak';
import type { HistoryEntry, Receipt } from '@/lib/types';
import { IconCamera, IconCube, IconEdit, IconImage, IconReceipt } from '@/components/icons';
import { StreakPill } from '@/components/streak/Streak';
import { DemoSheet } from './DemoSheet';
import { MyChecks } from './MyChecks';
import { OutboxCards } from './OutboxCards';

const HOME_CUBES = 9;

type Props = {
  /** гидратация закончилась — можно запускать canvas и показывать историю */
  ready: boolean;
  entries: HistoryEntry[];
  /** в журнале есть настоящие чеки */
  real: boolean;
  jobs: JobInfo[];
  streak: Streak;
  done: { now: number; usual: number };
  hideMoney: boolean;
  onScan(): void;
  onGallery(): void;
  /** внести руками; id — чек из очереди, который не прочитался */
  onManual(jobId?: string): void;
  onDemo(receipt: Receipt): void;
  onOpen(id: string): void;
  onWeek(): void;
};

export function Home({ ready, entries, real, jobs, streak, done, hideMoney, onScan, onGallery, onManual, onDemo, onOpen, onWeek }: Props) {
  const hasHistory = ready && entries.length > 0;
  const mine = ready && real;
  const heroRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const hintRef = useRef<HTMLParagraphElement>(null);
  const demoBtnRef = useRef<HTMLButtonElement>(null);
  const picked = useRef<Receipt | null>(null);
  const [sheet, setSheet] = useState(false);

  // ── Живой фон: кучка кубиков на полу первого экрана ──
  useEffect(() => {
    if (!ready) return;
    const hero = heroRef.current, canvas = canvasRef.current, stage = stageRef.current;
    if (!hero || !canvas || !stage) return;

    const floorRadius = hasHistory ? parseFloat(getComputedStyle(hero).getPropertyValue('--r-sheet')) || 0 : 0;
    let pile: SugarPile | null = null;
    try {
      pile = new SugarPile(canvas, {
        floorRadius,
        // кубики сахара и другие фигурки
        palette: [skinFor(streak.level), PALETTES.fat, PALETTES.carbs, PALETTES.protein],
        onCount: n => { if (hintRef.current) hintRef.current.hidden = !(n > 0); },
      });
    } catch (err) {
      console.warn('SugarPile не запустился', err);
    }

    let filled = false;
    const relayout = () => {
      const w = hero.clientWidth, h = hero.clientHeight;
      if (!w || !h || !pile) return;
      const floorY = stage.offsetTop + stage.offsetHeight;
      pile.layout(w, h, floorY, Math.round(Math.min(w, 430) / 7.2));
      if (!filled) { filled = true; pile.add(HOME_CUBES); }
    };
    const ro = new ResizeObserver(relayout);
    ro.observe(hero);
    relayout();

    return () => {
      ro.disconnect();
      try { pile?.destroy(); } catch { /* ничего */ }
    };
  }, [ready, hasHistory, streak.level]);

  const closeSheet = (r: Receipt | null = null) => {
    picked.current = r;
    setSheet(false);
  };

  return (
    <>
      <div
        ref={heroRef}
        className={`relative flex overflow-clip ${hasHistory ? 'min-h-[calc(100%-58px)]' : 'min-h-full'}`}
        style={{ '--cube': 'calc(min(100vw, 430px) / 7.2)' } as CSSProperties}
      >
        {/* мягкий свет за заголовком и светлое пятно пола */}
        <div aria-hidden className="pointer-events-none absolute -top-30 -right-35 size-105 rounded-full bg-[radial-gradient(closest-side,color-mix(in_srgb,var(--blue-3)_55%,transparent),transparent)]" />
        <div aria-hidden className="pointer-events-none absolute inset-x-[10%] -bottom-7.5 h-22.5 rounded-[50%] bg-[radial-gradient(closest-side,color-mix(in_srgb,var(--white)_45%,transparent),transparent)]" />

        <canvas ref={canvasRef} aria-hidden className="absolute inset-0 z-1 size-full touch-pan-y" />

        <div
          className={`pointer-events-none relative z-2 flex min-w-0 flex-1 flex-col px-5 pt-[calc(env(safe-area-inset-top)+10px)] [text-shadow:0_1px_10px_color-mix(in_srgb,var(--blue-1)_55%,transparent)] ${hasHistory ? '' : 'pb-[env(safe-area-inset-bottom)]'}`}
        >
          <header className="flex min-h-12 items-center">
            <div className="inline-flex items-center gap-2.25 font-display text-[21px] font-extrabold tracking-[-.04em] text-white" aria-label={t('Чек-ап')}>
              <IconCube className="size-7.5 -rotate-8 text-white drop-shadow-[0_4px_8px_color-mix(in_srgb,var(--ink)_35%,transparent)]" />
              <span aria-hidden>чек-ап</span>
            </div>
          </header>

          <div className="mt-5.5 short:mt-2.5">
            <h1 className={`font-display leading-[.98] font-black tracking-[-.045em] text-balance text-white ${mine ? 'text-[clamp(32px,10vw,44px)]' : 'text-[clamp(32px,10.4vw,46px)]'}`}>
              <span className="rise block">{t('Что')} <span className="hl">{t('прячется')}</span></span>
              <span className="rise block" style={{ '--d': '90ms' } as CSSProperties}>{t('в твоём чеке?')}</span>
            </h1>
            {!mine && (
              <>
                <p className="rise mt-4.5 max-w-[31ch] text-[17px] leading-[1.42] font-semibold text-white/90 short:mt-3 short:text-base" style={{ '--d': '220ms' } as CSSProperties}>
                  {t('Сфоткай чек из магазина. Покажем состав покупок, сколько они стоили и что можно заменить.')}
                </p>
                <p
                  className="rise mt-4 inline-flex items-center gap-2 rounded-full bg-ink/18 py-1.5 pr-3.5 pl-1.5 text-[13px] font-semibold text-white/92 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--white)_18%,transparent)]"
                  style={{ '--d': '280ms' } as CSSProperties}
                >
                  <IconCube className="size-6 flex-none text-white" />
                  <span>{t('Норма взрослого: 10 кубиков сахара в день')}</span>
                </p>
              </>
            )}
            {mine && <StreakPill streak={streak} done={done} onOpen={onWeek} />}
          </div>

          {ready && <OutboxCards jobs={jobs} onManual={onManual} />}

          <div className="rise mt-auto grid gap-2.5 pt-6" style={{ '--d': '320ms' } as CSSProperties}>
            <button
              type="button"
              onClick={onScan}
              className="btn-white pointer-events-auto inline-flex min-h-17 items-center justify-center gap-3 rounded-[22px] px-5.5 font-display text-lg font-bold tracking-[-.01em] [text-shadow:none] transition-transform duration-150 select-none active:scale-[.965]"
            >
              <span className="-ml-1.5 grid size-10.5 place-items-center rounded-[14px] bg-blue-1 text-white shadow-[inset_0_-3px_0_color-mix(in_srgb,var(--ink)_30%,transparent)]">
                <IconCamera className="size-6" />
              </span>
              <span>{t('Сфоткать чек')}</span>
            </button>
            <div className="grid grid-cols-2 gap-2.5">
              <button type="button" onClick={onGallery} className="btn-glass pointer-events-auto inline-flex min-h-13 items-center justify-center gap-2.5 rounded-btn px-3 text-[15px] font-bold transition-transform duration-150 select-none active:scale-[.965]"><IconImage className="size-5.5 flex-none" /><span>{t('Из галереи')}</span></button>
              <button type="button" onClick={() => onManual()} className="btn-glass pointer-events-auto inline-flex min-h-13 items-center justify-center gap-2.5 rounded-btn px-3 text-[15px] font-bold transition-transform duration-150 select-none active:scale-[.965]"><IconEdit className="size-5.5 flex-none" /><span>{t('Вручную')}</span></button>
            </div>
            {!mine && (
              <button
                ref={demoBtnRef}
                type="button"
                aria-haspopup="dialog"
                onClick={() => setSheet(true)}
                className="pointer-events-auto inline-flex min-h-11 items-center justify-center gap-2 rounded-btn px-4 text-[15px] font-bold text-white underline decoration-white/45 underline-offset-4 transition-transform duration-150 select-none active:scale-[.965]"
              >
                <IconReceipt className="size-5.5" />
                <span>{t('Показать на примере')}</span>
              </button>
            )}
          </div>

          <div ref={stageRef} className="relative h-[calc(var(--cube)*2+46px)] flex-none">
            <p ref={hintRef} hidden className="pt-3 text-center text-[13px] font-semibold text-white/80">
              {t('Тапни по кубикам или наклони телефон')}
            </p>
          </div>
        </div>
      </div>

      {hasHistory && <MyChecks entries={entries} hideMoney={hideMoney} onOpen={onOpen} onAll={onWeek} />}

      <AnimatePresence
        onExitComplete={() => {
          const r = picked.current;
          picked.current = null;
          if (r) onDemo(r);
          else demoBtnRef.current?.focus({ preventScroll: true });
        }}
      >
        {sheet && <DemoSheet key="sheet" onClose={() => closeSheet()} onPick={r => closeSheet(r)} />}
      </AnimatePresence>
    </>
  );
}

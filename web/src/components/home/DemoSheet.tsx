'use client';
// Нижняя шторка с тремя демо-чеками. Нативный <dialog> (фокус, Esc), анимация — Motion.
import { useEffect, useRef } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { RECEIPTS } from '@/lib/data';
import { analyze, CUBES, dateRu, pl, verdict } from '@/lib/engine';
import type { Receipt } from '@/lib/types';
import { IconChevron, IconClose } from '@/components/icons';

type Props = {
  onClose(): void;
  onPick(receipt: Receipt): void;
};

export function DemoSheet({ onClose, onPick }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const firstRef = useRef<HTMLButtonElement>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (!d.open) d.showModal();
    firstRef.current?.focus({ preventScroll: true });
    return () => { if (d.open) d.close(); };
  }, []);

  const slide = reduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.2 } }
    : {
        initial: { y: '100%' },
        animate: { y: 0, transition: { type: 'spring' as const, stiffness: 420, damping: 40 } },
        exit: { y: '100%', transition: { duration: 0.22, ease: 'easeIn' as const } },
      };

  return (
    <dialog
      ref={ref}
      aria-labelledby="sheet-title"
      onCancel={e => { e.preventDefault(); onClose(); }}
      className="on-light fixed inset-0 m-0 h-full max-h-none w-full max-w-none overflow-hidden bg-transparent p-0 text-ink backdrop:bg-transparent"
    >
      <motion.div
        aria-hidden
        className="absolute inset-0 bg-ink/58"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, transition: { duration: 0.26 } }}
        exit={{ opacity: 0, transition: { duration: 0.22 } }}
        onClick={onClose}
      />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 mx-auto w-full max-w-[430px]">
        <motion.div
          {...slide}
          className="no-scrollbar pointer-events-auto max-h-[88dvh] overflow-y-auto overscroll-contain rounded-t-sheet bg-white px-4 pt-2.5 pb-[calc(22px+env(safe-area-inset-bottom))] shadow-panel"
        >
          <div aria-hidden className="mx-auto mb-3 h-1.25 w-11 rounded-full bg-line" />
          <div className="flex items-start justify-between gap-3 px-1 pt-1 pb-4">
            <div>
              <p className="text-xs font-extrabold tracking-[.08em] text-blue-1 uppercase">Демо-чеки</p>
              <h2 id="sheet-title" className="mt-1.5 font-display text-[27px] leading-[.95] font-black tracking-[-.045em]">Выбери пример</h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Закрыть"
              className="grid size-11 flex-none place-items-center rounded-[14px] bg-tint text-ink transition-transform active:scale-[.92]"
            >
              <IconClose className="size-5.5" />
            </button>
          </div>

          <ul className="grid gap-2.5">
            {RECEIPTS.map((r, i) => {
              const a = analyze(r);
              const v = verdict(a.score);
              return (
                <motion.li
                  key={r.id}
                  initial={reduce ? false : { opacity: 0, y: 22 }}
                  animate={{ opacity: 1, y: 0, transition: { delay: 0.08 + i * 0.06, duration: 0.42, ease: [0.2, 0.9, 0.2, 1] } }}
                >
                  <button
                    ref={i === 0 ? firstRef : undefined}
                    type="button"
                    onClick={() => onPick(r)}
                    className="grid w-full grid-cols-[86px_minmax(0,1fr)_22px] items-center gap-3.5 rounded-3xl bg-tint py-2.5 pr-3 pl-2.5 text-left transition hover:bg-[color-mix(in_srgb,var(--blue-3)_22%,var(--tint))] active:scale-[.975]"
                  >
                    <span className="grid h-21.5 place-content-center justify-items-center rounded-[18px] bg-sky text-white shadow-[inset_0_-4px_0_color-mix(in_srgb,var(--ink)_18%,transparent)]">
                      <b className="font-display text-[30px] leading-none font-black tracking-[-.05em]">{a.cubes}</b>
                      <small className="mt-1 text-xs font-bold text-white/88">{pl(a.cubes, CUBES)}</small>
                    </span>
                    <span className="grid min-w-0 gap-0.5">
                      <span className="font-display text-base leading-[1.2] font-bold tracking-[-.02em]">{r.title}</span>
                      <span className="text-[13px] font-semibold text-mute">{r.store} · {dateRu(r.date)}</span>
                      <span className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-bold text-mute">
                        <i className={`dot ${v.tone} mr-0.5`} />
                        <b className="font-display text-sm font-extrabold text-ink">{a.score}</b>
                        <span>/100 · {v.label}</span>
                      </span>
                    </span>
                    <IconChevron className="size-5.5 text-blue-1" />
                  </button>
                </motion.li>
              );
            })}
          </ul>
        </motion.div>
      </div>
    </dialog>
  );
}

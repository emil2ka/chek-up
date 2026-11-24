'use client';
// Нижняя шторка на нативном <dialog>: фокус внутри, Esc и тап по фону закрывают.
import { useEffect, useRef, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { t } from '@/lib/i18n';
import { IconClose } from '@/components/icons';

export function Sheet({ title, kicker, onClose, children, footer }: { title: string; kicker?: string; onClose(): void; children: ReactNode; footer?: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (!d.open) d.showModal();
    (d.querySelector<HTMLElement>('[data-autofocus]') ?? panel.current)?.focus({ preventScroll: true });
    return () => { if (d.open) d.close(); };
  }, []);
  const slide = reduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.2 } }
    : { initial: { y: '100%' }, animate: { y: 0, transition: { type: 'spring' as const, stiffness: 420, damping: 40 } }, exit: { y: '100%', transition: { duration: 0.22, ease: 'easeIn' as const } } };
  return (
    <dialog ref={ref} aria-label={title} onCancel={e => { e.preventDefault(); onClose(); }} className="on-light fixed inset-0 m-0 h-full max-h-none w-full max-w-none overflow-hidden bg-transparent p-0 text-ink backdrop:bg-transparent">
      <motion.div aria-hidden className="absolute inset-0 bg-ink/58" initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { duration: 0.26 } }} exit={{ opacity: 0, transition: { duration: 0.22 } }} onClick={onClose} />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 mx-auto w-full max-w-[430px]">
        <motion.div ref={panel} tabIndex={-1} {...slide} style={{ outline: 'none', borderRadius: 'var(--r-sheet) var(--r-sheet) 0 0' }} className="pointer-events-auto flex max-h-[90dvh] flex-col rounded-t-sheet bg-white shadow-panel">
          <div aria-hidden className="mx-auto mt-2.5 h-1.25 w-11 flex-none rounded-full bg-line" />
          <div className="flex flex-none items-start justify-between gap-3 px-5 pt-3 pb-3">
            <div className="min-w-0">
              {kicker && <p className="text-xs font-extrabold tracking-[.08em] text-blue-1 uppercase">{kicker}</p>}
              <h2 className="mt-1 font-display text-[24px] leading-[1.02] font-black tracking-[-.04em]">{title}</h2>
            </div>
            <button type="button" onClick={onClose} aria-label={t('Закрыть')} className="grid size-11 flex-none place-items-center rounded-[14px] bg-tint text-ink transition-transform active:scale-[.92]"><IconClose className="size-5.5" /></button>
          </div>
          <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-1.5 pb-4">{children}</div>
          {footer && <div className="flex-none border-t border-line px-4 pt-3 pb-[calc(16px+env(safe-area-inset-bottom))]">{footer}</div>}
          {!footer && <div className="h-[env(safe-area-inset-bottom)] flex-none" />}
        </motion.div>
      </div>
    </dialog>
  );
}

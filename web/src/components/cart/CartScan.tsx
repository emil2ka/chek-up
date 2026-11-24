'use client';
// Разбор корзины: фото под лучом, найденные товары появляются по одному.
import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { pl, type Forms } from '@/lib/engine';
import { t } from '@/lib/i18n';
import { recognizeCart } from '@/lib/recognize';
import { ScanError, type ScanErrorCode } from '@/lib/scan/errors';
import type { CartResponse } from '@/lib/schema';
import { IconClose } from '@/components/icons';

const ITEMS: Forms = ['товар', 'товара', 'товаров'];
const WAIT = ['Узнаю товары', 'Считаю упаковки', 'Сверяю со справочником', 'Смотрю, что лишнее', 'Ещё немного'];
const MIN = 1900; // мс: успеть показать, что нашли

type Props = { files: File[]; onDone(r: CartResponse): void; onError(code: ScanErrorCode): void; onCancel(): void };

export function CartScan({ files, onDone, onError, onCancel }: Props) {
  const reduce = useReducedMotion();
  const first = files[0] ?? null;
  const photo = useMemo(() => (first ? URL.createObjectURL(first) : null), [first]);
  const [wait, setWait] = useState(0);
  const [seen, setSeen] = useState<string[]>([]);
  const cb = useRef({ onDone, onError });
  useEffect(() => { cb.current = { onDone, onError }; });
  useEffect(() => { if (!photo) return; return () => { window.setTimeout(() => URL.revokeObjectURL(photo), 1500); }; }, [photo]);

  useEffect(() => {
    let dead = false;
    const timers: number[] = [];
    const later = (fn: () => void, ms: number) => timers.push(window.setTimeout(() => { if (!dead) fn(); }, ms));
    const tick = window.setInterval(() => setWait(w => (w + 1) % WAIT.length), 1500);
    const t0 = performance.now();
    // запрос уходит один раз и в строгом режиме: первый запуск успевает отмениться до отправки
    later(() => {
      recognizeCart(files).then(r => {
        if (dead) return;
        window.clearInterval(tick);
        const names = r.cart.items.map(it => it.n);
        const step = Math.min(220, 1500 / names.length);
        names.forEach((n, k) => later(() => setSeen(names.slice(0, k + 1)), k * step));
        later(() => cb.current.onDone(r), Math.max(MIN - (performance.now() - t0), names.length * step + 350));
      }).catch(e => { if (!dead) cb.current.onError(e instanceof ScanError ? e.code : 'unavailable'); });
    }, 30);
    return () => { dead = true; window.clearInterval(tick); timers.forEach(clearTimeout); };
  }, [files]);

  return (
    <div className="flex min-h-full flex-col px-5 pt-[calc(env(safe-area-inset-top)+10px)] pb-[calc(env(safe-area-inset-bottom)+28px)] text-white">
      <header className="grid min-h-12 grid-cols-[44px_1fr_44px] items-center">
        <button type="button" onClick={onCancel} aria-label={t('Отменить')} className="grid size-11 place-items-center rounded-[14px] bg-white/16 transition-transform active:scale-[.92]"><IconClose className="size-5.5" /></button>
        <p className="text-center text-xs font-extrabold tracking-[.08em] text-white/82 uppercase">{t('До кассы')}{files.length > 1 ? ` · ${t('кадров: {n}', { n: files.length })}` : ''}</p>
      </header>
      <div className="grid flex-1 place-items-center pt-6 pb-4.5">
        <motion.div
          aria-hidden
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 30, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={reduce ? { duration: 0.2 } : { type: 'spring', stiffness: 380, damping: 22 }}
          className="relative aspect-[1/1.18] w-[min(72vw,290px,calc(44dvh/1.18))] drop-shadow-[0_24px_30px_color-mix(in_srgb,var(--ink)_45%,transparent)]"
        >
          <span className="corner tl" /><span className="corner tr" /><span className="corner bl" /><span className="corner br" />
          <div className="absolute inset-0 overflow-hidden rounded-[26px] bg-tint">
            {/* eslint-disable-next-line @next/next/no-img-element -- локальный blob-URL, оптимизация не нужна */}
            {photo && <img src={photo} alt="" className="size-full object-cover" />}
            <div className="beam" />
          </div>
        </motion.div>
      </div>
      <div className="text-center" aria-live="polite">
        <h1 className="font-display text-[30px] leading-[.95] font-black tracking-[-.045em]">{t('Смотрю корзину')}<span className="dots"><i>.</i><i>.</i><i>.</i></span></h1>
        <div className="relative mt-3.5 h-14 overflow-hidden">
          <AnimatePresence initial={false} mode="popLayout">
            <motion.p
              key={seen.length ? `s${seen.length}` : `w${wait}`}
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 22 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: { duration: 0.06 } }}
              transition={{ type: 'spring', stiffness: 520, damping: 30 }}
              className={`absolute inset-0 m-auto flex h-fit w-fit max-w-full items-center text-[15px] font-bold ${seen.length ? 'rounded-[23px] bg-white/18 px-4.5 py-2.5 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--white)_25%,transparent)]' : 'text-white/85'}`}
            >
              {seen.length ? seen.at(-1) : t(WAIT[wait])}
            </motion.p>
          </AnimatePresence>
        </div>
        <p className="mt-4 grid justify-items-center">
          <b className="font-display text-[60px] leading-[.95] font-black tracking-[-.06em] tabular-nums">{seen.length}</b>
          <span className="mt-1.5 text-sm font-bold text-white/86">{pl(seen.length, ITEMS)}</span>
        </p>
      </div>
    </div>
  );
}

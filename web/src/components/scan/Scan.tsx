'use client';
// Экран сканирования (~2,6 с): «бумажный» чек или фото, бегущая линия сканера,
// быстро сменяющиеся позиции с сахаром и растущий счётчик кубиков.
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { analyze, CUBES, dateRu, pl } from '@/lib/engine';
import { recognize } from '@/lib/recognize';
import type { ScanResponse } from '@/lib/schema';
import type { Receipt } from '@/lib/types';
import { IconClose } from '@/components/icons';

const DURATION = 2600; // мс — минимум; настоящее распознавание может идти дольше
const WAIT = ['Ищу сладкие позиции', 'Разбираю сокращения кассы', 'Сверяю со справочником', 'Считаю сахар по позициям'];
const LINES = [92, 64, 80, 48, 86, 70, 58, 90, 44, 76, 66, 84, 52, 72];
const nb = (s: string) => s.replace(/(\d) (?=\S)/g, '$1 '); // «270 г» не разрывать

type Props = {
  /** фото с камеры (или null для демо-чека) */
  file: File | null;
  /** выбранный демо-чек (если нет фото) */
  receipt: Receipt | null;
  onDone(res: ScanResponse): void;
  onCancel(): void;
  onError(err: unknown): void;
};

type Tick = { k: number; name: string; grams: string } | null;

export function Scan({ file, receipt, onDone, onCancel, onError }: Props) {
  const reduce = useReducedMotion();
  const photo = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  const [found, setFound] = useState<Receipt | null>(receipt);
  const [tick, setTick] = useState<Tick>(null);
  const [count, setCount] = useState(0);
  const [wait, setWait] = useState(0);

  // последние обработчики без перезапуска эффекта
  const cb = useRef({ onDone, onError });
  useEffect(() => { cb.current = { onDone, onError }; });

  // превью фото: освободить blob-URL, когда экран уйдёт (с запасом на анимацию ухода)
  useEffect(() => {
    if (!photo) return;
    return () => { window.setTimeout(() => URL.revokeObjectURL(photo), 1500); };
  }, [photo]);

  // распознавание + тикер
  useEffect(() => {
    let dead = false;
    const timers: number[] = [];
    const later = (fn: () => void, ms: number) => timers.push(window.setTimeout(() => { if (!dead) fn(); }, ms));
    const t0 = performance.now();
    const waiter = window.setInterval(() => setWait(w => (w + 1) % WAIT.length), 1700);

    const job: Promise<ScanResponse> = receipt
      ? Promise.resolve({ receipt, notice: null })
      : file
        ? recognize(file)
        : Promise.reject(new Error('Нет ни фото, ни чека'));

    job.then(res => {
      window.clearInterval(waiter);
      if (dead) return;
      const r = res.receipt;
      setFound(r);
      const a = analyze(r);
      const sweet = a.items.filter(it => it.active.s > 0);
      const startAt = Math.max(150, performance.now() - t0);
      // если ответ пришёл поздно, всё равно даём позициям ~1,6 с, чтобы их успели прочитать
      const span = Math.max(Math.min(1600, sweet.length * 320), DURATION - startAt - 450);
      const step = sweet.length ? span / sweet.length : span;
      sweet.forEach((it, k) => later(() => {
        setTick({ k, name: nb(it.active.n), grams: `${it.active.s} г сахара` });
        setCount(Math.round(a.cubes * (k + 1) / sweet.length));
      }, startAt + k * step));
      later(() => cb.current.onDone(res), Math.max(DURATION, performance.now() - t0 + 300));
    }).catch(err => {
      window.clearInterval(waiter);
      if (!dead) cb.current.onError(err);
    });

    return () => {
      dead = true;
      window.clearInterval(waiter);
      timers.forEach(clearTimeout);
    };
  }, [file, receipt]);

  return (
    <div className="flex min-h-full flex-col px-5 pt-[calc(env(safe-area-inset-top)+10px)] pb-[calc(env(safe-area-inset-bottom)+28px)] text-white">
      <header className="grid min-h-12 grid-cols-[44px_1fr_44px] items-center">
        <button
          type="button"
          onClick={onCancel}
          aria-label="Отменить сканирование"
          className="grid size-11 place-items-center rounded-[14px] bg-white/16 transition-transform active:scale-[.92]"
        >
          <IconClose className="size-5.5" />
        </button>
        <p className="text-center text-xs font-extrabold tracking-[.08em] text-white/82 uppercase">Сканирую</p>
      </header>

      {/* чек под сканером */}
      <div className="grid flex-1 place-items-center pt-6 pb-4.5 short:pt-4.5 short:pb-3">
        <motion.div
          aria-hidden
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 30, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={reduce ? { duration: 0.2 } : { type: 'spring', stiffness: 380, damping: 22 }}
          className="relative aspect-[1/1.4] w-[min(62vw,250px,calc(42dvh/1.4))] drop-shadow-[0_24px_30px_color-mix(in_srgb,var(--ink)_45%,transparent)]"
        >
          <span className="corner tl" /><span className="corner tr" />
          <span className="corner bl" /><span className="corner br" />
          <div className={`paper-edge paper-bob absolute inset-0 flex flex-col overflow-hidden rounded-t-lg text-ink ${photo ? 'bg-tint' : 'bg-white px-4 pt-4.5 pb-7.5'}`}>
            {photo ? (
              // eslint-disable-next-line @next/next/no-img-element -- локальный blob-URL, оптимизация не нужна
              <img src={photo} alt="" className="size-full object-cover" />
            ) : (
              <>
                <div className="grid min-h-13 justify-items-center gap-0.5 border-b-2 border-dashed border-line pb-3">
                  <b className="min-h-[1.2em] font-display text-[17px] font-extrabold tracking-[-.03em]">{found?.store}</b>
                  <span className="min-h-[1.2em] text-xs font-bold text-mute">{found ? dateRu(found.date) : ''}</span>
                </div>
                <div className="mt-3.5 grid flex-1 content-start gap-2 overflow-hidden">
                  {LINES.map((w, i) => (
                    <motion.i
                      key={i}
                      className="paper-line origin-left"
                      style={{ width: `${w}%` } as CSSProperties}
                      initial={reduce ? false : { opacity: 0, scaleX: 0.3 }}
                      animate={{ opacity: 1, scaleX: 1 }}
                      transition={{ delay: i * 0.07, duration: 0.3 }}
                    />
                  ))}
                </div>
                <div className="mt-2.5 flex justify-between border-t-2 border-dashed border-line pt-3">
                  <i className="block h-2.5 w-[34%] rounded bg-ink" />
                  <i className="block h-2.5 w-[24%] rounded bg-ink" />
                </div>
              </>
            )}
            <div className="beam" />
          </div>
        </motion.div>
      </div>

      {/* подписи */}
      <div className="text-center" aria-live="polite">
        <h1 className="font-display text-[30px] leading-[.95] font-black tracking-[-.045em]">
          Читаю чек<span className="dots"><i>.</i><i>.</i><i>.</i></span>
        </h1>

        <div className="relative mt-3.5 h-16.5 overflow-hidden short:mt-2.5">
          <AnimatePresence initial={false}>
            {tick ? (
              <motion.p
                key={tick.k}
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: 26 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, y: -26 }}
                transition={{ type: 'spring', stiffness: 520, damping: 30 }}
                className="absolute inset-0 m-auto flex h-fit min-h-11.5 w-fit max-w-full items-center gap-2.25 rounded-[23px] bg-white/18 px-4.5 py-2.5 text-left text-[15px] leading-[1.3] font-bold text-balance shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--white)_25%,transparent)]"
              >
                <i aria-hidden className="size-2.25 flex-none rounded-[3px] bg-white shadow-[0_0_10px_var(--white)]" />
                <span>{tick.name} — <b className="font-display font-extrabold whitespace-nowrap">{tick.grams}</b></span>
              </motion.p>
            ) : (
              <motion.p
                key={`wait-${wait}`}
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 m-auto flex h-fit w-fit items-center text-[15px] font-bold text-white/80"
              >
                {WAIT[wait]}
              </motion.p>
            )}
          </AnimatePresence>
        </div>

        <p className="mt-4.5 grid justify-items-center">
          <motion.b
            key={count}
            initial={reduce || count === 0 ? false : { scale: 1.18 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 600, damping: 18 }}
            className="font-display text-[68px] leading-[.95] font-black tracking-[-.06em] tabular-nums short:text-[54px]"
          >
            {count}
          </motion.b>
          <span className="mt-1.5 text-sm font-bold text-white/86">{pl(count, CUBES)} сахара найдено</span>
        </p>
      </div>
    </div>
  );
}

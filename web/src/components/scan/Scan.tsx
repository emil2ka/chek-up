'use client';
// Экран сканирования (~2,6 с): «бумажный» чек или фото, бегущая линия сканера,
// быстро сменяющиеся позиции с сахаром и растущий счётчик кубиков.
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { amountTxt, analyze, cubesOfValue, dateRu, METRICS, pl, valueOf, type Forms } from '@/lib/engine';
import { t } from '@/lib/i18n';
import { outboxServerSnapshot, outboxSnapshot, subscribeOutbox, waitFor, type Outcome } from '@/lib/outbox';
import type { MetricId, Receipt } from '@/lib/types';
import { IconClose } from '@/components/icons';
import { MetricIcon } from '@/components/ui/MetricIcon';

const DURATION = 2600; // мс — минимум; настоящее распознавание может идти дольше
const WAIT = ['Читаю позиции', 'Разбираю сокращения кассы', 'Сверяю со справочником', 'Считаю шесть показателей', 'Ещё немного'];
/** по этим показателям ищем «вредное» в ленте сканера (калории — не вред сами по себе) */
const SCANNED: MetricId[] = ['sugar', 'salt', 'fat'];
const ITEMS: Forms = ['позиция', 'позиции', 'позиций'];
const LINES = [92, 64, 80, 48, 86, 70, 58, 90, 44, 76, 66, 84, 52, 72];
const nb = (s: string) => s.replace(/(\d) (?=\S)/g, '$1 '); // «270 г» не разрывать

type Props = {
  /** фото с камеры (или null для демо-чека) */
  files: File[];
  /** чек в очереди, которого ждём */
  jobId: string | null;
  /** выбранный демо-чек (если нет фото) */
  receipt: Receipt | null;
  /** чек прочитан (демо — сразу) */
  onDone(o: Outcome): void;
  onCancel(): void;
  /** не ждать: чек дочитается в фоне */
  onBackground(): void;
  /** длинный чек: доснять ещё кадр */
  onMore(): void;
};

type Tick = { k: number; m: MetricId; name: string; grams: string } | null;

export function Scan({ files, jobId, receipt, onDone, onCancel, onBackground, onMore }: Props) {
  const reduce = useReducedMotion();
  const first = files[0] ?? null;
  const photo = useMemo(() => (first ? URL.createObjectURL(first) : null), [first]);
  const queued = useSyncExternalStore(subscribeOutbox, outboxSnapshot, outboxServerSnapshot).filter(j => j.status !== 'error').length;
  const [found, setFound] = useState<Receipt | null>(receipt);
  const [tick, setTick] = useState<Tick>(null);
  const [count, setCount] = useState(0);
  const [wait, setWait] = useState(0);

  // последние обработчики без перезапуска эффекта
  const cb = useRef({ onDone });
  useEffect(() => { cb.current = { onDone }; });

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

    const show = (r: Receipt, o: Outcome) => {
      window.clearInterval(waiter);
      if (dead) return;
      setFound(r);
      const a = analyze(r);
      // позиции, где чего-то хотя бы кубик; для каждой показываем самый выраженный показатель
      const worst = (it: (typeof a.items)[number]) => SCANNED.map(m => ({ m, v: valueOf(it.active, m), c: cubesOfValue(valueOf(it.active, m), m) })).sort((x, y) => y.c - x.c)[0];
      const sweet = a.items.filter(it => !it.nf && worst(it).c >= 1).slice(0, 8);
      const startAt = Math.max(150, performance.now() - t0);
      // позиции успевают прочитать, но готовый чек зря не держим
      const span = Math.max(Math.min(1400, sweet.length * 280), DURATION - startAt - 450);
      const step = sweet.length ? span / sweet.length : span;
      sweet.forEach((it, k) => later(() => {
        const w = worst(it);
        setTick({ k, m: w.m, name: nb(it.active.n), grams: `${amountTxt(w.v, w.m).replace(' ', '\u00A0')} ${t(METRICS[w.m].of)}` });
        setCount(Math.round(a.items.length * (k + 1) / sweet.length));
      }, k * step));
      later(() => cb.current.onDone(o), Math.max(DURATION - startAt, span + 250));
    };

    let off = () => {};
    if (receipt) show(receipt, { kind: 'demo', receipt, notice: '' });
    else if (jobId) off = waitFor(jobId, o => {
      if (o.kind === 'error') { window.clearInterval(waiter); if (!dead) cb.current.onDone(o); }
      else show(o.receipt, o);
    });

    return () => {
      dead = true;
      off();
      window.clearInterval(waiter);
      timers.forEach(clearTimeout);
    };
  }, [jobId, receipt]);

  return (
    <div className="flex min-h-full flex-col px-5 pt-[calc(env(safe-area-inset-top)+10px)] pb-[calc(env(safe-area-inset-bottom)+28px)] text-white">
      <header className="grid min-h-12 grid-cols-[44px_1fr_44px] items-center">
        <button
          type="button"
          onClick={onCancel}
          aria-label={t('Отменить')}
          className="grid size-11 place-items-center rounded-[14px] bg-white/16 transition-transform active:scale-[.92]"
        >
          <IconClose className="size-5.5" />
        </button>
        <p className="text-center text-xs font-extrabold tracking-[.08em] text-white/82 uppercase">{t('Сканирую')}{files.length > 1 ? ` · ${t('кадров: {n}', { n: files.length })}` : ''}</p>
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
          {t('Читаю чек')}<span className="dots"><i>.</i><i>.</i><i>.</i></span>
        </h1>

        <div className="relative mt-3.5 h-16.5 overflow-hidden short:mt-2.5">
          <AnimatePresence initial={false} mode="wait">
            {tick ? (
              <motion.p
                key={tick.k}
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: 26 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, transition: { duration: 0.08 } }}
                transition={{ type: 'spring', stiffness: 520, damping: 30 }}
                className="absolute inset-0 m-auto flex h-fit min-h-11.5 w-fit max-w-full items-center gap-2.25 rounded-[23px] bg-white/18 px-4.5 py-2.5 text-left text-[15px] leading-[1.3] font-bold text-balance shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--white)_25%,transparent)]"
              >
                <MetricIcon m={tick.m} className="size-6" />
                <span>{tick.name} — <b className="font-display font-extrabold whitespace-nowrap">{tick.grams}</b></span>
              </motion.p>
            ) : (
              <motion.p
                key={`wait-${wait}`}
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, transition: { duration: 0.08 } }}
                className="absolute inset-0 m-auto flex h-fit w-fit items-center text-[15px] font-bold text-white/80"
              >
                {t(WAIT[wait])}
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
          <span className="mt-1.5 text-sm font-bold text-white/86">{pl(count, ITEMS)}</span>
        </p>
      </div>

      {jobId && !found && (
        <div className="rise mt-5 grid gap-2.5" style={{ '--d': '900ms' } as CSSProperties}>
          <button type="button" onClick={onBackground} className="btn-glass inline-flex min-h-13 items-center justify-center rounded-btn px-4 text-[15px] font-bold active:scale-[.97]">{t('Продолжить в фоне')}</button>
          {files.length < 3 && <button type="button" onClick={onMore} className="min-h-11 text-[14px] font-bold text-white/90 underline decoration-white/40 underline-offset-4">{t('Чек длинный? Добавь ещё кадр')}</button>}
          {queued > 1 && <p className="text-center text-[13px] font-semibold text-white/85">{t('В очереди чеков: {n}', { n: queued })}</p>}
        </div>
      )}
    </div>
  );
}

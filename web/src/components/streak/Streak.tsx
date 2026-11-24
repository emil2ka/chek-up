'use client';
// Стрик «недели подряд»: ряд кубиков-недель и закрытие недели.
import { useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { t } from '@/lib/i18n';
import { addDays, dayTxt, todayIso, weekOf, weekTxt } from '@/lib/calendar';
import { pl, type Forms } from '@/lib/engine';
import { useNow } from '@/lib/now';
import { closeDeadline, MILESTONES, type Streak as StreakData, type WeekCell } from '@/lib/streak';
import { IconCheck, IconSnow } from '@/components/icons';

export const WEEKS_F: Forms = ['неделя', 'недели', 'недель'];
const FREEZES_F: Forms = ['заморозка', 'заморозки', 'заморозок'];
export const RECEIPTS_F: Forms = ['чек', 'чека', 'чеков'];

const cellName = (k: WeekCell['kind']): string => ({
  full: t('засчитана, сахар в норме'), outline: t('засчитана, сахара больше нормы'), none: t('засчитана, покупок не было'),
  frozen: t('пропуск на заморозке'), miss: t('пропущена'), now: t('идёт'), late: t('ещё можно закрыть'),
}[k]);

function Cell({ c, tone }: { c: WeekCell; tone: 'glass' | 'light' }) {
  const glass = tone === 'glass';
  const solid = glass ? 'bg-white' : 'bg-blue-1';
  const line = glass ? 'border-white' : 'border-blue-1';
  const faint = glass ? 'border-white/45' : 'border-line';
  const box = 'grid aspect-square w-full place-items-center rounded-[7px]';
  const look: Record<WeekCell['kind'], string> = {
    full: `${solid} shadow-[inset_-2px_-2px_0_color-mix(in_srgb,var(--ink)_14%,transparent)]`,
    outline: `border-[2.5px] ${line}`,
    none: `border-[2.5px] border-dotted ${line}`,
    frozen: glass ? 'bg-white/28' : 'bg-blue-3/45',
    miss: `border-2 ${faint} opacity-60`,
    now: `border-[2.5px] border-dashed ${glass ? 'border-white/80' : 'border-blue-2'}`,
    late: `border-[2.5px] border-dashed border-mid`,
  };
  return (
    <li className={`${box} ${look[c.kind]}`}>
      {c.kind === 'frozen' && <IconSnow className={`size-[70%] ${glass ? 'text-white' : 'text-blue-1'}`} />}
      {c.kind === 'full' && <IconCheck className={`size-[70%] ${glass ? 'text-blue-1' : 'text-white'}`} />}
      <span className="sr-only">{weekTxt(c.week)}: {cellName(c.kind)}</span>
    </li>
  );
}

/** Ряд последних недель; пустые места справа — будущие. */
export function StreakRow({ streak, tone = 'light' }: { streak: StreakData; tone?: 'glass' | 'light' }) {
  const pad = Math.max(0, 12 - streak.cells.length);
  return (
    <ol className="grid grid-cols-12 gap-1" aria-label={t('Последние 12 недель')}>
      {streak.cells.map(c => <Cell key={c.week} c={c} tone={tone} />)}
      {Array.from({ length: pad }, (_, i) => <li key={`p${i}`} aria-hidden className={`aspect-square rounded-[7px] ${tone === 'glass' ? 'bg-white/10' : 'bg-white'}`} />)}
    </ol>
  );
}

export const streakTitle = (s: StreakData): string => (s.current ? `${s.current} ${pl(s.current, WEEKS_F)} ${t('подряд')}` : t('Начни стрик'));

type CloseProps = {
  streak: StreakData;
  /** неделя, которую предлагаем закрыть */
  week: string;
  closedState: 'closed' | 'none' | 'open';
  done: { now: number; usual: number };
  best: number;
  canEdit: boolean;
  onSet(week: string, state: 'closed' | 'none' | 'open'): void;
  onScan(): void;
  onShare(): void;
};

/** Карточка стрика в разделе «Неделя»: сколько внесено, закрыть неделю, отменить. */
export function StreakCard({ streak, week, closedState, done, best, canEdit, onSet, onScan, onShare }: CloseProps) {
  const now = useNow();
  const reduce = useReducedMotion();
  const [ask, setAsk] = useState(false);
  const isPrev = week < weekOf(todayIso(now));
  const closed = closedState !== 'open';
  const hoursLeft = Math.max(1, Math.ceil((closeDeadline(week) - now) / 3_600_000));
  const few = done.usual > 0 && done.now < done.usual;
  const next = MILESTONES.find(m => m > streak.current);

  const close = (state: 'closed' | 'none') => { setAsk(false); onSet(week, state); };

  return (
    <section className="rs-sec" aria-labelledby="st-h">
      <div className="rounded-[28px] bg-sky p-4.5 text-white">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="st-h" className="font-display text-[24px] leading-[1.02] font-black tracking-[-.04em]">{streakTitle(streak)}</h2>
            <p className="mt-1.5 text-[13px] font-semibold text-white/88">
              {!streak.total ? t('Внеси чеки за неделю и нажми «Это все чеки»') : <>{t('Рекорд')}: {Math.max(best, streak.best)} · {streak.freezes} {pl(streak.freezes, FREEZES_F)}{next ? ` · ${t('до нового кубика')} ${next - streak.current}` : ''}</>}
            </p>
          </div>
          <span className="inline-flex h-9 flex-none items-center gap-1 rounded-full bg-white/18 px-3 text-[13px] font-extrabold" aria-hidden><IconSnow className="size-4" />{streak.freezes}</span>
        </div>
        <div className="mt-4"><StreakRow streak={streak} tone="glass" /></div>

        <div className="on-light mt-4 rounded-[22px] bg-white p-3.5 text-ink">
          <p className="text-[13px] font-bold text-mute">{weekTxt(week)}{isPrev ? ` · ${t('прошлая неделя')}` : ''}</p>
          {closed ? (
            <motion.div initial={reduce ? false : { scale: 0.96, opacity: 0.4 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 500, damping: 22 }}>
              <p className="mt-1 flex items-center gap-2 text-[16px] leading-snug font-extrabold">
                <span className="grid size-7 flex-none place-items-center rounded-full bg-good text-white"><IconCheck className="size-4.5" /></span>
                {closedState === 'none' && !done.now ? t('Неделя закрыта: покупок не было') : t('Неделя закрыта')}
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button type="button" onClick={onShare} className="min-h-12 rounded-2xl bg-blue-1 px-3 font-display text-[14px] font-bold text-white active:scale-[.97]">{t('Поделиться')}</button>
                {canEdit && <button type="button" onClick={() => onSet(week, 'open')} className="min-h-12 rounded-2xl bg-tint px-3 text-[14px] font-bold text-ink active:scale-[.97]">{t('Открыть снова')}</button>}
              </div>
            </motion.div>
          ) : !canEdit ? (
            <p className="mt-1 text-[15px] leading-snug font-bold">{t('Неделю закрывает взрослый. Твои чеки уже учтены.')}</p>
          ) : (
            <>
              <p className="mt-1 text-[16px] leading-snug font-extrabold">
                {done.now
                  ? <>{t('Внесено')} {done.now} {pl(done.now, RECEIPTS_F)}{done.usual ? ` ${t('из обычных')} ${done.usual}` : ''}</>
                  : t('На этой неделе чеков пока нет')}
              </p>
              {isPrev && <p className="mt-1 text-[13px] font-bold text-[#B26A00]">{t('Можно дозаписать до вечера понедельника')} · {t('осталось {n} ч', { n: hoursLeft })}</p>}
              {ask ? (
                <div className="mt-3 rounded-2xl bg-tint p-3">
                  <p className="text-[14px] leading-snug font-semibold">
                    {done.now ? t('Обычно чеков больше. Точно внесены все?') : t('Закрыть неделю без чеков? Отметим, что продукты не покупали.')}
                  </p>
                  <div className="mt-2.5 grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => setAsk(false)} className="min-h-12 rounded-2xl bg-white text-[14px] font-bold shadow-[inset_0_0_0_1.5px_var(--line)] active:scale-[.97]">{t('Отмена')}</button>
                    <button type="button" onClick={() => close(done.now ? 'closed' : 'none')} className="min-h-12 rounded-2xl bg-blue-1 text-[14px] font-bold text-white active:scale-[.97]">{t('Да, закрыть')}</button>
                  </div>
                </div>
              ) : (
                <div className="mt-3 grid gap-2">
                  {done.now
                    ? <button type="button" onClick={() => (few ? setAsk(true) : close('closed'))} className="min-h-13 rounded-2xl bg-blue-1 font-display text-[15px] font-bold text-white active:scale-[.97]">{t('Это все чеки за неделю')}</button>
                    : <button type="button" onClick={onScan} className="min-h-13 rounded-2xl bg-blue-1 font-display text-[15px] font-bold text-white active:scale-[.97]">{t('Внести чек')}</button>}
                  {!done.now && <button type="button" onClick={() => setAsk(true)} className="min-h-12 rounded-2xl bg-tint text-[14px] font-bold text-ink active:scale-[.97]">{t('Покупок не было')}</button>}
                </div>
              )}
            </>
          )}
        </div>
        <p className="mt-3 text-[13px] leading-snug font-semibold text-white/88">
          {t('Белый кубик — сахар в норме, контурный — больше нормы. Стрик горит только от пропуска, а не от сахара.')}
        </p>
      </div>
    </section>
  );
}

/** Узкая плашка на главной. */
export function StreakPill({ streak, done, onOpen }: { streak: StreakData; done: { now: number; usual: number }; onOpen(): void }) {
  const now = useNow();
  const today = todayIso(now);
  const sunday = addDays(weekOf(today), 6);
  const left = today === sunday ? t('сегодня последний день недели') : t('до {day}', { day: dayTxt(sunday) });
  return (
    <button type="button" onClick={onOpen} className="pointer-events-auto mt-3.5 w-full rounded-[22px] bg-ink/20 px-4 py-3 text-left text-white shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--white)_20%,transparent)] backdrop-blur-[6px] [text-shadow:none] active:scale-[.985]">
      <span className="flex items-baseline justify-between gap-3">
        <b className="font-display text-[17px] font-extrabold tracking-[-.03em]">{streakTitle(streak)}</b>
        <span className="text-[13px] font-bold text-white/88">{done.now}{done.usual ? ` ${t('из')} ${done.usual}` : ''} {pl(done.now, RECEIPTS_F)} · {left}</span>
      </span>
      <span className="mt-2 block"><StreakRow streak={streak} tone="glass" /></span>
    </button>
  );
}

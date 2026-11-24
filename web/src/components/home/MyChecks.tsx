'use client';
// Блок «Мои чеки»: белая карточка под первым экраном. На её верхнем крае лежат кубики. Здесь последние чеки, все — в журнале.
import { motion, useReducedMotion } from 'motion/react';
import { CUBES, dateRu, money, pl, SUGAR_CUBES, verdict } from '@/lib/engine';
import { t } from '@/lib/i18n';
import { isDemo, receiptOf } from '@/lib/insights';
import { factOf } from '@/lib/plan';
import type { HistoryEntry } from '@/lib/types';
import { IconChevron, IconLock } from '@/components/icons';

const LIMIT = 6;

export function MyChecks({ entries, hideMoney, onOpen, onAll }: { entries: HistoryEntry[]; hideMoney: boolean; onOpen(id: string): void; onAll(): void }) {
  const reduce = useReducedMotion();
  const list = [...entries].sort((a, b) => b.date.localeCompare(a.date) || b.savedAt - a.savedAt).slice(0, LIMIT);
  return (
    <motion.section
      aria-labelledby="mine-title"
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduce ? 0.2 : 0.5, ease: [0.2, 0.9, 0.2, 1] }}
      className="on-light relative z-3 rounded-t-sheet bg-white px-4 pt-5.5 pb-[calc(26px+env(safe-area-inset-bottom))] text-ink shadow-panel"
    >
      <div className="flex items-center justify-between px-1.5 pb-2.5">
        <h2 id="mine-title" className="font-display text-2xl leading-[.95] font-black tracking-[-.04em]">{t('Мои чеки')}</h2>
        <span className="grid h-8 min-w-8 place-items-center rounded-full bg-tint px-2.5 font-display text-sm font-extrabold text-blue-1">
          {entries.length}
        </span>
      </div>
      <ul>
        {list.map(rec => {
          const r = receiptOf(rec);
          const a = r ? factOf(rec, r) : null;
          const cubes = a?.cubes ?? rec.cubes, score = !a || r?.masked ? rec.score : a.score;
          const v = verdict(score);
          return (
            <li key={rec.id} className="border-line [&+&]:border-t">
              <button
                type="button"
                onClick={() => onOpen(rec.id)}
                className="grid min-h-17 w-full grid-cols-[minmax(0,1fr)_auto_auto_18px] items-center gap-3 rounded-2xl px-1.5 py-3 text-left transition hover:bg-tint active:scale-[.985] active:bg-tint"
              >
                <span className="grid min-w-0 gap-0.5">
                  <span className="flex min-w-0 items-center gap-1.5 font-display text-base font-bold tracking-[-.02em]"><span className="truncate">{rec.store}</span>{rec.priv && <IconLock className="size-4 flex-none text-mute" aria-label={t('Личный чек')} />}</span>
                  <span className="text-[13px] leading-[1.3] font-semibold text-mute">
                    {dateRu(rec.date)}{isDemo(rec) ? ` · ${t('пример')}` : r?.refund ? ` · ${t('возврат')}` : a && !hideMoney && !r?.masked ? ` · ${money(a.total)}` : ''}
                  </span>
                </span>
                <span className="grid justify-items-end leading-none">
                  <b className="font-display text-[22px] font-black tracking-[-.04em]">{cubes}</b>
                  <small className="mt-0.75 text-xs font-bold text-mute"><span aria-hidden>{pl(cubes, CUBES)}</span><span className="sr-only">{pl(cubes, SUGAR_CUBES)}</span></small>
                </span>
                <span className="inline-flex h-8 items-center gap-1.75 rounded-full bg-tint pr-2.75 pl-2.5">
                  <i className={`dot ${v.tone}`} />
                  <b className="font-display text-sm font-extrabold">{score}</b>
                  <span className="sr-only">{t('из 100')}, {v.label}</span>
                </span>
                <IconChevron className="size-4.5 text-mute" />
              </button>
            </li>
          );
        })}
      </ul>
      {entries.length > LIMIT && <button type="button" onClick={onAll} className="mt-2 min-h-12 w-full rounded-2xl bg-tint text-[14px] font-bold text-blue-1 active:scale-[.98]">{t('Все чеки в журнале')}</button>}
    </motion.section>
  );
}

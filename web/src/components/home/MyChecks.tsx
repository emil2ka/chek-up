'use client';
// Блок «Мои чеки»: белая карточка под первым экраном. На её верхнем крае лежат кубики.
import { motion, useReducedMotion } from 'motion/react';
import { RECEIPTS } from '@/lib/data';
import { CUBES, dateRu, pl, verdict } from '@/lib/engine';
import type { HistoryEntry } from '@/lib/types';
import { IconChevron } from '@/components/icons';

const titleOf = (rec: HistoryEntry) => rec.receipt?.title ?? RECEIPTS.find(r => r.id === rec.receiptId)?.title ?? '';

export function MyChecks({ entries, onOpen }: { entries: HistoryEntry[]; onOpen(id: string): void }) {
  const reduce = useReducedMotion();
  return (
    <motion.section
      aria-labelledby="mine-title"
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduce ? 0.2 : 0.5, ease: [0.2, 0.9, 0.2, 1] }}
      className="on-light relative z-3 rounded-t-sheet bg-white px-4 pt-5.5 pb-[calc(26px+env(safe-area-inset-bottom))] text-ink shadow-panel"
    >
      <div className="flex items-center justify-between px-1.5 pb-2.5">
        <h2 id="mine-title" className="font-display text-2xl leading-[.95] font-black tracking-[-.04em]">Мои чеки</h2>
        <span className="grid h-8 min-w-8 place-items-center rounded-full bg-tint px-2.5 font-display text-sm font-extrabold text-blue-1">
          {entries.length}
        </span>
      </div>
      <ul>
        {entries.map(rec => {
          const v = verdict(rec.score);
          const title = titleOf(rec);
          return (
            <li key={rec.id} className="border-line [&+&]:border-t">
              <button
                type="button"
                onClick={() => onOpen(rec.id)}
                className="grid min-h-17 w-full grid-cols-[minmax(0,1fr)_auto_auto_18px] items-center gap-3 rounded-2xl px-1.5 py-3 text-left transition hover:bg-tint active:scale-[.985] active:bg-tint"
              >
                <span className="grid min-w-0 gap-0.5">
                  <span className="font-display text-base font-bold tracking-[-.02em]">{rec.store}</span>
                  <span className="text-[13px] leading-[1.3] font-semibold text-mute">
                    {dateRu(rec.date)}{title ? ` · ${title}` : ''}
                  </span>
                </span>
                <span className="grid justify-items-end leading-none">
                  <b className="font-display text-[22px] font-black tracking-[-.04em]">{rec.cubes}</b>
                  <small className="mt-0.75 text-xs font-bold text-mute">{pl(rec.cubes, CUBES)}</small>
                </span>
                <span className="inline-flex h-8 items-center gap-1.75 rounded-full bg-tint pr-2.75 pl-2.5">
                  <i className={`dot ${v.tone}`} />
                  <b className="font-display text-sm font-extrabold">{rec.score}</b>
                  <span className="sr-only">из 100, {v.label}</span>
                </span>
                <IconChevron className="size-4.5 text-mute" />
              </button>
            </li>
          );
        })}
      </ul>
      <p className="mt-3.5 text-center text-xs font-semibold text-mute">Хранится только на этом телефоне</p>
    </motion.section>
  );
}

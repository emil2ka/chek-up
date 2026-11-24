'use client';
// Переключатель показателей для результата, недели и справочника.
import { METRIC_IDS, METRICS } from '@/lib/engine';
import type { MetricId } from '@/lib/types';

type Props = {
  value: MetricId;
  onChange(m: MetricId): void;
  /** светлый вариант для белой карточки (по умолчанию — для синего фона) */
  light?: boolean;
  className?: string;
};

export function MetricTabs({ value, onChange, light = false, className = '' }: Props) {
  return (
    <div
      role="tablist"
      aria-label="Показатель"
      className={`grid grid-cols-3 gap-1 rounded-[22px] p-1 ${light ? 'bg-tint' : 'bg-white/16 shadow-[inset_0_0_0_1px_rgba(255,255,255,.22)]'} ${className}`}
    >
      {METRIC_IDS.map(m => {
        const on = m === value;
        return (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={on}
            aria-label={METRICS[m].label}
            onClick={() => onChange(m)}
            className={`flex min-h-10 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-full px-1 text-[13px] font-extrabold tracking-[-.01em] transition-[background,color,transform] duration-150 select-none active:scale-[.95] ${
              on ? 'bg-white text-ink shadow-[0_6px_16px_-6px_rgba(6,18,110,.45)]' : light ? 'text-mute' : 'text-white'
            }`}
          >
            <i aria-hidden className="size-2 flex-none rounded-full" style={{ background: METRICS[m].color, boxShadow: on ? 'none' : '0 0 0 1.5px rgba(255,255,255,.85)' }} />
            <span className="truncate">{METRICS[m].label}</span>
          </button>
        );
      })}
    </div>
  );
}

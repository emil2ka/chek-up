'use client';
// Переключатель показателей для результата, недели и справочника.
import { METRIC_IDS, METRICS } from '@/lib/engine';
import { t } from '@/lib/i18n';
import type { MetricId } from '@/lib/types';
import { MetricIcon } from './MetricIcon';

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
      aria-label={t('Показатель')}
      className={`no-scrollbar flex gap-1 overflow-x-auto overscroll-x-contain rounded-full p-1 ${light ? 'bg-tint' : 'bg-white/16 shadow-[inset_0_0_0_1px_rgba(255,255,255,.22)]'} ${className}`}
    >
      {METRIC_IDS.map(m => {
        const on = m === value;
        return (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={on}
            aria-label={t(METRICS[m].label)}
            onClick={e => { onChange(m); e.currentTarget.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' }); }}
            className={`flex min-h-11 flex-none items-center justify-center gap-1.5 rounded-full px-3 text-[13px] font-extrabold tracking-[-.01em] transition-[background,color,transform] duration-150 select-none active:scale-[.95] ${
              on ? 'bg-white text-ink shadow-[0_6px_16px_-6px_rgba(6,18,110,.45)]' : light ? 'text-mute' : 'text-white'
            }`}
          >
            <MetricIcon m={m} className="size-5" />
            <span className="truncate">{t(METRICS[m].label)}</span>
          </button>
        );
      })}
    </div>
  );
}

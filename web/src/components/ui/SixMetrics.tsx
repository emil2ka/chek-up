'use client';
// Всё, что внутри, одним взглядом: шесть показателей с фигурками.
import { bigNum, isCubeMetric, METRIC_IDS, METRICS } from '@/lib/engine';
import { t } from '@/lib/i18n';
import type { MetricId } from '@/lib/types';
import { MetricIcon } from './MetricIcon';

export const metricName = (m: MetricId): string => t(METRICS[m].label);
// у калорий единица уже в названии
const unitOf = (m: MetricId): string => (isCubeMetric(m) ? t('куб.') : m === 'kcal' ? '' : t(METRICS[m].unit));
/** «14 264» */
const short = (v: number, m: MetricId): string => bigNum(v, m).replace(/\B(?=(\d{3})+$)/g, '\u2009');

/** Ряд «что покажем»: значок и название, а с totals — значок и число. */
export function SixRow({ totals, label, className = '' }: { totals?: Record<MetricId, number>; label: string; className?: string }) {
  return (
    <ul className={`grid grid-cols-6 gap-1 ${className}`} aria-label={label}>
      {METRIC_IDS.map(m => (
        <li key={m} className="grid min-w-0 justify-items-center gap-1">
          <MetricIcon m={m} className="size-8.5 drop-shadow-[0_4px_6px_rgba(6,18,110,.35)]" />
          {totals
            ? <span className="max-w-full text-[13px] leading-tight font-extrabold tabular-nums"><span className="sr-only">{metricName(m)} </span>{short(totals[m], m)}</span>
            : <span className="max-w-full truncate text-[11.5px] leading-tight font-bold">{t(METRICS[m].short)}</span>}
        </li>
      ))}
    </ul>
  );
}

type GridProps = {
  totals: Record<MetricId, number>;
  /** какие показатели известны */
  available?: readonly MetricId[];
  value?: MetricId;
  onChange?(m: MetricId): void;
  /** доля нормы, 0..∞ */
  ratio?: Record<MetricId, number>;
};

/** Плитки со значениями; с onChange нажатие выбирает показатель. */
export function SixGrid({ totals, available = METRIC_IDS, value, onChange, ratio }: GridProps) {
  return (
    <ul className="grid grid-cols-2 gap-2 min-[380px]:grid-cols-3">
      {METRIC_IDS.map(m => {
        const known = available.includes(m), on = value === m;
        const body = (
          <>
            <MetricIcon m={m} className="size-8" />
            <span className="min-w-0">
              <span className="block truncate text-[12.5px] leading-tight font-bold text-mute">{metricName(m)}</span>
              <b className="mt-0.5 block font-display text-[16px] leading-none whitespace-nowrap font-black tracking-[-.04em] tabular-nums">{known ? short(totals[m], m) : '—'}<small className="ml-0.75 font-sans text-[11.5px] font-bold tracking-normal text-mute">{known ? unitOf(m) : ''}</small></b>
              {ratio && known && <span className={`mt-1 block text-[11.5px] leading-none font-bold ${METRICS[m].harmful && ratio[m] > 1 ? 'text-bad' : 'text-mute'}`}>{Math.round(ratio[m] * 100)}%<span className="sr-only"> {t('от нормы')}</span></span>}
            </span>
          </>
        );
        const cls = `grid min-h-17 w-full grid-cols-[32px_minmax(0,1fr)] items-center gap-1.5 rounded-[20px] px-2 py-2 text-left ${on ? 'bg-[color-mix(in_srgb,var(--blue-3)_26%,var(--tint))] ring-2 ring-blue-1' : 'bg-tint'}`;
        return <li key={m} className="min-w-0">{onChange ? <button type="button" aria-pressed={on} onClick={() => onChange(m)} className={`${cls} transition active:scale-[.97]`}>{body}</button> : <div className={cls}>{body}</div>}</li>;
      })}
    </ul>
  );
}

/** Четыре главных числа строкой — в списках чеков. */
export function MetricLine({ totals }: { totals: Record<MetricId, number> }) {
  return (
    <span className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[13px] font-bold text-ink">
      {(['sugar', 'salt', 'fat', 'kcal'] as const).map(m => (
        <span key={m} className="inline-flex items-center gap-1 tabular-nums"><MetricIcon m={m} className="size-4" /><span className="sr-only">{metricName(m)}</span>{short(totals[m], m)}</span>
      ))}
    </span>
  );
}

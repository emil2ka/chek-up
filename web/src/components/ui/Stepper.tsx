'use client';
// Счётчик «− 2 +» для состава семьи. tone="glass" — на синем фоне, tone="light" — на белой карточке.
import { IconMinus, IconPlus } from '@/components/icons';

type Props = {
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  tone?: 'glass' | 'light';
  onChange(v: number): void;
};

export function Stepper({ label, hint, value, min, max, tone = 'light', onChange }: Props) {
  const glass = tone === 'glass';
  const btn = `grid size-12 flex-none place-items-center rounded-2xl transition active:scale-[.9] disabled:opacity-35 disabled:active:scale-100 ${
    glass ? 'bg-white text-blue-1' : 'bg-white text-blue-1 shadow-[inset_0_0_0_1.5px_var(--line)]'
  }`;
  return (
    <div
      role="group"
      aria-label={label}
      className={`flex items-center gap-3 rounded-3xl py-2.5 pr-2.5 pl-4 ${
        glass ? 'bg-white/14 shadow-[inset_0_0_0_1.5px_color-mix(in_srgb,var(--white)_30%,transparent)]' : 'bg-tint'
      }`}
    >
      <div className="min-w-0 flex-1">
        <p className="font-display text-[17px] leading-tight font-bold tracking-[-.02em]">{label}</p>
        <p className={`mt-0.5 text-[13px] font-semibold ${glass ? 'text-white/80' : 'text-mute'}`}>{hint}</p>
      </div>
      <button type="button" aria-label={`${label}: меньше`} disabled={value <= min} onClick={() => onChange(value - 1)} className={btn}>
        <IconMinus className="size-5.5" />
      </button>
      <output aria-live="polite" className="w-8 text-center font-display text-[26px] leading-none font-black tracking-[-.04em] tabular-nums">
        {value}
      </output>
      <button type="button" aria-label={`${label}: больше`} disabled={value >= max} onClick={() => onChange(value + 1)} className={btn}>
        <IconPlus className="size-5.5" />
      </button>
    </div>
  );
}

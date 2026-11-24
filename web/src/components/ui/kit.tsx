'use client';
// Мелкие общие элементы белых карточек.
import type { ReactNode } from 'react';

export const rowCls = 'flex min-h-14 w-full items-center gap-3 rounded-[20px] bg-tint px-3.5 text-left text-[15px] font-bold active:scale-[.985] disabled:opacity-45 disabled:active:scale-100';
export const iconCls = 'grid size-9 flex-none place-items-center rounded-xl bg-white text-blue-1';
export const inputCls = 'h-13 w-full min-w-0 rounded-2xl bg-tint px-4 text-[16px] font-semibold text-ink outline-none placeholder:text-mute/70 focus-visible:outline-3 focus-visible:outline-blue-1';
export const primaryCls = 'inline-flex min-h-13 w-full items-center justify-center gap-2 rounded-btn bg-blue-1 px-5 font-display text-[15px] font-bold text-white active:scale-[.97] disabled:opacity-45 disabled:active:scale-100';
export const quietCls = 'inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-tint px-4 text-[14px] font-bold text-ink active:scale-[.97] disabled:opacity-45';
export const dangerCls = 'inline-flex min-h-12 w-full items-center justify-center rounded-2xl bg-bad px-4 text-[14px] font-bold text-white active:scale-[.97]';

export const H2 = ({ id, children, right }: { id: string; children: ReactNode; right?: ReactNode }) => (
  <div className="flex items-center justify-between gap-3 px-1 pb-3">
    <h2 id={id} className="font-display text-[19px] leading-tight font-extrabold tracking-[-.02em]">{children}</h2>
    {right}
  </div>
);

export function Switch({ label, hint, checked, onChange, disabled }: { label: string; hint?: string; checked: boolean; onChange(v: boolean): void; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)} className={`${rowCls} py-2.5`}>
      <span className="min-w-0 flex-1">
        <span className="block">{label}</span>
        {hint && <span className="mt-0.5 block text-[13px] leading-snug font-semibold text-mute">{hint}</span>}
      </span>
      <span aria-hidden className={`relative h-7.5 w-12.5 flex-none rounded-full transition-colors ${checked ? 'bg-blue-1' : 'bg-[#C7D2F4]'}`}>
        <i className={`absolute top-0.75 size-6 rounded-full bg-white shadow transition-[left] ${checked ? 'left-5.75' : 'left-0.75'}`} />
      </span>
    </button>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: readonly (readonly [T, string])[]; onChange(v: NoInfer<T>): void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="grid auto-cols-fr grid-flow-col gap-1 rounded-full bg-tint p-1">
      {options.map(([v, text]) => (
        <button key={v} type="button" role="radio" aria-checked={v === value} onClick={() => onChange(v)} className={`min-h-11 rounded-full px-2 text-[14px] font-extrabold transition active:scale-[.97] ${v === value ? 'bg-white text-blue-1 shadow-[0_4px_12px_-4px_rgba(6,18,110,.35)]' : 'text-mute'}`}>{text}</button>
      ))}
    </div>
  );
}

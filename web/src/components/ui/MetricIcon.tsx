// Значок показателя: та же фигурка, что лежит в горе (lib/pieces.ts), одним SVG.
import { useId } from 'react';
import { PIECES, SHAPE_OF } from '@/lib/pieces';
import type { MetricId } from '@/lib/types';

const Grad = ({ id, c }: { id: string; c: readonly [string, string, string] }) => (
  <linearGradient id={id} x1=".15" y1="0" x2=".8" y2="1"><stop offset="0" stopColor={c[0]} /><stop offset=".5" stopColor={c[1]} /><stop offset="1" stopColor={c[2]} /></linearGradient>
);

export function MetricIcon({ m, className = 'size-5' }: { m: MetricId; className?: string }) {
  const id = useId();
  if (m === 'sugar') {
    return (
      <svg viewBox="-56 -56 112 112" className={`flex-none ${className}`} aria-hidden>
        <defs><Grad id={id} c={['#FFFFFF', '#F3F6FF', '#B9C8F7']} /></defs>
        <g transform="rotate(-8)">
          <rect x="-42" y="-42" width="84" height="84" rx="17" fill={`url(#${id})`} stroke="rgba(40,70,190,.28)" strokeWidth="4" />
          <g fill="rgba(110,135,220,.55)"><rect x="-21" y="-19" width="11" height="11" rx="2" /><rect x="9" y="-8" width="11" height="11" rx="2" /><rect x="-13" y="11" width="11" height="11" rx="2" /><rect x="14" y="17" width="9" height="9" rx="2" /></g>
        </g>
      </svg>
    );
  }
  const p = PIECES[SHAPE_OF[m]];
  return (
    <svg viewBox="-56 -56 112 112" className={`flex-none ${className}`} aria-hidden>
      <defs><Grad id={id} c={p.colors} />{p.inner && <Grad id={`${id}i`} c={p.inner.colors} />}</defs>
      <path d={p.body} fill={`url(#${id})`} />
      {p.facets?.map(([d, light], i) => <path key={i} d={d} fill={light > 0 ? `rgba(255,255,255,${light})` : `rgba(196,58,110,${-light})`} />)}
      {p.inner && <path d={p.inner.path} fill={`url(#${id}i)`} />}
      {p.line && <path d={p.line.path} fill="none" stroke={p.line.color} strokeWidth={p.line.width + 2} strokeLinecap="round" />}
      <path d={p.body} fill="none" stroke={p.rim} strokeWidth="3.5" />
    </svg>
  );
}

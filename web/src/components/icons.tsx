// SVG-иконки «Чек-апа» (без эмодзи). Цвет — currentColor.
import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement>;
const stroke = { fill: 'none', stroke: 'currentColor', strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

export const IconCamera = (p: P) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...stroke} strokeWidth={2.2} {...p}>
    <path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.6l1.3-1.9A1.5 1.5 0 0 1 10.6 3.5h2.8a1.5 1.5 0 0 1 1.2.6L15.9 6h1.6A2.5 2.5 0 0 1 20 8.5v8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5z" />
    <circle cx="12" cy="12.5" r="3.6" />
  </svg>
);

export const IconReceipt = (p: P) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...stroke} strokeWidth={2.2} {...p}>
    <path d="M6 3h12v18l-2.4-1.6L13.2 21 12 20.2 10.8 21l-2.4-1.6L6 21z" />
    <path d="M9.5 8h5M9.5 12h5M9.5 16h3" />
  </svg>
);

export const IconChevron = (p: P) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...stroke} strokeWidth={2.4} {...p}>
    <path d="M9 5l7 7-7 7" />
  </svg>
);

export const IconClose = (p: P) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...stroke} strokeWidth={2.4} {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

export const IconInfo = (p: P) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...stroke} strokeWidth={2.4} {...p}>
    <path d="M12 11v6" />
    <circle cx="12" cy="7" r=".6" fill="currentColor" />
  </svg>
);

/** Кубик сахара с крупинками */
export const IconCube = (p: P) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...p}>
    <rect x="3" y="3" width="18" height="18" rx="4.5" fill="currentColor" />
    <g style={{ fill: 'var(--blue-3)' }}>
      <rect x="8" y="8" width="1.6" height="1.6" rx=".5" />
      <rect x="13.5" y="9.5" width="1.6" height="1.6" rx=".5" />
      <rect x="10" y="13.6" width="1.6" height="1.6" rx=".5" />
      <rect x="14.6" y="14.4" width="1.6" height="1.6" rx=".5" />
    </g>
  </svg>
);

// ── навигация и общие действия ──
export const IconBars = (p: P) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...stroke} strokeWidth={2.4} {...p}>
    <path d="M5 20v-7M12 20V5M19 20v-10" />
  </svg>
);

export const IconSearch = (p: P) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...stroke} strokeWidth={2.4} {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M16 16l4.5 4.5" />
  </svg>
);

export const IconUser = (p: P) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...stroke} strokeWidth={2.2} {...p}>
    <circle cx="12" cy="8.5" r="3.8" />
    <path d="M4.500 20c1-3.600 4-5.500 7.500-5.500s6.500 1.900 7.500 5.500" />
  </svg>
);

export const IconPlus = (p: P) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...stroke} strokeWidth={2.6} {...p}>
    <path d="M12 5.500v13M5.500 12h13" />
  </svg>
);

export const IconMinus = (p: P) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...stroke} strokeWidth={2.6} {...p}>
    <path d="M5.500 12h13" />
  </svg>
);

export const IconTrash = (p: P) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...stroke} strokeWidth={2.2} {...p}>
    <path d="M5 7h14M9.500 7V4.500h5V7M7 7l.8 12.500h8.400L17 7M10.500 11v5M13.500 11v5" />
  </svg>
);

export const IconCheck = (p: P) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...stroke} strokeWidth={2.6} {...p}>
    <path d="M6 12.500l4 4 8-9" />
  </svg>
);

export const IconArrow = (p: P) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...stroke} strokeWidth={2.4} {...p}>
    <path d="M5 12h13M13 7l5 5-5 5" />
  </svg>
);

export const IconDownload = (p: P) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...stroke} strokeWidth={2.2} {...p}>
    <path d="M12 4v11M7.500 10.500L12 15l4.500-4.500M5 19.500h14" />
  </svg>
);

// ── значки достижений ──
const BADGE_PATHS = {
  receipt: <><path d="M6 3h12v18l-2.400-1.600L13.200 21 12 20.200 10.800 21l-2.400-1.600L6 21z" /><path d="M9.500 8h5M9.500 12h5" /></>,
  stack: <><rect x="4" y="13.500" width="7" height="7" rx="1.800" /><rect x="13" y="13.500" width="7" height="7" rx="1.800" /><rect x="8.500" y="4.500" width="7" height="7" rx="1.800" /></>,
  swap: <><path d="M4 8.500h13M13.500 5l3.500 3.500-3.500 3.500" /><path d="M20 15.500H7M10.500 12L7 15.500l3.500 3.500" /></>,
  leaf: <><path d="M5 19c0-8 5-13 14-14 0 9-4.500 14-12 14" /><path d="M5 19c2.500-4.500 5.500-7.500 9-9.500" /></>,
  bomb: <><circle cx="10.500" cy="14" r="6" /><path d="M14.500 9.500l2.500-2.500M17 7c.5-2 2-2.500 3.500-2" /></>,
  coin: <><circle cx="12" cy="12" r="8" /><path d="M8.500 8.500h7M12 8.500V16" /></>,
  minus: <><rect x="4" y="4" width="16" height="16" rx="4" /><path d="M8.500 12h7" /></>,
  shield: <><path d="M12 3.500l7 2.500v5.500c0 4.500-3 7.500-7 9-4-1.500-7-4.500-7-9V6z" /><path d="M9 12l2.200 2.200L15 10" /></>,
  crown: <><path d="M4 8l3.500 4L12 5.500 16.500 12 20 8l-1.500 10h-13z" /></>,
} as const;

export type BadgeIconName = keyof typeof BADGE_PATHS;

export const IconBadge = ({ name, ...p }: P & { name: BadgeIconName }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...stroke} strokeWidth={2.1} {...p}>
    {BADGE_PATHS[name]}
  </svg>
);

// Профиль семьи в localStorage. Только для клиентских компонентов.
// От состава семьи зависит норма сахара, с которой сравнивается неделя.
import { CUBE_G, DAILY_G } from './engine';

export type Profile = {
  adults: number;
  kids: number;
  /** онбординг пройден */
  onboarded: boolean;
  /** достижения, о которых уже сообщили */
  seen: string[];
  /** время последней правки (мс) — по нему синхронизация решает, чья версия новее */
  updatedAt: number;
};

/** Ориентир на основе рекомендации ВОЗ (не больше 10% калорий из добавленного сахара). */
export const ADULT_G = DAILY_G;
export const KID_G = 30;
export const MAX_ADULTS = 6;
export const MAX_KIDS = 8;

const KEY = 'chekup.profile';
const DEFAULT: Profile = { adults: 1, kids: 0, onboarded: false, seen: [], updatedAt: 0 };
const listeners = new Set<() => void>();

const clampInt = (v: unknown, min: number, max: number, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.max(min, Math.min(max, Math.round(v))) : fallback;

function parse(raw: string | null): Profile {
  try {
    const p = JSON.parse(raw || 'null') as Partial<Profile> | null;
    if (!p || typeof p !== 'object') return DEFAULT;
    return {
      adults: clampInt(p.adults, 1, MAX_ADULTS, DEFAULT.adults),
      kids: clampInt(p.kids, 0, MAX_KIDS, DEFAULT.kids),
      onboarded: p.onboarded === true,
      seen: Array.isArray(p.seen) ? p.seen.filter((s): s is string => typeof s === 'string') : [],
      updatedAt: clampInt(p.updatedAt, 0, Number.MAX_SAFE_INTEGER, 0),
    };
  } catch {
    return DEFAULT;
  }
}

function rawValue(): string | null {
  try { return localStorage.getItem(KEY); } catch { return null; }
}

let cachedRaw: string | null | undefined;
let cached: Profile = DEFAULT;

export function profileSnapshot(): Profile {
  const raw = rawValue();
  if (raw !== cachedRaw) { cachedRaw = raw; cached = parse(raw); }
  return cached;
}
export const profileServerSnapshot = (): Profile => DEFAULT;

export function subscribeProfile(fn: () => void): () => void {
  listeners.add(fn);
  const onStorage = (e: StorageEvent) => { if (e.key === KEY) fn(); };
  addEventListener('storage', onStorage);
  return () => { listeners.delete(fn); removeEventListener('storage', onStorage); };
}

export const profile = {
  get: (): Profile => parse(rawValue()),
  /**
   * touch=false — правка не считается «новее» чужой: так делаем с `seen` (достижения объединяются при слиянии),
   * иначе устаревшие семья и норма с этого устройства перебили бы свежие с другого.
   */
  update(patch: Partial<Profile>, touch = true): void {
    const cur = parse(rawValue());
    const next = { ...cur, ...patch, updatedAt: touch ? Date.now() : (patch.updatedAt ?? cur.updatedAt) };
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* приватный режим — профиль не сохранится */ }
    // если запись не удалась, держим значение хотя бы в памяти до перезагрузки
    if (rawValue() !== JSON.stringify(next)) { cachedRaw = rawValue(); cached = parse(JSON.stringify(next)); }
    listeners.forEach(fn => fn());
  },
};

/** Норма добавленного сахара на всю семью, г в день. */
export const familyDailyG = (p: Pick<Profile, 'adults' | 'kids'>) => p.adults * ADULT_G + p.kids * KID_G;
/** То же в кубиках. */
export const familyDailyCubes = (p: Pick<Profile, 'adults' | 'kids'>) => Math.round(familyDailyG(p) / CUBE_G);

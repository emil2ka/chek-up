// Профиль: личное (знакомство, достижения, язык) и настройки семьи (состав, цель). Только для клиентских компонентов.
import { dirty } from './dirty';
import { CUBE_G, DAILY_G, METRICS } from './engine';
import { createStore } from './persist';
import type { Lang } from './i18n';
import type { MetricId } from './types';

export type Profile = {
  adults: number;
  kids: number;
  /** личная цель: на сколько процентов меньше сахара; 0 — не выбрана */
  goal: number;
  /** онбординг пройден */
  onboarded: boolean;
  /** достижения, о которых уже сообщили */
  seen: string[];
  lang: Lang;
  /** время правки личного и семейного — по ним сервер решает, чья версия новее */
  updatedAt: number;
  familyAt: number;
};

/** Ориентир на основе рекомендации ВОЗ (не больше 10% калорий из добавленного сахара). */
export const ADULT_G = DAILY_G;
export const KID_G = 30;
export const MAX_ADULTS = 6;
export const MAX_KIDS = 8;

const DEFAULT: Profile = { adults: 1, kids: 0, goal: 0, onboarded: false, seen: [], lang: 'ru', updatedAt: 0, familyAt: 0 };

const int = (v: unknown, min: number, max: number, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.max(min, Math.min(max, Math.round(v))) : fallback;

export function parseProfile(raw: unknown): Profile {
  const p = raw as Partial<Profile> | null;
  if (!p || typeof p !== 'object') return DEFAULT;
  return {
    adults: int(p.adults, 1, MAX_ADULTS, DEFAULT.adults),
    kids: int(p.kids, 0, MAX_KIDS, DEFAULT.kids),
    goal: int(p.goal, 0, 50, 0),
    onboarded: p.onboarded === true,
    seen: Array.isArray(p.seen) ? p.seen.filter((s): s is string => typeof s === 'string').slice(0, 60) : [],
    lang: p.lang === 'kk' ? 'kk' : 'ru',
    updatedAt: int(p.updatedAt, 0, Number.MAX_SAFE_INTEGER, 0),
    // у старых записей было одно время на всё
    familyAt: int(p.familyAt ?? p.updatedAt, 0, Number.MAX_SAFE_INTEGER, 0),
  };
}

const store = createStore<Profile>('chekup.profile', parseProfile, DEFAULT);
export const profileSnapshot = store.get;
export const profileServerSnapshot = store.serverSnapshot;
export const subscribeProfile = store.subscribe;

type FamilyPart = Partial<Pick<Profile, 'adults' | 'kids' | 'goal'>>;
type OwnPart = Partial<Pick<Profile, 'onboarded' | 'seen' | 'lang'>>;

export const profile = {
  get: store.get,
  /** Личные правки. touch=false — не считать правку «новее» чужой (достижения и так объединяются при слиянии). */
  update(patch: OwnPart, touch = true): void {
    const cur = store.get(), at = Date.now();
    const next = { ...cur, ...patch, updatedAt: touch ? at : cur.updatedAt };
    dirty.mark('p', at);
    store.set(next);
  },
  /** Настройки семьи: состав и цель. */
  updateFamily(patch: FamilyPart): void {
    const at = Date.now();
    dirty.mark('f', at);
    store.set(parseProfile({ ...store.get(), ...patch, familyAt: at }));
  },
  /** Принять с сервера то, что здесь не правили. */
  applyRemote(own: (OwnPart & { updatedAt: number }) | null, family: FamilyPart & { updatedAt: number }): void {
    const cur = store.get();
    store.set(parseProfile({
      ...cur,
      ...(own ? { ...(dirty.at('p') === undefined ? own : {}), seen: [...new Set([...cur.seen, ...(own.seen ?? [])])], onboarded: cur.onboarded || !!own.onboarded } : {}),
      ...(dirty.at('f') === undefined ? { adults: family.adults, kids: family.kids, goal: family.goal, familyAt: family.updatedAt } : {}),
    }));
  },
  wipe: store.clear,
};

/** Норма показателя на всю семью в день: сахар, соль, жиры — г, калории — ккал. */
export const familyDaily = (p: Pick<Profile, 'adults' | 'kids'>, m: MetricId) => p.adults * METRICS[m].adult + p.kids * METRICS[m].kid;
/** Норма в кубиках в день (у каждого показателя свой размер кубика). */
export const familyDailyCubesOf = (p: Pick<Profile, 'adults' | 'kids'>, m: MetricId) => Math.round(familyDaily(p, m) / METRICS[m].cubeG);

/** Норма добавленного сахара на всю семью, г в день. */
export const familyDailyG = (p: Pick<Profile, 'adults' | 'kids'>) => familyDaily(p, 'sugar');
/** То же в кубиках. */
export const familyDailyCubes = (p: Pick<Profile, 'adults' | 'kids'>) => Math.round(familyDailyG(p) / CUBE_G);

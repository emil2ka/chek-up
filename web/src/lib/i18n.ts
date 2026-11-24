// Язык интерфейса. Ключ перевода — сама русская строка: t('Мои чеки') → «Менің чектерім» на казахском.
// Нет перевода — остаётся русский (тест src/lib/i18n.test.ts следит, чтобы переводы были у всех строк).
import { KK } from './kk';

export type Lang = 'ru' | 'kk';
let lang: Lang = 'ru';
export const currentLang = (): Lang => lang;
export function setLang(l: Lang): void { lang = l; }

const VAR = /\{(\w+)\}/g;
export function t(ru: string, vars?: Record<string, string | number>): string {
  const s = lang === 'kk' ? KK[ru] ?? ru : ru;
  return vars ? s.replace(VAR, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s;
}

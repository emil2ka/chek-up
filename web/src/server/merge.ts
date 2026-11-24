// Правила слияния при синхронизации: чистые функции без БД (проверяются тестами).
// Чеки, список и недели — «последний записал, тот и прав» по updatedAt; удаления — «надгробия».
// Личный профиль — то же, но список достижений объединяется. Счётчики — берём большее.
import type { HistorySync, ProfileSync, RoleName, StatsSync } from '@/lib/syncSchema';
import type { Receipt } from '@/lib/types';

/** Часы клиента могут спешить: правка «из будущего» иначе побеждала бы вечно. */
export const clampTime = (at: number, now: number): number => Math.min(at, now + 60_000);

export const newer = (incoming: { updatedAt: number }, server: { updatedAt: number } | undefined): boolean => !server || incoming.updatedAt > server.updatedAt;

export function mergeProfile(server: ProfileSync | null, incoming: ProfileSync | undefined): ProfileSync | null {
  if (!incoming) return server;
  if (!server) return incoming;
  const win = incoming.updatedAt > server.updatedAt ? incoming : server;
  return {
    ...win,
    lang: win.lang ?? server.lang,
    onboarded: server.onboarded || incoming.onboarded,
    seen: [...new Set([...server.seen, ...incoming.seen])].slice(0, 60),
    updatedAt: Math.max(server.updatedAt, incoming.updatedAt),
  };
}

export const mergeStats = (a: StatsSync, b: StatsSync | undefined): StatsSync =>
  b ? { ...a, barcodes: Math.max(a.barcodes, b.barcodes), shopDone: Math.max(a.shopDone, b.shopDone) } : a;

export type StoredEntry = HistorySync & { authorId: string | null };

/** Может ли участник записать эту правку чека. */
export function canWriteEntry(role: RoleName, me: string, existing: StoredEntry | undefined): boolean {
  if (!existing) return true;
  if (existing.priv && existing.authorId !== me) return false; // чужой личный чек
  return role !== 'child' || existing.authorId === me;          // ребёнок правит только своё
}

/** Что записать: автор не меняется, «личный» ставит только автор. */
export function nextEntry(incoming: HistorySync, existing: StoredEntry | undefined, me: string, now: number): StoredEntry {
  const authorId = existing ? existing.authorId : me;
  return {
    ...incoming,
    updatedAt: clampTime(incoming.updatedAt, now),
    priv: authorId === me ? !!incoming.priv : !!existing?.priv,
    authorId,
  };
}

/** Видит ли участник чек. */
export const canSee = (me: string, e: { priv?: boolean; authorId: string | null }): boolean => !e.priv || e.authorId === me;

/** Чужой чек глазами ребёнка: без цен и алкоголя. Индексы позиций сохраняются. */
export function maskReceipt(r: Receipt): Receipt {
  const rest = { ...r };
  delete rest.sum;
  return {
    ...rest,
    masked: true,
    items: r.items.map(it => (it.x === 'alcohol'
      ? { n: 'Скрыто', p: 0, s: 0, nf: 1 as const }
      : { ...it, p: 0, ...(it.swap ? { swap: { ...it.swap, p: 0 } } : {}) })),
  };
}

// Слияние состояний при синхронизации: чистые функции без БД (проверяются тестами).
// Правило для чеков и списка — «последний записал, тот и прав» по updatedAt; удаления — «надгробия».
// Профиль: то же, но список полученных достижений объединяется. Счётчики: берём большее.
import type { HistorySync, ProfileSync, ShopSync, StatsSync, SyncRequest, SyncState } from '@/lib/syncSchema';

export const HISTORY_KEEP = 200;
export const TOMBSTONE_DAYS = 30;

export const EMPTY_STATE: SyncState = { profile: null, history: [], shop: [], stats: { barcodes: 0, shopDone: 0 } };

function mergeByKey<T extends { updatedAt: number }>(server: T[], incoming: T[] | undefined, key: (t: T) => string): T[] {
  const map = new Map(server.map(t => [key(t), t]));
  for (const t of incoming ?? []) {
    const have = map.get(key(t));
    // равное время — оставляем серверную версию, чтобы ответ был одинаков для всех устройств
    if (!have || t.updatedAt > have.updatedAt) map.set(key(t), t);
  }
  return [...map.values()];
}

export function mergeProfile(server: ProfileSync | null, incoming: ProfileSync | undefined): ProfileSync | null {
  if (!incoming) return server;
  if (!server) return incoming;
  const newer = incoming.updatedAt > server.updatedAt ? incoming : server;
  return { ...newer, seen: [...new Set([...server.seen, ...incoming.seen])], updatedAt: Math.max(server.updatedAt, incoming.updatedAt) };
}

export const mergeStats = (a: StatsSync, b: StatsSync | undefined): StatsSync =>
  b ? { barcodes: Math.max(a.barcodes, b.barcodes), shopDone: Math.max(a.shopDone, b.shopDone) } : a;

export function mergeState(server: SyncState, req: SyncRequest, now = Date.now()): SyncState {
  const cutoff = now - TOMBSTONE_DAYS * 86_400_000;
  const alive = <T extends { updatedAt: number; deleted?: boolean }>(t: T) => !t.deleted || t.updatedAt >= cutoff;

  const history = mergeByKey<HistorySync>(server.history, req.history, h => h.id)
    .filter(alive)
    .sort((a, b) => b.updatedAt - a.updatedAt);
  // лимит считаем только по живым чекам; «надгробия» хранятся отдельно и недолго
  let kept = 0;
  const trimmed = history.filter(h => h.deleted || ++kept <= HISTORY_KEEP);

  return {
    profile: mergeProfile(server.profile, req.profile),
    history: trimmed,
    shop: mergeByKey<ShopSync>(server.shop, req.shop, s => s.name).filter(alive),
    stats: mergeStats(server.stats, req.stats),
  };
}

/** Что именно нужно записать в БД: изменившиеся строки и ключи тех, что пропали. */
export function diffState(before: SyncState, after: SyncState) {
  const changed = <T extends { updatedAt: number; deleted?: boolean }>(a: T[], b: T[], key: (t: T) => string) => {
    const old = new Map(a.map(t => [key(t), t]));
    return {
      upsert: b.filter(t => {
        const o = old.get(key(t));
        return !o || o.updatedAt !== t.updatedAt || !!o.deleted !== !!t.deleted;
      }),
      removed: a.filter(t => !b.some(x => key(x) === key(t))),
    };
  };
  return {
    history: changed(before.history, after.history, h => h.id),
    shop: changed(before.shop, after.shop, s => s.name),
    profile: JSON.stringify(before.profile) !== JSON.stringify(after.profile) ? after.profile : undefined,
    stats: before.stats.barcodes !== after.stats.barcodes || before.stats.shopDone !== after.stats.shopDone ? after.stats : undefined,
  };
}

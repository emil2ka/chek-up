// История чеков в localStorage. Только для клиентских компонентов.
// Запись: { id, receiptId, store, date, cubes, score, swaps, savedAt }
// Не больше 20 записей, новые и только что обновлённые — сверху.
import type { HistoryEntry } from './types';

const KEY = 'chekup.history';
const TOMB = 'chekup.tomb'; // id удалённых чеков и время удаления — чтобы удаление доехало до других устройств
const LIMIT = 20;

const isEntry = (r: unknown): r is HistoryEntry =>
  !!r && typeof r === 'object' && typeof (r as HistoryEntry).id === 'string' && typeof (r as HistoryEntry).receiptId === 'string';

const EMPTY: HistoryEntry[] = [];
const listeners = new Set<() => void>();

function rawValue(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function parse(raw: string | null): HistoryEntry[] {
  try {
    const list: unknown = JSON.parse(raw || '[]');
    return Array.isArray(list) ? list.filter(isEntry) : EMPTY;
  } catch {
    return EMPTY;
  }
}

const read = (): HistoryEntry[] => parse(rawValue());

function write(list: HistoryEntry[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, LIMIT)));
  } catch {
    /* приватный режим или переполнение — история просто не сохранится */
  }
  listeners.forEach(fn => fn());
}

/** Удалённые чеки: id → время удаления (мс). */
export function tombstones(): Record<string, number> {
  try {
    const t: unknown = JSON.parse(localStorage.getItem(TOMB) || '{}');
    if (!t || typeof t !== 'object') return {};
    return Object.fromEntries(Object.entries(t).filter((e): e is [string, number] => typeof e[1] === 'number'));
  } catch {
    return {};
  }
}
function writeTombstones(t: Record<string, number>): void {
  try { localStorage.setItem(TOMB, JSON.stringify(t)); } catch { /* приватный режим */ }
}

// ── Подписка для useSyncExternalStore: на сервере и при гидратации история пустая ──
let cachedRaw: string | null | undefined;
let cachedList: HistoryEntry[] = EMPTY;

export function historySnapshot(): HistoryEntry[] {
  const raw = rawValue();
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedList = parse(raw);
  }
  return cachedList;
}

export const historyServerSnapshot = (): HistoryEntry[] => EMPTY;

export function subscribeHistory(fn: () => void): () => void {
  listeners.add(fn);
  const onStorage = (e: StorageEvent) => { if (e.key === KEY) fn(); };
  addEventListener('storage', onStorage);
  return () => {
    listeners.delete(fn);
    removeEventListener('storage', onStorage);
  };
}

export const history = {
  all: (): HistoryEntry[] => read(),

  get: (id: string): HistoryEntry | null => read().find(r => r.id === id) ?? null,

  /** Запись для того же чека (повторное открытие обновляет её, а не плодит новую). */
  findByReceipt: (receiptId: string): HistoryEntry | null => read().find(r => r.receiptId === receiptId) ?? null,

  newId: (): string => 'h' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),

  /** Сохранить или обновить запись; она поднимается наверх списка. */
  save(entry: Omit<HistoryEntry, 'savedAt'>): HistoryEntry {
    const rec: HistoryEntry = {
      id: entry.id,
      receiptId: entry.receiptId,
      store: entry.store,
      date: entry.date,
      cubes: entry.cubes,
      score: entry.score,
      swaps: [...entry.swaps],
      savedAt: Date.now(),
      ...(entry.receipt ? { receipt: entry.receipt } : {}),
    };
    const t = tombstones();
    if (rec.id in t) { delete t[rec.id]; writeTombstones(t); }
    write([rec, ...read().filter(r => r.id !== rec.id)]);
    return rec;
  },

  remove(id: string): void {
    writeTombstones({ ...tombstones(), [id]: Date.now() });
    write(read().filter(r => r.id !== id));
  },

  clear(): void {
    const now = Date.now();
    writeTombstones({ ...tombstones(), ...Object.fromEntries(read().map(r => [r.id, now])) });
    write([]);
  },

  /** Принять состояние с сервера (синхронизация): записи и «надгробия» заменяются как есть. */
  replaceAll(list: HistoryEntry[], tombs: Record<string, number>): void {
    writeTombstones(tombs);
    write(list);
  },
};

// Журнал чеков в localStorage. Только для клиентских компонентов. Новые и только что обновлённые — сверху.
// Полная история живёт на сервере; если на устройстве кончилось место, выбрасываем самые старые уже сохранённые там чеки.
import { dirty } from './dirty';
import type { HistoryEntry } from './types';

const KEY = 'chekup.history';
const TOMB = 'chekup.tomb'; // удалённые здесь чеки, о которых сервер ещё не знает: id → время

const isEntry = (r: unknown): r is HistoryEntry =>
  !!r && typeof r === 'object' && typeof (r as HistoryEntry).id === 'string' && typeof (r as HistoryEntry).receiptId === 'string'
  && typeof (r as HistoryEntry).date === 'string' && Array.isArray((r as HistoryEntry).swaps);

const EMPTY: HistoryEntry[] = [];
const listeners = new Set<() => void>();

function rawValue(): string | null {
  try { return localStorage.getItem(KEY); } catch { return null; }
}

function parse(raw: string | null): HistoryEntry[] {
  try {
    const list: unknown = JSON.parse(raw || '[]');
    return Array.isArray(list) ? list.filter(isEntry) : EMPTY;
  } catch {
    return EMPTY;
  }
}

let cachedRaw: string | null | undefined;
let cachedList: HistoryEntry[] = EMPTY;
let volatile = false;

export function historySnapshot(): HistoryEntry[] {
  if (volatile) return cachedList;
  const raw = rawValue();
  if (raw !== cachedRaw) { cachedRaw = raw; cachedList = parse(raw); }
  return cachedList;
}
const read = historySnapshot;

function write(list: HistoryEntry[]): void {
  let keep = list;
  for (;;) {
    const raw = JSON.stringify(keep);
    try {
      localStorage.setItem(KEY, raw);
      volatile = false; cachedRaw = raw; cachedList = keep;
      break;
    } catch {
      // место кончилось: старые чеки, которые уже есть на сервере, можно не держать здесь
      const spare = [...keep].sort((a, b) => a.date.localeCompare(b.date)).filter(e => dirty.at(`h:${e.id}`) === undefined).slice(0, Math.max(1, Math.ceil(keep.length / 10)));
      if (!spare.length || keep.length <= 20) { volatile = true; cachedList = list; break; }
      const drop = new Set(spare.map(e => e.id));
      keep = keep.filter(e => !drop.has(e.id));
    }
  }
  listeners.forEach(fn => fn());
}

/** Удалённые чеки, о которых ещё не знает сервер. */
export function tombstones(): Record<string, number> {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(TOMB) || '{}');
    if (!v || typeof v !== 'object') return {};
    return Object.fromEntries(Object.entries(v).filter((e): e is [string, number] => typeof e[1] === 'number'));
  } catch {
    return {};
  }
}
function writeTombstones(v: Record<string, number>): void {
  try { localStorage.setItem(TOMB, JSON.stringify(v)); } catch { /* приватный режим */ }
}

export const historyServerSnapshot = (): HistoryEntry[] => EMPTY;

export function subscribeHistory(fn: () => void): () => void {
  listeners.add(fn);
  const onStorage = (e: StorageEvent) => { if (e.key === KEY || e.key === null) fn(); };
  addEventListener('storage', onStorage);
  return () => { listeners.delete(fn); removeEventListener('storage', onStorage); };
}

/** Время правки строго растёт, даже если две правки попали в одну миллисекунду. */
let lastAt = 0;
const stamp = (): number => (lastAt = Math.max(Date.now(), lastAt + 1));

export const history = {
  all: (): HistoryEntry[] => read(),
  get: (id: string): HistoryEntry | null => read().find(r => r.id === id) ?? null,
  findByReceipt: (receiptId: string): HistoryEntry | null => read().find(r => r.receiptId === receiptId) ?? null,
  newId: (): string => 'h' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),

  /** Сохранить или обновить запись; она поднимается наверх списка. */
  save(entry: Omit<HistoryEntry, 'savedAt'>): HistoryEntry {
    const rec: HistoryEntry = { ...entry, swaps: [...entry.swaps], savedAt: stamp() };
    const tomb = tombstones();
    if (rec.id in tomb) { delete tomb[rec.id]; writeTombstones(tomb); }
    dirty.mark(`h:${rec.id}`, rec.savedAt);
    write([rec, ...read().filter(r => r.id !== rec.id)]);
    return rec;
  },

  /** Изменить поля записи. null — записи уже нет. */
  patch(id: string, change: Partial<Omit<HistoryEntry, 'id' | 'savedAt'>>): HistoryEntry | null {
    const cur = history.get(id);
    return cur ? history.save({ ...cur, ...change }) : null;
  },

  remove(id: string): void {
    const at = stamp();
    writeTombstones({ ...tombstones(), [id]: at });
    dirty.mark(`h:${id}`, at);
    write(read().filter(r => r.id !== id));
  },

  clear(): void {
    const at = stamp();
    writeTombstones({ ...tombstones(), ...Object.fromEntries(read().map(r => [r.id, at])) });
    for (const r of read()) dirty.mark(`h:${r.id}`, at);
    write([]);
  },

  /** Принять изменения с сервера. full — это полное состояние: чего в нём нет и что не правили здесь, исчезает. */
  applyRemote(list: HistoryEntry[], removed: string[], full: boolean): void {
    const own = (id: string) => dirty.at(`h:${id}`);
    const incoming = new Map(list.map(e => [e.id, e]));
    const gone = new Set(removed);
    const kept = read().filter(e => own(e.id) !== undefined || (!gone.has(e.id) && !incoming.has(e.id) && !full));
    const keptIds = new Set(kept.map(e => e.id));
    const tomb = tombstones();
    const added = list.filter(e => !keptIds.has(e.id) && !(e.id in tomb));
    write([...kept, ...added].sort((a, b) => b.savedAt - a.savedAt));
  },

  /** Сервер подтвердил удаления. */
  ackTombstones(ids: string[]): void {
    const tomb = tombstones();
    for (const id of ids) if (dirty.at(`h:${id}`) === undefined) delete tomb[id];
    writeTombstones(tomb);
  },

  /** Стереть всё на устройстве (выход из аккаунта), ничего не отправляя. */
  wipe(): void { writeTombstones({}); write([]); },
};

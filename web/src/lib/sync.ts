// Синхронизация веб-версии с общим сервером и БД «Чек-апа» (тот же аккаунт, что у мобильного приложения).
// Только для клиента. Без входа ничего не меняется: приложение работает от localStorage, как раньше.
// Каждый запрос шлёт полное локальное состояние, сервер сливает его со своим («последний записал — прав»)
// и отвечает итогом. Удаления передаются «надгробиями». Контракт — src/lib/syncSchema.ts.
import { history, subscribeHistory, tombstones } from './store';
import { profile, subscribeProfile } from './profile';
import { SyncRequestSchema, type SyncRequest } from './syncSchema';
import type { HistoryEntry } from './types';

const AUTH_KEY = 'chekup.auth';
const LIMIT = 20;

type Auth = { token: string; userId: string };
export type SyncInfo = { status: 'idle' | 'syncing' | 'error'; error: string; lastSync: number };

export class SyncError extends Error {
  constructor(readonly code: string, message: string, readonly httpStatus = 0) {
    super(message);
  }
}

// ── состояние для useSyncExternalStore ──
let info: SyncInfo = { status: 'idle', error: '', lastSync: 0 };
const listeners = new Set<() => void>();
const set = (next: Partial<SyncInfo>) => { info = { ...info, ...next }; listeners.forEach(fn => fn()); };
export const syncInfoSnapshot = (): SyncInfo => info;
export const syncInfoServerSnapshot = (): SyncInfo => ({ status: 'idle', error: '', lastSync: 0 });
export function subscribeSyncInfo(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

// ── токен устройства ──
function readAuth(): Auth | null {
  try {
    const a: unknown = JSON.parse(localStorage.getItem(AUTH_KEY) || 'null');
    const o = a as Partial<Auth> | null;
    return o && typeof o.token === 'string' && typeof o.userId === 'string' ? { token: o.token, userId: o.userId } : null;
  } catch {
    return null;
  }
}
function saveAuth(a: Auth): Auth {
  try { localStorage.setItem(AUTH_KEY, JSON.stringify(a)); } catch { /* приватный режим: токен проживёт до перезагрузки в памяти */ }
  memAuth = a;
  return a;
}
let memAuth: Auth | null = null;
const currentAuth = () => memAuth ?? readAuth();

async function call(path: string, init: { method?: string; token?: string; body?: unknown } = {}): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: init.method ?? 'POST',
      headers: { 'content-type': 'application/json', ...(init.token ? { authorization: `Bearer ${init.token}` } : {}) },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      cache: 'no-store',
    });
  } catch {
    throw new SyncError('offline', 'Нет связи с сервером Чек-апа');
  }
  let data: unknown = null;
  try { data = await res.json(); } catch { /* пусто */ }
  if (res.ok) return data;
  const e = (data as { error?: { code?: string; message?: string } } | null)?.error;
  throw new SyncError(e?.code ?? 'error', e?.message ?? `Сервер ответил ошибкой (${res.status})`, res.status);
}

async function register(): Promise<Auth> {
  return saveAuth((await call('/api/auth/anonymous', { body: { label: 'web' } })) as Auth);
}

// ── что отправляем и как принимаем ──
function snapshot(): SyncRequest {
  const p = profile.get();
  const now = tombstones();
  return {
    profile: { adults: p.adults, kids: p.kids, onboarded: p.onboarded, seen: p.seen, updatedAt: p.updatedAt },
    history: [
      ...history.all().map(e => ({
        id: e.id, receiptId: e.receiptId, store: e.store, date: e.date, cubes: e.cubes, score: e.score,
        swaps: e.swaps, receipt: e.receipt ?? null, updatedAt: e.savedAt,
      })),
      ...Object.entries(now).map(([id, updatedAt]) => ({
        id, receiptId: 'deleted', store: '', date: '', cubes: 0, score: 0, swaps: [] as number[], updatedAt, deleted: true,
      })),
    ],
    // список покупок и счётчики в веб-версии пока не ведутся — их не трогаем (сервер хранит то, что прислало приложение)
  };
}

let applying = false;
function apply(state: SyncRequest): void {
  applying = true;
  try {
    if (state.profile) profile.update(state.profile, false);
    const tombs: Record<string, number> = {};
    const alive: HistoryEntry[] = [];
    for (const h of state.history ?? []) {
      if (h.deleted) { tombs[h.id] = h.updatedAt; continue; }
      alive.push({
        id: h.id, receiptId: h.receiptId, store: h.store, date: h.date, cubes: h.cubes, score: h.score,
        swaps: h.swaps, savedAt: h.updatedAt, ...(h.receipt ? { receipt: h.receipt } : {}),
      });
    }
    alive.sort((a, b) => b.savedAt - a.savedAt);
    history.replaceAll(alive.slice(0, LIMIT), tombs);
  } finally {
    applying = false;
  }
}

// ── один проход «отдать и забрать» ──
let rev = 0;
let again = false;
let inFlight: Promise<void> | null = null;
let retry: ReturnType<typeof setTimeout> | undefined;

async function cycle(): Promise<void> {
  set({ status: 'syncing' });
  try {
    let auth = currentAuth() ?? (await register());
    const sent = rev;
    const body = snapshot();
    let raw: unknown;
    try {
      raw = await call('/api/sync', { token: auth.token, body });
    } catch (e) {
      if (!(e instanceof SyncError) || e.httpStatus !== 401) throw e;
      auth = await register(); // сервер не знает токен (БД пересоздали) — заводим новый аккаунт, данные остаются у нас
      raw = await call('/api/sync', { token: auth.token, body });
    }
    const parsed = SyncRequestSchema.safeParse(raw);
    if (!parsed.success) throw new SyncError('bad_response', 'Ответ сервера не по схеме');
    if (sent === rev) apply(parsed.data);
    else again = true; // пока шёл запрос, данные поменялись — ответ устарел, повторим
    set({ status: 'idle', error: '', lastSync: Date.now() });
  } catch (e) {
    again = false; // без сети не крутимся в цикле: повторим позже
    set({ status: 'error', error: e instanceof SyncError ? e.message : 'Не получилось синхронизировать' });
    clearTimeout(retry);
    retry = setTimeout(() => { void syncNow(); }, 30_000);
  }
}

/** Когда Promise завершился, правки, сделанные до вызова, уже на сервере (или показана ошибка). */
export function syncNow(): Promise<void> {
  if (inFlight) { again = true; return inFlight; }
  inFlight = (async () => {
    try {
      do { again = false; await cycle(); } while (again);
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

/** Запуск: первая синхронизация, затем после каждой правки (с паузой) и при возвращении на вкладку. Возвращает отписку. */
export function startSync(): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const soon = (ms = 1500) => { clearTimeout(timer); timer = setTimeout(() => { void syncNow(); }, ms); };
  const onChange = () => { if (!applying) { rev++; soon(); } };
  const offH = subscribeHistory(onChange);
  const offP = subscribeProfile(onChange);
  const onVisible = () => { if (document.visibilityState === 'visible') soon(300); };
  document.addEventListener('visibilitychange', onVisible);
  soon(0);
  return () => {
    clearTimeout(timer);
    clearTimeout(retry);
    offH(); offP();
    document.removeEventListener('visibilitychange', onVisible);
  };
}

// ── связывание устройств ──
/** Короткий код для входа в этот аккаунт с другого устройства (живёт 10 минут). */
export async function createLinkCode(): Promise<string> {
  const auth = currentAuth() ?? (await register());
  const r = (await call('/api/auth/link', { token: auth.token })) as { code: string };
  return r.code;
}

/** Войти в аккаунт другого устройства по его коду: локальные данные сольются с общими. */
export async function redeemLinkCode(code: string): Promise<void> {
  saveAuth((await call('/api/auth/link/redeem', { body: { code, label: 'web' } })) as Auth);
  rev++;
  await syncNow();
}

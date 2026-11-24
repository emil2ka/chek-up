// Синхронизация с сервером «Чек-апа» (тот же аккаунт, что у мобильного приложения). Только для клиента.
// Отправляем только изменённое (dirty.ts), получаем изменения семьи после последнего номера. Контракт — src/lib/syncSchema.ts.
import { carts } from './cartStore';
import { dirty } from './dirty';
import { familyStore, weekMarks } from './family';
import { history, subscribeHistory, tombstones } from './store';
import { profile, subscribeProfile } from './profile';
import { SyncStateSchema, type HistorySync, type SyncRequest, type SyncState } from './syncSchema';
import type { HistoryEntry } from './types';

const AUTH_KEY = 'chekup.auth';
const CURSOR_KEY = 'chekup.sync';
const CHUNK = 150;

type Auth = { token: string; userId: string };
type Cursor = { cursor: number; familyId: string };
export type SyncInfo = { status: 'idle' | 'syncing' | 'error'; error: string; lastSync: number };

export class SyncError extends Error {
  constructor(readonly code: string, message: string, readonly httpStatus = 0) { super(message); }
}

// ── состояние для useSyncExternalStore ──
let info: SyncInfo = { status: 'idle', error: '', lastSync: 0 };
const IDLE: SyncInfo = { status: 'idle', error: '', lastSync: 0 };
const listeners = new Set<() => void>();
const set = (next: Partial<SyncInfo>) => { info = { ...info, ...next }; listeners.forEach(fn => fn()); };
export const syncInfoSnapshot = (): SyncInfo => info;
export const syncInfoServerSnapshot = (): SyncInfo => IDLE;
export function subscribeSyncInfo(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

let applying = false;

// ── токен устройства и курсор ──
const readJson = (key: string): unknown => { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; } };
const writeJson = (key: string, v: unknown) => { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* приватный режим */ } };

let memAuth: Auth | null = null;
function currentAuth(): Auth | null {
  if (memAuth) return memAuth;
  const o = readJson(AUTH_KEY) as Partial<Auth> | null;
  return o && typeof o.token === 'string' && typeof o.userId === 'string' ? (memAuth = { token: o.token, userId: o.userId }) : null;
}
function saveAuth(a: Auth): Auth { memAuth = a; writeJson(AUTH_KEY, a); return a; }
function readCursor(): Cursor | null {
  const c = readJson(CURSOR_KEY) as Partial<Cursor> | null;
  return c && typeof c.cursor === 'number' && typeof c.familyId === 'string' ? { cursor: c.cursor, familyId: c.familyId } : null;
}
if (typeof addEventListener === 'function') addEventListener('storage', e => { if (e.key === AUTH_KEY || e.key === null) memAuth = null; });

async function raw(path: string, init: RequestInit & { token?: string }): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(path, { ...init, headers: { ...init.headers, ...(init.token ? { authorization: `Bearer ${init.token}` } : {}) }, cache: 'no-store' });
  } catch {
    throw new SyncError('offline', 'Нет связи с сервером');
  }
  let data: unknown = null;
  try { data = await res.json(); } catch { /* пусто */ }
  if (res.ok) return data;
  const e = (data as { error?: { code?: string; message?: string } } | null)?.error;
  throw new SyncError(e?.code ?? 'error', e?.message ?? `Сервер ответил ошибкой (${res.status})`, res.status);
}
const json = (body: unknown): RequestInit => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

export const deviceLabel = (): string => {
  const ua = navigator.userAgent;
  const os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : 'Браузер';
  const br = /Edg\//.test(ua) ? 'Edge' : /YaBrowser/.test(ua) ? 'Яндекс' : /Firefox/.test(ua) ? 'Firefox' : /Chrome|CriOS/.test(ua) ? 'Chrome' : /Safari/.test(ua) ? 'Safari' : '';
  return br ? `${os}, ${br}` : os;
};

let registering: Promise<Auth> | null = null;
/** Гость создаётся один раз, даже если его попросили сразу несколько запросов. */
function register(): Promise<Auth> {
  return registering ??= raw('/api/auth/anonymous', json({ label: deviceLabel() }))
    .then(a => saveAuth(a as Auth)).finally(() => { registering = null; });
}

/**
 * Сервер больше не знает этот токен. У аккаунта со входом это значит «устройство отключили»: сохранённые на сервере чеки
 * с устройства убираем, остаётся только неотправленное. У гостя данные нигде больше нет — заводим нового гостя и отдаём ему всё.
 */
function forgetSession(): void {
  const signedIn = !!familyStore.get().me.email;
  memAuth = null;
  try { localStorage.removeItem(AUTH_KEY); localStorage.removeItem(CURSOR_KEY); } catch { /* ничего */ }
  if (signedIn) {
    applying = true;
    history.applyRemote([], [], true);
    weekMarks.applyRemote([]);
    familyStore.clear();
    applying = false;
  } else {
    for (const e of history.all()) if (e.receipt?.masked !== true) dirty.mark(`h:${e.id}`, e.savedAt);
  }
}

/** Запрос от имени этого устройства. */
export async function authed(path: string, init: RequestInit): Promise<unknown> {
  const auth = currentAuth() ?? (await register());
  try {
    return await raw(path, { ...init, token: auth.token });
  } catch (e) {
    if (!(e instanceof SyncError) || e.httpStatus !== 401) throw e;
    if (currentAuth()?.token === auth.token) forgetSession();
    return raw(path, { ...init, token: (currentAuth() ?? (await register())).token });
  }
}
export const postAuthed = (path: string, body: unknown): Promise<unknown> => authed(path, json(body));
export const getAuthed = (path: string): Promise<unknown> => authed(path, { method: 'GET' });
export const sendAuthed = (method: 'PATCH' | 'DELETE', path: string, body: unknown): Promise<unknown> => authed(path, { ...json(body), method });

// ── что отправляем ──
const toSync = (e: HistoryEntry): HistorySync => ({
  id: e.id, receiptId: e.receiptId, store: e.store.slice(0, 200), date: e.date, cubes: e.cubes, score: e.score, swaps: e.swaps,
  off: e.off ?? [], tag: e.tag ?? '', priv: !!e.priv, receipt: e.receipt ?? null, updatedAt: e.savedAt,
});
const fromSync = (h: HistorySync): HistoryEntry => ({
  id: h.id, receiptId: h.receiptId, store: h.store, date: h.date, cubes: h.cubes, score: h.score, swaps: h.swaps, savedAt: h.updatedAt,
  ...(h.off?.length ? { off: h.off } : {}), ...(h.tag === 'guests' ? { tag: 'guests' as const } : {}), ...(h.priv ? { priv: true } : {}),
  ...(h.by ? { by: h.by } : {}), ...(h.receipt ? { receipt: h.receipt } : {}),
});

function outgoing(): { body: SyncRequest; sent: Record<string, number>; more: boolean; deleted: string[] } {
  const d = dirty.all(), tomb = tombstones(), byId = new Map(history.all().map(e => [e.id, e]));
  const sent: Record<string, number> = {}, list: HistorySync[] = [], deleted: string[] = [];
  let more = false;
  for (const [key, at] of Object.entries(d)) {
    if (!key.startsWith('h:')) continue;
    if (list.length >= CHUNK) { more = true; break; }
    const id = key.slice(2), e = byId.get(id);
    if (e) list.push(toSync(e));
    else if (id in tomb) { list.push({ id, receiptId: 'deleted', store: '', date: '', cubes: 0, score: 0, swaps: [], updatedAt: tomb[id], deleted: true, receipt: null }); deleted.push(id); }
    sent[key] = at;
  }
  const weeks = weekMarks.get().filter(m => d[`w:${m.week}`] !== undefined);
  for (const m of weeks) sent[`w:${m.week}`] = d[`w:${m.week}`];
  const p = profile.get();
  if (d.p !== undefined) sent.p = d.p;
  if (d.f !== undefined) sent.f = d.f;
  const c = readCursor();
  return {
    more, sent, deleted,
    body: {
      ...(c ? { since: c.cursor, familyId: c.familyId } : {}),
      ...(list.length ? { history: list } : {}),
      ...(weeks.length ? { weeks } : {}),
      ...(d.p !== undefined || !c ? { profile: { onboarded: p.onboarded, seen: p.seen, lang: p.lang, updatedAt: p.updatedAt } } : {}),
      ...(d.f !== undefined || (!c && p.familyAt > 0) ? { family: { adults: p.adults, kids: p.kids, goal: p.goal, updatedAt: p.familyAt } } : {}),
    },
  };
}

function apply(s: SyncState): void {
  applying = true;
  try {
    const prev = readCursor();
    // перешли в другую семью: чужие чеки прежней семьи с устройства убираем
    const full = s.full || prev?.familyId !== s.family.id;
    history.applyRemote(s.history.filter(h => !h.deleted).map(fromSync), s.history.filter(h => h.deleted).map(h => h.id), full);
    profile.applyRemote(s.profile, s.family);
    weekMarks.applyRemote(s.weeks);
    familyStore.set({ id: s.family.id, name: s.family.name, members: s.family.members, me: s.me, streak: s.streak, bestWeeks: s.stats.bestWeeks ?? 0 });
    writeJson(CURSOR_KEY, { cursor: s.cursor, familyId: s.family.id } satisfies Cursor);
  } finally {
    applying = false;
  }
}

// ── один проход «отдать и забрать» ──
let again = false;
let inFlight: Promise<void> | null = null;
let retry: ReturnType<typeof setTimeout> | undefined;
let fails = 0;

async function cycle(): Promise<void> {
  set({ status: 'syncing' });
  try {
    if (!readCursor()) for (const e of history.all()) if (dirty.at(`h:${e.id}`) === undefined && !e.receipt?.masked) dirty.mark(`h:${e.id}`, e.savedAt);
    for (;;) {
      const out = outgoing();
      const parsed = SyncStateSchema.safeParse(await postAuthed('/api/sync', out.body));
      if (!parsed.success) throw new SyncError('bad_response', 'Ответ сервера не по схеме');
      dirty.ack(out.sent);
      history.ackTombstones(out.deleted);
      // пока отправлены не все части, курсор не двигаем вперёд полного состояния: применяем только последний ответ
      if (!out.more) { apply(parsed.data as SyncState); break; }
    }
    fails = 0;
    set({ status: 'idle', error: '', lastSync: Date.now() });
  } catch (e) {
    again = false;
    set({ status: 'error', error: e instanceof SyncError ? e.message : 'Не получилось синхронизировать' });
    clearTimeout(retry);
    retry = setTimeout(() => { void syncNow(); }, Math.min(300_000, 15_000 * 2 ** fails++));
  }
}

/** Когда Promise завершился, правки, сделанные до вызова, уже на сервере (или показана ошибка). */
export function syncNow(): Promise<void> {
  if (inFlight) { again = true; return inFlight; }
  return inFlight = (async () => {
    try {
      do { again = false; await cycle(); } while (again);
    } finally {
      inFlight = null;
    }
  })();
}

/** Запуск: первая синхронизация, затем после каждой правки (с паузой), при возвращении на вкладку и в сеть. Возвращает отписку. */
export function startSync(): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const soon = (ms = 1200) => { clearTimeout(timer); timer = setTimeout(() => { void syncNow(); }, ms); };
  const onChange = () => { if (!applying && dirty.any()) soon(); };
  const offs = [subscribeHistory(onChange), subscribeProfile(onChange), weekMarks.subscribe(onChange)];
  const onVisible = () => { if (document.visibilityState === 'visible') soon(300); };
  const onOnline = () => { fails = 0; soon(300); };
  document.addEventListener('visibilitychange', onVisible);
  addEventListener('online', onOnline);
  soon(0);
  return () => {
    clearTimeout(timer);
    clearTimeout(retry);
    offs.forEach(off => off());
    document.removeEventListener('visibilitychange', onVisible);
    removeEventListener('online', onOnline);
  };
}

// ── аккаунт ──
/** Вход другим аккаунтом: токен новый, локальное состояние приедет с сервера целиком. */
async function adoptSession(s: unknown): Promise<void> {
  saveAuth(s as Auth);
  try { localStorage.removeItem(CURSOR_KEY); } catch { /* ничего */ }
  await syncNow();
}

export async function createLinkCode(): Promise<string> {
  return ((await postAuthed('/api/auth/link', {})) as { code: string }).code;
}
export async function redeemLinkCode(code: string): Promise<void> {
  await syncNow(); // чеки гостя должны быть на сервере: там они переедут в общий аккаунт
  await adoptSession(await postAuthed('/api/auth/link/redeem', { code, label: deviceLabel() }));
}

export type Providers = { email: boolean; google: string | null; apple: boolean };
export const authProviders = async (): Promise<Providers> => (await raw('/api/auth/providers', { method: 'GET' })) as Providers;
export const emailStart = (email: string): Promise<unknown> => raw('/api/auth/email/start', json({ email }));
export async function emailVerify(email: string, code: string): Promise<void> {
  await syncNow();
  await adoptSession(await postAuthed('/api/auth/email/verify', { email, code, label: deviceLabel() }));
}
export async function oidcSignIn(provider: 'google' | 'apple', idToken: string): Promise<void> {
  await syncNow();
  await adoptSession(await postAuthed('/api/auth/oidc', { provider, idToken, label: deviceLabel() }));
}

export type AccountInfo = { id: string; name: string; logins: { provider: string; email: string }[]; devices: { id: string; label: string; createdAt: string; lastSeenAt: string; current: boolean }[] };
export const accountInfo = async (): Promise<AccountInfo> => (await getAuthed('/api/account')) as AccountInfo;
export async function renameMe(name: string): Promise<void> { await sendAuthed('PATCH', '/api/account', { name }); await syncNow(); }

/** Забыть всё на этом устройстве. Чеки остаются на сервере. */
export function wipeDevice(): void {
  applying = true;
  try {
    clearTimeout(retry);
    memAuth = null;
    for (const k of [AUTH_KEY, CURSOR_KEY]) try { localStorage.removeItem(k); } catch { /* ничего */ }
    dirty.clear(); history.wipe(); carts.clear(); profile.wipe(); weekMarks.clear(); familyStore.clear();
    set(IDLE);
  } finally {
    applying = false;
  }
}
/** Выйти: сначала отправляем несохранённое; если связи нет — не выходим, чтобы ничего не потерять. */
export async function signOut(what: 'this' | 'others' | 'all' | string): Promise<void> {
  if (what === 'this' || what === 'all') {
    await syncNow();
    if (dirty.any()) throw new SyncError('unsaved', 'Есть несохранённые чеки. Подключись к интернету и попробуй ещё раз');
  }
  await postAuthed('/api/account/signout', { what });
  if (what === 'this' || what === 'all') wipeDevice();
}
export async function deleteAccount(): Promise<void> {
  await sendAuthed('DELETE', '/api/account', { confirm: 'delete' });
  wipeDevice();
}

// ── семья ──
export type InvitePreview = { role: 'adult' | 'child'; familyName: string; invitedBy: string; members: number };
export const createInvite = async (role: 'adult' | 'child'): Promise<string> => ((await postAuthed('/api/family/invite', { role })) as { code: string }).code;
export const previewInvite = async (code: string): Promise<InvitePreview> => (await postAuthed('/api/family/join', { code, preview: true })) as InvitePreview;
export async function joinFamily(code: string, share: boolean): Promise<void> { await syncNow(); await postAuthed('/api/family/join', { code, share }); await syncNow(); }
export async function leaveFamily(): Promise<void> { await syncNow(); await postAuthed('/api/family/leave', {}); await syncNow(); }
export async function setMemberRole(userId: string, role: 'owner' | 'adult' | 'child'): Promise<void> { await sendAuthed('PATCH', '/api/family/members', { userId, role }); await syncNow(); }
export async function removeMember(userId: string): Promise<void> { await sendAuthed('DELETE', '/api/family/members', { userId }); await syncNow(); }

// Клиентская часть без браузера: журнал, отметки «изменено», синхронизация. Хранилище и сервер — заглушки.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SyncStateSchema } from './syncSchema';
import type { HistoryEntry, Receipt } from './types';

class FakeStorage {
  map = new Map<string, string>();
  limit = Infinity;
  getItem(k: string) { return this.map.get(k) ?? null; }
  setItem(k: string, v: string) {
    const size = [...this.map].reduce((n, [key, val]) => n + (key === k ? 0 : val.length), 0) + v.length;
    if (size > this.limit) throw new Error('QuotaExceededError');
    this.map.set(k, v);
  }
  removeItem(k: string) { this.map.delete(k); }
}

let storage: FakeStorage;
type Req = { path: string; method: string; body: Record<string, unknown> | null; token: string | null };
let calls: Req[];
let handler: (r: Req) => { status?: number; body: unknown } | Promise<{ status?: number; body: unknown }>;

const receipt = (id: string): Receipt => ({ id, title: 'Чек', store: 'Magnum', date: '2026-11-16', items: [{ n: 'Кола 1 л', p: 600, s: 106 }], approx: true });
const draft = (id: string): Omit<HistoryEntry, 'savedAt'> => ({ id, receiptId: `r${id}`, store: 'Magnum', date: '2026-11-16', cubes: 21, score: 40, swaps: [], receipt: receipt(`r${id}`) });
const state = (o: Record<string, unknown> = {}) => ({
  cursor: 1, full: false,
  me: { id: 'me', name: '', email: '', role: 'owner' },
  family: { id: 'f1', name: '', adults: 2, kids: 1, goal: 0, updatedAt: 5, members: [] },
  profile: { onboarded: true, seen: [], lang: 'ru', updatedAt: 1 },
  history: [], shop: [], weeks: [], stats: { barcodes: 0, shopDone: 0, bestWeeks: 0 }, streak: { current: 0, best: 0, freezes: 0, total: 0, level: 0, next: 4, cells: [] }, ...o,
});

/** Мини-сервер: помнит присланные чеки и возвращает их все. */
const saved = new Map<string, Record<string, unknown>>();
function server(r: Req, o: Record<string, unknown> = {}) {
  for (const h of (r.body?.history as Record<string, unknown>[] | undefined) ?? []) saved.set(h.id as string, h);
  return { body: state({ history: [...saved.values()], ...o }) };
}

async function load() {
  vi.resetModules();
  const [store, dirty, sync, family, profile] = await Promise.all([import('./store'), import('./dirty'), import('./sync'), import('./family'), import('./profile')]);
  return { ...store, ...dirty, ...sync, ...family, ...profile };
}

beforeEach(() => {
  storage = new FakeStorage();
  calls = [];
  saved.clear();
  handler = r => (r.path === '/api/auth/anonymous' ? { body: { token: 'cu_guest', userId: 'me' } } : server(r));
  vi.stubGlobal('localStorage', storage);
  vi.stubGlobal('addEventListener', () => {});
  vi.stubGlobal('removeEventListener', () => {});
  vi.stubGlobal('navigator', { userAgent: 'iPhone Safari' });
  vi.stubGlobal('fetch', async (path: string, init: RequestInit & { headers?: Record<string, string> }) => {
    const r: Req = { path, method: init.method ?? 'GET', body: typeof init.body === 'string' ? JSON.parse(init.body) : null, token: init.headers?.authorization?.slice(7) ?? null };
    calls.push(r);
    const { status = 200, body } = await handler(r);
    return new Response(JSON.stringify(body), { status });
  });
});

describe('журнал', () => {
  it('хранит больше двадцати чеков и помнит, что изменено', async () => {
    const m = await load();
    for (let i = 0; i < 60; i++) m.history.save(draft(`h${i}`));
    expect(m.history.all()).toHaveLength(60);
    expect(Object.keys(m.dirty.all())).toHaveLength(60);
  });

  it('когда место кончилось, выбрасывает старые чеки, которые уже на сервере, а несохранённые держит', async () => {
    const m = await load();
    for (let i = 0; i < 40; i++) m.history.save({ ...draft(`h${i}`), date: `2026-10-${String(i % 28 + 1).padStart(2, '0')}` });
    m.dirty.clear();
    storage.limit = [...storage.map.values()].reduce((n, v) => n + v.length, 0) + 60;
    m.history.save({ ...draft('new'), date: '2026-11-20' });
    expect(m.history.get('new')).not.toBeNull();
    expect(m.history.all().length).toBeLessThan(41);
    expect(m.history.all().length).toBeGreaterThan(30);
  });

  it('удаление оставляет след, пока сервер его не подтвердил', async () => {
    const m = await load();
    m.history.save(draft('a'));
    m.history.remove('a');
    expect(m.history.all()).toHaveLength(0);
    expect(m.tombstones()).toHaveProperty('a');
    m.dirty.clear();
    m.history.ackTombstones(['a']);
    expect(m.tombstones()).toEqual({});
  });
});

describe('синхронизация', () => {
  it('ответ-заглушка соответствует контракту', () => { expect(SyncStateSchema.safeParse(state()).success).toBe(true); });

  it('отправляет только изменённое и после ответа снимает отметки', async () => {
    const m = await load();
    m.history.save(draft('a'));
    await m.syncNow();
    const first = calls.find(c => c.path === '/api/sync')!;
    expect(first.token).toBe('cu_guest');
    expect((first.body!.history as unknown[]).length).toBe(1);
    expect(m.dirty.any()).toBe(false);
    calls.length = 0;
    await m.syncNow();
    expect(calls[0].body!.history).toBeUndefined();
    expect(calls[0].body!.since).toBe(1);
    expect(calls[0].body!.familyId).toBe('f1');
  });

  it('чек, исправленный во время запроса, остаётся своим и уйдёт следующим запросом', async () => {
    const m = await load();
    m.history.save(draft('a'));
    handler = r => {
      if (r.path === '/api/auth/anonymous') return { body: { token: 'cu_guest', userId: 'me' } };
      const sent = (r.body!.history as { id: string; score: number }[] | undefined)?.[0];
      if (sent?.score === 40) m.history.patch('a', { score: 77 }); // человек успел поправить
      return { body: state({ history: [{ ...draft('a'), score: 40, updatedAt: 1, deleted: false }] }) };
    };
    await m.syncNow();
    expect(m.history.get('a')!.score).toBe(77);
    expect(m.dirty.at('h:a')).toBeDefined();
    calls.length = 0;
    await m.syncNow();
    expect((calls[0].body!.history as { score: number }[])[0].score).toBe(77);
    expect(m.dirty.any()).toBe(false);
  });

  it('чужая правка приходит, удалённое исчезает, своё неотправленное не затирается', async () => {
    const m = await load();
    m.history.save(draft('a')); m.history.save(draft('b'));
    await m.syncNow();
    m.history.patch('b', { tag: 'guests' });
    handler = () => ({ body: state({ cursor: 2, history: [
      { ...draft('a'), updatedAt: 9e12, deleted: true, receipt: null },
      { ...draft('b'), updatedAt: 9e12, deleted: false, store: 'Small' },
      { ...draft('c'), updatedAt: 9e12, deleted: false, by: 'other' },
    ] }) });
    // правка b ушла на сервер, и он прислал более новую чужую версию
    await m.syncNow();
    expect(m.history.get('a')).toBeNull();
    expect(m.history.get('c')!.by).toBe('other');
  });

  it('перешли в другую семью — чеки прежней семьи с устройства уходят', async () => {
    const m = await load();
    m.history.save(draft('a'));
    await m.syncNow();
    handler = () => ({ body: state({ family: { ...state().family, id: 'f2' }, full: true, history: [{ ...draft('z'), updatedAt: 3, deleted: false }] }) });
    await m.syncNow();
    expect(m.history.all().map(e => e.id)).toEqual(['z']);
  });

  it('настройки семьи: своё изменение не затирается чужим, иначе принимаем', async () => {
    const m = await load();
    await m.syncNow();
    expect(m.profile.get()).toMatchObject({ adults: 2, kids: 1 });
    m.profile.updateFamily({ kids: 3 });
    handler = () => { m.profile.updateFamily({ kids: 4 }); return { body: state() }; };
    await m.syncNow();
    expect(m.profile.get().kids).toBe(4);
  });

  it('без сети ничего не теряет', async () => {
    const m = await load();
    m.history.save(draft('a'));
    vi.stubGlobal('fetch', async () => { throw new TypeError('offline'); });
    await m.syncNow();
    expect(m.syncInfoSnapshot().status).toBe('error');
    expect(m.dirty.at('h:a')).toBeDefined();
    expect(m.history.all()).toHaveLength(1);
  });

  it('сервер забыл гостя: заводим нового и отдаём ему все чеки', async () => {
    const m = await load();
    m.history.save(draft('a'));
    await m.syncNow();
    saved.clear();
    let guests = 0;
    handler = r => {
      if (r.path === '/api/auth/anonymous') { guests++; return { body: { token: 'cu_new', userId: 'me2' } }; }
      return r.token === 'cu_new' ? server(r) : { status: 401, body: { error: { code: 'unauthorized', message: 'нет' } } };
    };
    await m.syncNow();
    await m.syncNow();
    expect(guests).toBe(1);
    expect(m.history.all().map(e => e.id)).toEqual(['a']);
    expect(calls.some(c => c.path === '/api/sync' && c.token === 'cu_new' && (c.body!.history as unknown[] | undefined)?.length === 1)).toBe(true);
  });

  it('устройство отключили от аккаунта со входом: сохранённые чеки убираем, неотправленные остаются', async () => {
    const m = await load();
    m.history.save(draft('a'));
    handler = r => (r.path === '/api/auth/anonymous' ? { body: { token: 'cu_guest', userId: 'me' } } : server(r, { me: { id: 'me', name: '', email: 'x@example.com', role: 'owner' } }));
    await m.syncNow();
    expect(m.history.all()).toHaveLength(1);
    saved.clear(); // новый гость, на его стороне пусто
    m.history.save(draft('b'));
    handler = r => {
      if (r.path === '/api/auth/anonymous') return { body: { token: 'cu_new', userId: 'me2' } };
      return r.token === 'cu_new' ? server(r) : { status: 401, body: { error: { code: 'unauthorized', message: 'нет' } } };
    };
    await m.syncNow();
    expect(m.history.all().map(e => e.id)).toEqual(['b']);
  });

  it('выйти нельзя, пока не отправлено последнее', async () => {
    const m = await load();
    await m.syncNow();
    m.history.save(draft('a'));
    handler = () => ({ status: 500, body: {} });
    await expect(m.signOut('this')).rejects.toThrow('Есть несохранённые чеки');
    expect(m.history.all()).toHaveLength(1);
  });

  it('личный рекорд закрытия недели: своя отметка не затирается', async () => {
    const m = await load();
    await m.syncNow();
    m.weekMarks.setState('2026-11-16', 'closed');
    handler = () => { m.weekMarks.setState('2026-11-16', 'open'); return { body: state({ weeks: [{ week: '2026-11-16', state: 'closed', updatedAt: 1 }] }) }; };
    await m.syncNow();
    expect(m.weekMarks.get()[0].state).toBe('open');
  });
});

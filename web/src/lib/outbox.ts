// Очередь чеков: сфоткал и убрал телефон. Фото лежат в IndexedDB этого устройства, читаются по одному в фоне,
// без сети ждут. Как только чек прочитан, фото удаляется. Только для клиента.
import { todayIso } from './calendar';
import { analyze } from './engine';
import { isDemo, receiptOf } from './insights';
import { findDuplicate } from './plan';
import { findFiscalQr } from './qr';
import { applyEnriched, enrich, recognize, shrink } from './recognize';
import { isScanErrorCode, SCAN_ERRORS, ScanError, type ScanErrorCode } from './scan/errors';
import { history } from './store';
import type { Receipt } from './types';

export type Job = {
  id: string;
  createdAt: number;
  status: 'wait' | 'work' | 'error';
  /** код ошибки распознавания */
  error?: ScanErrorCode;
  tries: number;
  qr: string | null;
  photos: Blob[];
};
export type JobInfo = Omit<Job, 'photos'> & { photos: number };

export type Outcome =
  | { kind: 'saved'; entryId: string; receipt: Receipt }
  | { kind: 'duplicate'; entryId: string; receipt: Receipt }
  | { kind: 'demo'; receipt: Receipt; notice: string }
  | { kind: 'error'; code: ScanErrorCode };

const DB = 'chekup', STORE = 'scans';
let dbp: Promise<IDBDatabase> | null = null;
const open = (): Promise<IDBDatabase> => dbp ??= new Promise((res, rej) => {
  const r = indexedDB.open(DB, 1);
  r.onupgradeneeded = () => { r.result.createObjectStore(STORE, { keyPath: 'id' }); };
  r.onsuccess = () => res(r.result);
  r.onerror = () => { dbp = null; rej(r.error); };
});
async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((res, rej) => {
    const t = db.transaction(STORE, mode), req = fn(t.objectStore(STORE));
    t.oncomplete = () => res(req.result);
    t.onerror = t.onabort = () => rej(t.error);
  });
}

// память — на случай, когда IndexedDB недоступна (приватный режим): чек прочитается, но закрытие вкладки не переживёт
const mem = new Map<string, Job>();
const put = async (j: Job) => { mem.set(j.id, j); try { await tx('readwrite', s => s.put(j)); } catch { /* останется в памяти */ } };
const del = async (id: string) => { mem.delete(id); try { await tx('readwrite', s => s.delete(id)); } catch { /* ничего */ } };

let infos: JobInfo[] = [];
const NONE: JobInfo[] = [];
const listeners = new Set<() => void>();
function publish(): void {
  infos = [...mem.values()].sort((a, b) => a.createdAt - b.createdAt).map(j => ({ ...j, photos: j.photos.length }));
  listeners.forEach(fn => fn());
}
export const outboxSnapshot = (): JobInfo[] => infos;
export const outboxServerSnapshot = (): JobInfo[] => NONE;
export function subscribeOutbox(fn: () => void): () => void { listeners.add(fn); return () => { listeners.delete(fn); }; }

const waiters = new Map<string, (o: Outcome) => void>();
let onBackground: ((o: Outcome, job: JobInfo) => void) | null = null;
/** Кому сообщать о чеках, которых на экране никто не ждёт. */
export function onBackgroundDone(fn: typeof onBackground): () => void { onBackground = fn; return () => { if (onBackground === fn) onBackground = null; }; }

/** Без сети и при сбое сервера чек ждёт; остальные ошибки — про само фото, повтор их не исправит. */
const retryable = (c: ScanErrorCode) => c === 'unavailable' || c === 'rate_limit';
const MAX_TRIES = 8;

export const newJobId = (): string => 'j' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const cancelled = new Set<string>();

/** Добавить чек в очередь. id можно узнать заранее (newJobId), чтобы успеть подписаться через waitFor. */
export async function enqueue(photos: Blob[], qr: string | null = null, id: string = newJobId()): Promise<string> {
  const small = await Promise.all(photos.slice(0, 3).map(shrink));
  const found = qr ?? (await findAny(photos));
  if (cancelled.delete(id)) return id; // отменили, пока сжимали фото
  const job: Job = { id, createdAt: Date.now(), status: 'wait', tries: 0, qr: found, photos: small };
  await put(job);
  publish();
  void run();
  return job.id;
}
async function findAny(photos: Blob[]): Promise<string | null> {
  for (const p of photos) { const q = await findFiscalQr(p); if (q) return q; }
  return null;
}

/** Дождаться чека на экране; вернуть отмену ожидания (чек при этом продолжит читаться в фоне). */
export function waitFor(id: string, fn: (o: Outcome) => void): () => void {
  waiters.set(id, fn);
  return () => { if (waiters.get(id) === fn) waiters.delete(id); };
}
function done(job: Job, o: Outcome): void {
  const w = waiters.get(job.id);
  waiters.delete(job.id);
  if (w) w(o);
  else onBackground?.(o, { ...job, photos: job.photos.length });
}

/** Сохранить прочитанный чек в журнал. */
export function saveReceipt(receipt: Receipt): { entryId: string; duplicate: boolean } {
  const dup = findDuplicate(receipt, history.all().filter(e => !isDemo(e)), receiptOf);
  if (dup) return { entryId: dup.id, duplicate: true };
  const a = analyze(receipt);
  const e = history.save({ id: history.newId(), receiptId: receipt.id, store: receipt.store, date: receipt.date, cubes: a.cubes, score: a.score, swaps: [], receipt });
  return { entryId: e.id, duplicate: false };
}

async function refine(entryId: string, receipt: Receipt, pending: number[]): Promise<void> {
  const by = await enrich(receipt, pending);
  const cur = history.get(entryId);
  if (!by || !cur?.receipt) return;
  const next = applyEnriched(cur.receipt, by);
  const a = analyze(next, [], cur.off ?? []);
  history.patch(entryId, { receipt: next, cubes: a.cubes, score: a.score });
}

let running = false;
let timer: ReturnType<typeof setTimeout> | undefined;

async function run(): Promise<void> {
  if (running) return;
  running = true;
  clearTimeout(timer);
  try {
    for (;;) {
      const job = [...mem.values()].filter(j => j.status === 'wait').sort((a, b) => a.createdAt - b.createdAt)[0];
      if (!job) return;
      const work: Job = { ...job, status: 'work', tries: job.tries + 1 };
      mem.set(job.id, work);
      publish();
      try {
        const r = await recognize(work.photos, work.qr);
        if (!mem.has(job.id)) continue; // пока читали, человек удалил
        await del(job.id);
        publish();
        if (r.notice) { done(work, { kind: 'demo', receipt: r.receipt, notice: r.notice }); continue; }
        const s = saveReceipt(r.receipt);
        done(work, { kind: s.duplicate ? 'duplicate' : 'saved', entryId: s.entryId, receipt: r.receipt });
        if (!s.duplicate && r.pending.length) void refine(s.entryId, r.receipt, r.pending);
      } catch (e) {
        if (!mem.has(job.id)) continue;
        const code: ScanErrorCode = e instanceof ScanError && isScanErrorCode(e.code) ? e.code : 'unavailable';
        const wait = retryable(code) && work.tries < MAX_TRIES;
        await put({ ...work, status: wait ? 'wait' : 'error', error: code });
        publish();
        if (!wait) done(work, { kind: 'error', code });
        else {
          const w = waiters.get(job.id);
          if (w) { waiters.delete(job.id); w({ kind: 'error', code }); } // на экране не держим: чек подождёт в очереди
          timer = setTimeout(() => { void run(); }, Math.min(120_000, 4_000 * 2 ** work.tries));
          return;
        }
      }
    }
  } finally {
    running = false;
  }
}

export const outbox = {
  async retry(id: string): Promise<void> { const j = mem.get(id); if (j) { await put({ ...j, status: 'wait', tries: 0, error: undefined }); publish(); void run(); } },
  async remove(id: string): Promise<void> { if (!mem.has(id)) cancelled.add(id); await del(id); publish(); },
  async clear(): Promise<void> { for (const id of [...mem.keys()]) await del(id); publish(); },
};

/** Поднять очередь, оставшуюся с прошлого раза. */
export function startOutbox(): () => void {
  void (async () => {
    try {
      const list = await tx<Job[]>('readonly', s => s.getAll() as IDBRequest<Job[]>);
      // «работавшие» прервались вместе с вкладкой; очень старые больше не нужны
      for (const j of list) {
        if (Date.now() - j.createdAt > 30 * 86_400_000) { await del(j.id); continue; }
        if (!mem.has(j.id)) mem.set(j.id, { ...j, status: j.status === 'work' ? 'wait' : j.status });
      }
    } catch { /* IndexedDB недоступна */ }
    publish();
    void run();
  })();
  const onOnline = () => { void run(); };
  addEventListener('online', onOnline);
  return () => { removeEventListener('online', onOnline); clearTimeout(timer); };
}

export const scanErrorText = (c: ScanErrorCode): string => SCAN_ERRORS[c].message;
/** Пустой чек для ручного ввода. */
export const blankReceipt = (): Receipt => ({ id: 'man-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), title: 'Мой чек', store: 'Магазин', date: todayIso(), items: [], via: 'manual' });

// Маленькое хранилище в localStorage с подпиской для useSyncExternalStore. Только для клиентских компонентов.
export function createStore<T>(key: string, parse: (raw: unknown) => T, fallback: T) {
  const listeners = new Set<() => void>();
  let cachedRaw: string | null | undefined;
  let cached: T = fallback;
  let volatile = false; // запись в localStorage не удалась: держим значение в памяти

  const rawValue = (): string | null => { try { return localStorage.getItem(key); } catch { return null; } };
  const get = (): T => {
    if (volatile) return cached;
    const raw = rawValue();
    if (raw !== cachedRaw) {
      cachedRaw = raw;
      try { cached = raw === null ? fallback : parse(JSON.parse(raw)); } catch { cached = fallback; }
    }
    return cached;
  };
  const set = (next: T): void => {
    const raw = JSON.stringify(next);
    try { localStorage.setItem(key, raw); volatile = false; cachedRaw = raw; } catch { volatile = true; }
    cached = next;
    listeners.forEach(fn => fn());
  };
  return {
    get,
    set,
    update: (fn: (cur: T) => T): void => set(fn(get())),
    clear(): void { try { localStorage.removeItem(key); } catch { /* нечего чистить */ } volatile = false; cachedRaw = undefined; listeners.forEach(fn => fn()); },
    serverSnapshot: (): T => fallback,
    subscribe(fn: () => void): () => void {
      listeners.add(fn);
      const onStorage = (e: StorageEvent) => { if (e.key === key || e.key === null) fn(); };
      addEventListener('storage', onStorage);
      return () => { listeners.delete(fn); removeEventListener('storage', onStorage); };
    },
  };
}

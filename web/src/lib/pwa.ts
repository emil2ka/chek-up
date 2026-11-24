// Установленное приложение: service worker (запуск без сети) и приём фото из системного «Поделиться». Только для клиента.
const SHARE_CACHE = 'chekup-share';

export function registerServiceWorker(): void {
  if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('/sw.js').catch(() => { /* без него всё работает, только не офлайн */ });
}

/** Фото, которые прислали через «Поделиться» (их сложил sw.js). Забираем один раз. */
export async function takeShared(): Promise<File[]> {
  if (!('caches' in window)) return [];
  try {
    const cache = await caches.open(SHARE_CACHE);
    const files: File[] = [];
    for (const req of await cache.keys()) {
      const res = await cache.match(req);
      if (res) { const b = await res.blob(); files.push(new File([b], 'shared.jpg', { type: b.type || 'image/jpeg' })); }
      await cache.delete(req);
    }
    return files;
  } catch {
    return [];
  }
}

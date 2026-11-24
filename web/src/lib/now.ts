// Текущее время для экранов: обновляется раз в минуту. На сервере и при гидратации — 0, чтобы разметка не расходилась.
import { useSyncExternalStore } from 'react';

let at = 0;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;
const tick = () => { at = Date.now(); listeners.forEach(fn => fn()); };
const onVisible = () => { if (document.visibilityState === 'visible') tick(); };

function subscribe(fn: () => void): () => void {
  if (!listeners.size) { at = Date.now(); timer = setInterval(tick, 60_000); document.addEventListener('visibilitychange', onVisible); }
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
    if (!listeners.size) { clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); }
  };
}
const snapshot = () => (at ||= Date.now());
const server = () => 0;
export const useNow = (): number => useSyncExternalStore(subscribe, snapshot, server);

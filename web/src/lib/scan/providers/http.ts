// Общий POST JSON для провайдеров: таймаут, понятные ошибки, ключ никогда не попадает в логи.
import { ScanError } from '../errors';

export async function postJson(url: string, headers: Record<string, string>, body: unknown, signal: AbortSignal, who: string): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal,
      cache: 'no-store',
    });
  } catch (err) {
    const timeout = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
    throw new ScanError('unavailable', `${who}: ${timeout ? 'таймаут' : 'сеть недоступна'}`);
  }

  if (res.status === 429) throw new ScanError('rate_limit', `${who}: 429`);
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.text()).slice(0, 300); } catch { /* пусто */ }
    // 401/403 — неверный ключ или регион; 400 — ошибка запроса; 5xx — сбой у провайдера
    throw new ScanError('unavailable', `${who}: HTTP ${res.status} ${detail}`);
  }
  try {
    return await res.json();
  } catch {
    throw new ScanError('unavailable', `${who}: ответ не JSON`);
  }
}

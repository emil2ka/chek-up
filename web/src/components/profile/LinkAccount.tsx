'use client';
// Профиль → «Один аккаунт»: состояние синхронизации и связывание с мобильным приложением (или другим устройством).
import { useState, useSyncExternalStore } from 'react';
import { createLinkCode, redeemLinkCode, subscribeSyncInfo, syncInfoServerSnapshot, syncInfoSnapshot, syncNow, SyncError } from '@/lib/sync';

const ago = (t: number) => {
  const m = Math.floor((Date.now() - t) / 60_000);
  return m < 1 ? 'только что' : m < 60 ? `${m} мин назад` : `${Math.floor(m / 60)} ч назад`;
};

const row = 'flex min-h-14 w-full items-center gap-3 rounded-[20px] bg-tint px-3.5 text-left text-[15px] font-bold active:scale-[.985] disabled:opacity-45';

export function LinkAccount() {
  const info = useSyncExternalStore(subscribeSyncInfo, syncInfoSnapshot, syncInfoServerSnapshot);
  const [code, setCode] = useState<string | null>(null);
  const [enter, setEnter] = useState(false);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const run = async (job: () => Promise<void>) => {
    setBusy(true);
    setMsg('');
    try { await job(); }
    catch (e) { setMsg(e instanceof SyncError ? e.message : 'Что-то пошло не так. Попробуй ещё раз'); }
    finally { setBusy(false); }
  };

  const dot = info.status === 'error' ? 'bg-bad' : info.status === 'syncing' ? 'bg-mid' : 'bg-good';
  const text = info.status === 'error' ? info.error || 'Не получилось синхронизировать'
    : info.status === 'syncing' ? 'Синхронизирую…'
    : info.lastSync ? `Синхронизировано · ${ago(info.lastSync)}` : 'Синхронизация включена';

  return (
    <div className="grid gap-2">
      <div className="flex min-h-14 items-center gap-3 rounded-[20px] bg-tint pr-1.5 pl-3.5">
        <i className={`size-2.5 flex-none rounded-full ${dot}`} />
        <p className="flex-1 text-[14px] font-bold" role="status" aria-live="polite">{text}</p>
        <button type="button" aria-label="Синхронизировать сейчас" disabled={info.status === 'syncing'} onClick={() => void syncNow()} className="grid size-11 place-items-center rounded-2xl text-blue-1 active:scale-[.9] disabled:opacity-45">
          <svg viewBox="0 0 24 24" className="size-5.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M20 12a8 8 0 0 1-14 5.3M4 12a8 8 0 0 1 14-5.3" /><path d="M18.5 3v4h-4M5.5 21v-4h4" /></svg>
        </button>
      </div>

      <button type="button" className={row} disabled={busy} aria-expanded={code !== null} onClick={() => (code ? setCode(null) : run(async () => setCode(await createLinkCode())))}>
        <span className="flex-1">Код для другого устройства</span>
      </button>
      {code && (
        <div className="grid min-w-0 gap-2 px-1">
          <button type="button" onClick={() => void navigator.clipboard?.writeText(code).then(() => setMsg('Код скопирован'))} aria-label={`Скопировать код ${code}`} className="rounded-[22px] bg-sky py-4.5 text-center font-display text-[34px] font-black tracking-[.08em] text-white active:scale-[.98]">
            {code}
          </button>
          <p className="text-center text-[13px] font-semibold text-mute">Введи его в мобильном приложении (Профиль → «У меня есть код») в течение 10 минут. Код одноразовый.</p>
        </div>
      )}

      <button type="button" className={row} aria-expanded={enter} onClick={() => setEnter(v => !v)}>
        <span className="flex-1">У меня есть код</span>
      </button>
      {enter && (
        <form
          className="grid min-w-0 gap-2 px-1"
          onSubmit={e => {
            e.preventDefault();
            if (input.replace(/[^A-Za-z0-9]/g, '').length < 8) { setMsg('Код из 8 символов, например K7F2-M9XQ'); return; }
            void run(async () => { await redeemLinkCode(input); setInput(''); setEnter(false); setMsg('Готово: устройства связаны'); });
          }}
        >
          <div className="flex min-w-0 gap-2">
            <input value={input} onChange={e => setInput(e.target.value.toUpperCase())} maxLength={9} autoCapitalize="characters" autoComplete="off" spellCheck={false} placeholder="ABCD-EFGH" aria-label="Код с другого устройства" className="h-13.5 w-full min-w-0 flex-1 rounded-[18px] bg-tint px-4 font-display text-lg font-bold tracking-[.08em] outline-none placeholder:text-mute/50" />
            <button type="submit" disabled={busy} className="h-13.5 flex-none rounded-[18px] bg-blue-1 px-5 font-display text-sm font-bold text-white active:scale-[.96] disabled:opacity-45">Войти</button>
          </div>
          <p className="text-[13px] font-semibold text-mute">Чеки и профиль с обоих устройств объединятся.</p>
        </form>
      )}
      {msg && <p className="px-1 text-[14px] font-bold" role="status" aria-live="polite">{msg}</p>}
    </div>
  );
}

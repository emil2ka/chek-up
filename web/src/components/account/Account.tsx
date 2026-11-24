'use client';
// Профиль → аккаунт: вход, семья и роли, приглашения, устройства, выгрузка и удаление данных.
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { AnimatePresence } from 'motion/react';
import { familyStore, type FamilyState } from '@/lib/family';
import { t } from '@/lib/i18n';
import {
  accountInfo, authProviders, createInvite, createLinkCode, deleteAccount, emailStart, emailVerify, getAuthed, joinFamily, leaveFamily, oidcSignIn, previewInvite,
  redeemLinkCode, removeMember, renameMe, setMemberRole, signOut, subscribeSyncInfo, syncInfoServerSnapshot, syncInfoSnapshot, syncNow, SyncError,
  type AccountInfo, type InvitePreview, type Providers,
} from '@/lib/sync';
import type { RoleName } from '@/lib/syncSchema';
import { IconChevron, IconUser, IconUsers } from '@/components/icons';
import { Sheet } from '@/components/ui/Sheet';
import { dangerCls, H2, iconCls, inputCls, primaryCls, quietCls, rowCls, Segmented, Switch } from '@/components/ui/kit';

const errText = (e: unknown): string => (e instanceof SyncError ? t(e.message) : t('Что-то пошло не так. Попробуй ещё раз'));
export const roleTxt = (r: RoleName): string => ({ owner: t('владелец'), adult: t('взрослый'), child: t('ребёнок') }[r]);

function useBusy() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const run = useCallback(async (job: () => Promise<unknown>) => {
    setBusy(true); setMsg('');
    try { await job(); } catch (e) { setMsg(errText(e)); } finally { setBusy(false); }
  }, []);
  return { busy, msg, setMsg, run };
}
const Msg = ({ children }: { children: ReactNode }) => (children ? <p className="px-1 text-[14px] leading-snug font-bold" role="status" aria-live="polite">{children}</p> : null);

const ago = (ms: number): string => {
  const m = Math.floor((Date.now() - ms) / 60_000);
  return m < 2 ? t('только что') : m < 60 ? t('{n} мин назад', { n: m }) : m < 1440 ? t('{n} ч назад', { n: Math.floor(m / 60) }) : t('{n} дн. назад', { n: Math.floor(m / 1440) });
};

export function SyncStatus() {
  const info = useSyncExternalStore(subscribeSyncInfo, syncInfoSnapshot, syncInfoServerSnapshot);
  const text = info.status === 'error' ? t(info.error || 'Не получилось синхронизировать') : info.status === 'syncing' ? t('Сохраняю…') : info.lastSync ? `${t('Сохранено')} · ${ago(info.lastSync)}` : t('Синхронизация включена');
  return (
    <div className="flex min-h-14 items-center gap-3 rounded-[20px] bg-tint pr-1.5 pl-4">
      <i className={`size-2.5 flex-none rounded-full ${info.status === 'error' ? 'bg-bad' : info.status === 'syncing' ? 'bg-mid' : 'bg-good'}`} />
      <p className="flex-1 text-[14px] leading-snug font-bold" role="status" aria-live="polite">{text}</p>
      <button type="button" aria-label={t('Синхронизировать сейчас')} disabled={info.status === 'syncing'} onClick={() => void syncNow()} className="grid size-11 place-items-center rounded-2xl text-blue-1 active:scale-[.9] disabled:opacity-45">
        <svg viewBox="0 0 24 24" className="size-5.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M20 12a8 8 0 0 1-14 5.3M4 12a8 8 0 0 1 14-5.3" /><path d="M18.5 3v4h-4M5.5 21v-4h4" /></svg>
      </button>
    </div>
  );
}

// ── вход ──
type Google = { accounts: { id: { initialize(o: object): void; renderButton(el: HTMLElement, o: object): void } } };
function GoogleButton({ clientId, onToken }: { clientId: string; onToken(idToken: string): void }) {
  const ref = useRef<HTMLDivElement>(null);
  const cb = useRef(onToken);
  useEffect(() => { cb.current = onToken; });
  useEffect(() => {
    let dead = false;
    const draw = () => {
      const g = (window as unknown as { google?: Google }).google;
      if (dead || !g || !ref.current) return;
      g.accounts.id.initialize({ client_id: clientId, callback: (r: { credential?: string }) => { if (r.credential) cb.current(r.credential); } });
      g.accounts.id.renderButton(ref.current, { theme: 'outline', size: 'large', shape: 'pill', width: Math.min(360, ref.current.clientWidth), text: 'continue_with' });
    };
    if ((window as unknown as { google?: Google }).google) { draw(); return () => { dead = true; }; }
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client'; s.async = true; s.onload = draw;
    document.head.appendChild(s);
    return () => { dead = true; };
  }, [clientId]);
  return <div ref={ref} className="grid min-h-11 w-full place-items-center" />;
}

export function SignInSheet({ onClose, onDone }: { onClose(): void; onDone(): void }) {
  const { busy, msg, setMsg, run } = useBusy();
  const [providers, setProviders] = useState<Providers | null>(null);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  useEffect(() => { let dead = false; authProviders().then(p => { if (!dead) setProviders(p); }).catch(() => { if (!dead) setProviders({ email: false, google: null, apple: false }); }); return () => { dead = true; }; }, []);
  const none = providers && !providers.email && !providers.google;

  return (
    <Sheet title={t('Вход')} onClose={onClose}>
      <p className="px-1 pb-3 text-[15px] leading-snug font-semibold text-mute">{t('Чеки с этого телефона сохранятся в аккаунте. Пароль не нужен.')}</p>
      <div className="grid gap-2.5">
        {!providers && <p className="px-1 text-[14px] font-semibold text-mute">{t('Загружаю…')}</p>}
        {none && <p className="rounded-2xl bg-tint p-4 text-[15px] leading-snug font-semibold">{t('Вход на этом сервере ещё не подключён. Перенести чеки на другое устройство можно по коду.')}</p>}
        {providers?.google && <GoogleButton clientId={providers.google} onToken={tok => void run(async () => { await oidcSignIn('google', tok); onDone(); })} />}
        {providers?.email && !sent && (
          <form className="grid gap-2" onSubmit={e => { e.preventDefault(); void run(async () => { await emailStart(email); setSent(true); }); }}>
            <input type="email" required autoComplete="email" inputMode="email" className={inputCls} value={email} onChange={e => setEmail(e.target.value)} placeholder={t('Почта')} aria-label={t('Почта')} />
            <button type="submit" className={primaryCls} disabled={busy || !email.includes('@')}>{busy ? t('Отправляю…') : t('Получить код')}</button>
          </form>
        )}
        {sent && (
          <form className="grid gap-2" onSubmit={e => { e.preventDefault(); void run(async () => { await emailVerify(email, code); onDone(); }); }}>
            <p className="px-1 text-[15px] leading-snug font-semibold">{t('Код отправлен на {e}. Он действует 10 минут.', { e: email })}</p>
            <input data-autofocus inputMode="numeric" autoComplete="one-time-code" maxLength={6} className={`${inputCls} text-center font-display text-[24px]! font-black tracking-[.2em]`} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} aria-label={t('Код из письма')} placeholder="000000" />
            <button type="submit" className={primaryCls} disabled={busy || code.length !== 6}>{busy ? t('Вхожу…') : t('Войти')}</button>
            <button type="button" className={quietCls} disabled={busy} onClick={() => { setSent(false); setCode(''); setMsg(''); }}>{t('Другая почта или новый код')}</button>
          </form>
        )}
        <Msg>{msg}</Msg>
      </div>
    </Sheet>
  );
}

// ── семья ──
function InviteSheet({ name, onClose }: { name: string; onClose(): void }) {
  const [own, setOwn] = useState('');
  const { busy, msg, setMsg, run } = useBusy();
  const [role, setRole] = useState<'adult' | 'child'>('adult');
  const [code, setCode] = useState('');
  const link = code ? `${location.origin}/?join=${code}` : '';
  const share = async () => {
    const text = `${t('Присоединяйся к нашей семье в «Чек-ап»')}: ${link}`;
    try { if (navigator.share) { await navigator.share({ text }); return; } } catch (e) { if ((e as Error)?.name === 'AbortError') return; }
    try { await navigator.clipboard.writeText(link); setMsg(t('Ссылка скопирована')); } catch { setMsg(link); }
  };
  return (
    <Sheet title={t('Пригласить в семью')} onClose={onClose}>
      <div className="grid gap-3">
        {!code ? (
          <>
            <Segmented label={t('Роль')} value={role} onChange={setRole} options={[['adult', t('Взрослый')], ['child', t('Ребёнок')]] as const} />
            <p className="px-1 text-[14px] leading-snug font-semibold text-mute">{role === 'adult' ? t('Видит и вносит все общие чеки, закрывает недели.') : t('Видит гору и стрик, вносит свои чеки. Цены и алкоголь в чужих чеках скрыты.')}</p>
            {!name && <input className={inputCls} value={own} maxLength={40} onChange={e => setOwn(e.target.value)} placeholder={t('Твоё имя, чтобы тебя узнали')} aria-label={t('Имя для семьи')} autoComplete="given-name" />}
            <button type="button" className={primaryCls} disabled={busy} onClick={() => void run(async () => { if (!name && own.trim()) await renameMe(own); setCode(await createInvite(role)); })}>{t('Создать приглашение')}</button>
          </>
        ) : (
          <>
            <p className="rounded-[22px] bg-sky py-5 text-center font-display text-[30px] font-black tracking-[.06em] text-white">{code}</p>
            <p className="px-1 text-center text-[14px] leading-snug font-semibold text-mute">{t('Код одноразовый и действует двое суток.')}</p>
            <button type="button" className={primaryCls} onClick={() => void share()}>{t('Отправить ссылку')}</button>
          </>
        )}
        <Msg>{msg}</Msg>
      </div>
    </Sheet>
  );
}

export function JoinSheet({ initial, onClose, onDone }: { initial: string; onClose(): void; onDone(): void }) {
  const { busy, msg, run } = useBusy();
  const [code, setCode] = useState(initial);
  const [info, setInfo] = useState<InvitePreview | null>(null);
  const [share, setShare] = useState(true);
  const me = useSyncExternalStore(familyStore.subscribe, familyStore.get, familyStore.serverSnapshot).me;
  const [own, setOwn] = useState('');
  const look = useCallback((c: string) => run(async () => setInfo(await previewInvite(c))), [run]);
  useEffect(() => { if (initial) { const id = setTimeout(() => void look(initial), 0); return () => clearTimeout(id); } }, [initial, look]);
  return (
    <Sheet title={t('Вступить в семью')} onClose={onClose}>
      <div className="grid gap-3">
        {!info ? (
          <form className="grid gap-2" onSubmit={e => { e.preventDefault(); void look(code); }}>
            <input className={`${inputCls} text-center font-display text-[20px]! font-black tracking-[.1em] uppercase`} value={code} maxLength={14} autoCapitalize="characters" autoComplete="off" spellCheck={false} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="ABCDE-FGHJK" aria-label={t('Код приглашения')} />
            <button type="submit" className={primaryCls} disabled={busy || code.replace(/[^A-Za-z0-9]/g, '').length < 10}>{busy ? t('Проверяю…') : t('Дальше')}</button>
          </form>
        ) : (
          <>
            <p className="rounded-[22px] bg-tint p-4 text-[16px] leading-snug font-bold">
              {info.invitedBy ? t('{n} зовёт тебя в семью', { n: info.invitedBy }) : t('Тебя зовут в семью')}{info.familyName ? ` «${info.familyName}»` : ''}.
              <span className="mt-1 block text-[14px] font-semibold text-mute">{t('Участников')}: {info.members}. {t('Твоя роль')}: {roleTxt(info.role)}.</span>
            </p>
            <Switch label={t('Показать семье мои прошлые чеки')} hint={share ? t('они станут общими') : t('они останутся у тебя, но личными')} checked={share} onChange={setShare} />
            {!me.name && <input className={inputCls} value={own} maxLength={40} onChange={e => setOwn(e.target.value)} placeholder={t('Твоё имя, чтобы тебя узнали')} aria-label={t('Имя для семьи')} autoComplete="given-name" />}
            <p className="px-1 text-[14px] leading-snug font-semibold text-mute">{t('Стрик и норма будут общими, семейными. Твой личный рекорд сохранится.')}</p>
            <button type="button" className={primaryCls} disabled={busy} onClick={() => void run(async () => { if (!me.name && own.trim()) await renameMe(own); await joinFamily(code, share); onDone(); })}>{busy ? t('Вступаю…') : t('Вступить')}</button>
          </>
        )}
        <Msg>{msg}</Msg>
      </div>
    </Sheet>
  );
}

function MemberSheet({ member, owner, onClose }: { member: FamilyState['members'][number]; owner: boolean; onClose(): void }) {
  const { busy, msg, run } = useBusy();
  const [confirm, setConfirm] = useState<'owner' | 'remove' | null>(null);
  return (
    <Sheet title={member.name || t('Участник')} kicker={roleTxt(member.role)} onClose={onClose}>
      <div className="grid gap-2.5">
        {owner && (
          <>
            <Segmented label={t('Роль')} value={member.role === 'owner' ? 'adult' : member.role} onChange={v => void run(async () => { await setMemberRole(member.id, v); onClose(); })} options={[['adult', t('Взрослый')], ['child', t('Ребёнок')]] as const} />
            {confirm ? (
              <div className="rounded-[20px] bg-tint p-3.5">
                <p className="text-[15px] leading-snug font-bold">{confirm === 'owner' ? t('Передать владение? Ты станешь взрослым участником.') : t('Убрать из семьи? Его чеки останутся у него, общие копии — у вас.')}</p>
                <div className="mt-3 grid grid-cols-2 gap-2 [&>:first-child]:bg-white">
                  <button type="button" className={quietCls} onClick={() => setConfirm(null)}>{t('Отмена')}</button>
                  <button type="button" disabled={busy} className={dangerCls} onClick={() => void run(async () => { if (confirm === 'owner') await setMemberRole(member.id, 'owner'); else await removeMember(member.id); onClose(); })}>{t('Да')}</button>
                </div>
              </div>
            ) : (
              <>
                {member.role === 'adult' && <button type="button" className={quietCls} onClick={() => setConfirm('owner')}>{t('Сделать владельцем')}</button>}
                <button type="button" className={`${quietCls} text-bad!`} onClick={() => setConfirm('remove')}>{t('Убрать из семьи')}</button>
              </>
            )}
          </>
        )}
        <Msg>{msg}</Msg>
      </div>
    </Sheet>
  );
}

// ── весь раздел ──
export function Account({ family, onToast }: { family: FamilyState; onToast(text: string): void }) {
  const [sheet, setSheet] = useState<null | 'signin' | 'invite' | 'join' | 'link' | 'redeem' | 'devices' | 'data'>(null);
  const [member, setMember] = useState<FamilyState['members'][number] | null>(null);
  const [leave, setLeave] = useState(false);
  const { busy, msg, run } = useBusy();
  const { me } = family;
  const alone = family.members.length < 2;
  const [name, setName] = useState<string | null>(null);
  const close = () => setSheet(null);

  return (
    <>
      <section aria-labelledby="ac-h" className="mt-8">
        <H2 id="ac-h">{t('Аккаунт')}</H2>
        <div className="grid gap-2">
          {me.email
            ? <p className={rowCls}><span className={iconCls}><IconUser className="size-5" /></span><span className="min-w-0 flex-1 truncate">{me.email}</span></p>
            : <button type="button" className={`${rowCls} py-2.5`} onClick={() => setSheet('signin')}>
                <span className={iconCls}><IconUser className="size-5" /></span>
                <span className="flex-1">{t('Войти')}<span className="block text-[13px] font-semibold text-mute">{t('чтобы не потерять чеки вместе с телефоном')}</span></span>
                <IconChevron className="size-5 text-mute" />
              </button>}
          <form className="flex gap-2" onSubmit={e => { e.preventDefault(); if (name !== null) void run(async () => { await renameMe(name); setName(null); onToast(t('Имя сохранено')); }); }}>
            <input className={inputCls} value={name ?? me.name} maxLength={40} onChange={e => setName(e.target.value)} placeholder={t('Имя для семьи')} aria-label={t('Имя для семьи')} autoComplete="given-name" />
            {name !== null && name.trim() !== me.name && <button type="submit" disabled={busy} className="h-13 flex-none rounded-2xl bg-blue-1 px-4 font-display text-[14px] font-bold text-white active:scale-[.96]">OK</button>}
          </form>
          <SyncStatus />
          <Msg>{msg}</Msg>
        </div>
      </section>

      <section aria-labelledby="fm-h" className="mt-8">
        <H2 id="fm-h">{t('Семья')}</H2>
        <div className="grid gap-2">
          {!alone && family.members.map(m => (
            <button key={m.id} type="button" disabled={m.me || me.role !== 'owner'} className={`${rowCls} disabled:opacity-100!`} onClick={() => setMember(m)}>
              <span className={iconCls}><IconUser className="size-5" /></span>
              <span className="min-w-0 flex-1 truncate">{m.name || (m.me ? t('Я') : t('Участник'))}{m.me && m.name ? ` (${t('я')})` : ''}</span>
              <span className="text-[13px] font-bold text-mute">{roleTxt(m.role)}</span>
              {!m.me && me.role === 'owner' && <IconChevron className="size-5 text-mute" />}
            </button>
          ))}
          {alone && <p className="px-1 text-[14px] leading-snug font-semibold text-mute">{t('Один журнал, один стрик и общая норма на всех, кто ходит в магазин.')}</p>}
          {me.role !== 'child' && <button type="button" className={rowCls} onClick={() => setSheet('invite')}><span className={iconCls}><IconUsers className="size-5" /></span><span className="flex-1">{t('Пригласить в семью')}</span><IconChevron className="size-5 text-mute" /></button>}
          <button type="button" className={rowCls} onClick={() => setSheet('join')}><span className="flex-1">{t('У меня есть приглашение')}</span><IconChevron className="size-5 text-mute" /></button>
          {!alone && (leave
            ? <div className="rounded-[20px] bg-tint p-3.5">
                <p className="text-[15px] leading-snug font-bold">{t('Выйти из семьи? Твои чеки останутся с тобой, общие копии — у семьи.')}</p>
                <div className="mt-3 grid grid-cols-2 gap-2 [&>:first-child]:bg-white">
                  <button type="button" className={quietCls} onClick={() => setLeave(false)}>{t('Остаться')}</button>
                  <button type="button" disabled={busy} className={dangerCls} onClick={() => void run(async () => { await leaveFamily(); setLeave(false); onToast(t('Теперь у тебя своя семья')); })}>{t('Выйти')}</button>
                </div>
              </div>
            : <button type="button" className="min-h-12 rounded-2xl text-[14px] font-bold text-bad" onClick={() => setLeave(true)}>{t('Выйти из семьи')}</button>)}
        </div>
      </section>

      <section aria-labelledby="dv-h" className="mt-8">
        <H2 id="dv-h">{t('Устройства и данные')}</H2>
        <div className="grid gap-2">
          <button type="button" className={rowCls} onClick={() => setSheet('link')}><span className="flex-1">{t('Открыть на другом устройстве')}</span><IconChevron className="size-5 text-mute" /></button>
          <button type="button" className={rowCls} onClick={() => setSheet('redeem')}><span className="flex-1">{t('У меня есть код устройства')}</span><IconChevron className="size-5 text-mute" /></button>
          <button type="button" className={rowCls} onClick={() => setSheet('devices')}><span className="flex-1">{t('Мои устройства и выход')}</span><IconChevron className="size-5 text-mute" /></button>
          <button type="button" className={rowCls} onClick={() => setSheet('data')}><span className="flex-1">{t('Выгрузить или удалить данные')}</span><IconChevron className="size-5 text-mute" /></button>
        </div>
      </section>

      <AnimatePresence>
        {sheet === 'signin' && <SignInSheet key="s" onClose={close} onDone={() => { close(); onToast(t('Готово, чеки сохранены в аккаунте')); }} />}
        {sheet === 'invite' && <InviteSheet key="i" name={me.name} onClose={close} />}
        {sheet === 'join' && <JoinSheet key="j" initial="" onClose={close} onDone={() => { close(); onToast(t('Добро пожаловать в семью')); }} />}
        {sheet === 'link' && <LinkSheet key="l" onClose={close} />}
        {sheet === 'redeem' && <RedeemSheet key="r" onClose={close} onDone={() => { close(); onToast(t('Устройства связаны')); }} />}
        {sheet === 'devices' && <DevicesSheet key="d" signedIn={!!me.email} onClose={close} onToast={onToast} />}
        {sheet === 'data' && <DataSheet key="x" onClose={close} onToast={onToast} />}
        {member && <MemberSheet key="m" member={member} owner={me.role === 'owner'} onClose={() => setMember(null)} />}
      </AnimatePresence>
    </>
  );
}

function LinkSheet({ onClose }: { onClose(): void }) {
  const { msg, setMsg, run } = useBusy();
  const [code, setCode] = useState('');
  useEffect(() => { const id = setTimeout(() => void run(async () => setCode(await createLinkCode())), 0); return () => clearTimeout(id); }, [run]);
  return (
    <Sheet title={t('Код для своего устройства')} onClose={onClose}>
      <div className="grid gap-3">
        <button type="button" disabled={!code} onClick={() => void navigator.clipboard?.writeText(code).then(() => setMsg(t('Код скопирован')))} className="rounded-[22px] bg-sky py-5 text-center font-display text-[34px] font-black tracking-[.08em] text-white active:scale-[.98]">{code || '· · · ·'}</button>
        <p className="px-1 text-center text-[14px] leading-snug font-semibold text-mute">{t('Введи его на другом устройстве в течение 10 минут. Никому не показывай: код открывает твой аккаунт.')}</p>
        <Msg>{msg}</Msg>
      </div>
    </Sheet>
  );
}

function RedeemSheet({ onClose, onDone }: { onClose(): void; onDone(): void }) {
  const { busy, msg, run } = useBusy();
  const [code, setCode] = useState('');
  return (
    <Sheet title={t('Код устройства')} onClose={onClose}>
      <form className="grid gap-2" onSubmit={e => { e.preventDefault(); void run(async () => { await redeemLinkCode(code); onDone(); }); }}>
        <input data-autofocus className={`${inputCls} text-center font-display text-[20px]! font-black tracking-[.1em] uppercase`} value={code} maxLength={9} autoCapitalize="characters" autoComplete="off" spellCheck={false} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="ABCD-EFGH" aria-label={t('Код устройства')} />
        <p className="px-1 text-[14px] font-semibold text-mute">{t('Чеки с обоих устройств объединятся.')}</p>
        <button type="submit" className={primaryCls} disabled={busy || code.replace(/[^A-Za-z0-9]/g, '').length !== 8}>{busy ? t('Связываю…') : t('Связать')}</button>
        <Msg>{msg}</Msg>
      </form>
    </Sheet>
  );
}

function DevicesSheet({ signedIn, onClose, onToast }: { signedIn: boolean; onClose(): void; onToast(s: string): void }) {
  const { busy, msg, run } = useBusy();
  const [info, setInfo] = useState<AccountInfo | null>(null);
  const [confirm, setConfirm] = useState<null | 'this' | 'all'>(null);
  const load = useCallback(() => run(async () => setInfo(await accountInfo())), [run]);
  useEffect(() => { const id = setTimeout(() => void load(), 0); return () => clearTimeout(id); }, [load]);
  return (
    <Sheet title={t('Мои устройства')} onClose={onClose}>
      <div className="grid gap-2">
        {!info && !msg && <p className="px-1 text-[14px] font-semibold text-mute">{t('Загружаю…')}</p>}
        {info?.devices.map(d => (
          <div key={d.id} className="flex min-h-15 items-center gap-3 rounded-[20px] bg-tint py-2 pr-2 pl-4">
            <span className="min-w-0 flex-1"><b className="block truncate text-[15px]">{d.label || t('Устройство')}</b><span className="text-[13px] font-semibold text-mute">{d.current ? t('это устройство') : `${t('был в сети')} ${ago(Date.parse(d.lastSeenAt))}`}</span></span>
            {!d.current && <button type="button" disabled={busy} className="min-h-11 rounded-2xl bg-white px-3.5 text-[14px] font-bold text-bad active:scale-[.96]" onClick={() => void run(async () => { await signOut(d.id); setInfo(await accountInfo()); })}>{t('Отключить')}</button>}
          </div>
        ))}
        {info && info.devices.length > 1 && <button type="button" disabled={busy} className={quietCls} onClick={() => void run(async () => { await signOut('others'); setInfo(await accountInfo()); })}>{t('Отключить все остальные')}</button>}
        {info && (confirm
          ? <div className="rounded-[20px] bg-tint p-3.5">
              <p className="text-[15px] leading-snug font-bold">{signedIn ? t('Чеки останутся в аккаунте, с этого устройства они исчезнут.') : t('Ты не вошёл в аккаунт: после выхода открыть эти чеки будет нельзя. Сначала войди.')}</p>
              <div className="mt-3 grid grid-cols-2 gap-2 [&>:first-child]:bg-white">
                <button type="button" className={quietCls} onClick={() => setConfirm(null)}>{t('Отмена')}</button>
                <button type="button" disabled={busy} className={dangerCls} onClick={() => void run(async () => { await signOut(confirm); onClose(); onToast(t('Ты вышел из аккаунта')); })}>{t('Выйти')}</button>
              </div>
            </div>
          : <div className="grid grid-cols-2 gap-2">
              <button type="button" className={quietCls} onClick={() => setConfirm('this')}>{t('Выйти здесь')}</button>
              <button type="button" className={quietCls} onClick={() => setConfirm('all')}>{t('Выйти везде')}</button>
            </div>)}
        <Msg>{msg}</Msg>
      </div>
    </Sheet>
  );
}

function DataSheet({ onClose, onToast }: { onClose(): void; onToast(s: string): void }) {
  const { busy, msg, run } = useBusy();
  const [sure, setSure] = useState('');
  const word = t('УДАЛИТЬ');
  const save = () => run(async () => {
    const blob = new Blob([JSON.stringify(await getAuthed('/api/account/export'), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = 'chek-up-data.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  });
  return (
    <Sheet title={t('Мои данные')} onClose={onClose}>
      <div className="grid gap-3">
        <p className="px-1 text-[14px] leading-snug font-semibold text-mute">{t('Храним позиции чеков, цены, состав семьи и отметки недель. Фото чеков не храним.')}</p>
        <button type="button" className={quietCls} disabled={busy} onClick={() => void save()}>{t('Скачать всё одним файлом')}</button>
        <div className="rounded-[20px] bg-[color-mix(in_srgb,var(--bad)_9%,var(--white))] p-3.5">
          <p className="text-[15px] leading-snug font-bold">{t('Удалить аккаунт навсегда')}</p>
          <p className="mt-1 text-[14px] leading-snug font-semibold text-mute">{t('Личные чеки сотрутся. Если в семье есть другие, общие чеки останутся им без твоего имени. Отменить нельзя.')}</p>
          <label className="mt-2.5 grid gap-1 text-[13px] font-bold text-mute">{t('Чтобы подтвердить, напиши {w}', { w: word })}<input className={`${inputCls} bg-white!`} value={sure} onChange={e => setSure(e.target.value)} autoComplete="off" /></label>
          <button type="button" className={`${dangerCls} mt-2.5 disabled:opacity-40`} disabled={busy || sure.trim().toUpperCase() !== word} onClick={() => void run(async () => { await deleteAccount(); onClose(); onToast(t('Аккаунт и данные удалены')); })}>{t('Удалить аккаунт')}</button>
        </div>
        <Msg>{msg}</Msg>
      </div>
    </Sheet>
  );
}

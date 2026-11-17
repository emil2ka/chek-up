'use client';
// «Профиль»: состав семьи и норма, достижения, установка на телефон, справка и очистка истории.
import { useEffect, useMemo, useRef, useState } from 'react';
import { CUBES, CUBE_G, pl, type Forms } from '@/lib/engine';
import { badges } from '@/lib/insights';
import { ADULT_G, KID_G, MAX_ADULTS, MAX_KIDS, familyDailyCubes, familyDailyG, profile as profileStore, type Profile as ProfileData } from '@/lib/profile';
import type { HistoryEntry } from '@/lib/types';
import { IconBadge, IconChevron, IconCube, IconDownload, IconInfo, IconTrash } from '@/components/icons';
import { Stepper } from '@/components/ui/Stepper';
import { LinkAccount } from './LinkAccount';

const RECEIPTS_F: Forms = ['чек', 'чека', 'чеков'];

type InstallEvent = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };

type Props = {
  ready: boolean;
  entries: HistoryEntry[];
  profile: ProfileData;
  onClear(): void;
  onReplayIntro(): void;
};

export function Profile({ ready, entries, profile, onClear, onReplayIntro }: Props) {
  const list = useMemo(() => badges(ready ? entries : [], profile), [ready, entries, profile]);
  const done = list.filter(b => b.done).length;
  const [picked, setPicked] = useState<string | null>(null);
  const [openRow, setOpenRow] = useState<'install' | 'how' | null>(null);
  const [confirm, setConfirm] = useState(false);
  const pickedBadge = list.find(b => b.id === picked) ?? null;

  const normCubes = familyDailyCubes(profile);
  const normG = familyDailyG(profile);

  // ── установка на телефон: в Chrome на Android браузер сам отдаёт событие ──
  const installEvent = useRef<InstallEvent | null>(null);
  const [canInstall, setCanInstall] = useState(false);
  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      installEvent.current = e as InstallEvent;
      setCanInstall(true);
    };
    addEventListener('beforeinstallprompt', onPrompt);
    return () => removeEventListener('beforeinstallprompt', onPrompt);
  }, []);
  const install = async () => {
    const ev = installEvent.current;
    if (!ev) return;
    await ev.prompt();
    await ev.userChoice.catch(() => null);
    installEvent.current = null;
    setCanInstall(false);
  };

  const row = 'flex min-h-15 w-full items-center gap-3 rounded-[20px] bg-tint px-3.5 text-left text-[16px] font-bold active:scale-[.985]';
  const rowIcon = 'grid size-9 flex-none place-items-center rounded-xl bg-white text-blue-1';

  return (
    <div className="flex min-h-full flex-col">
      <header className="relative overflow-clip px-5 pt-[calc(env(safe-area-inset-top)+16px)] pb-7 text-white">
        <div aria-hidden className="pointer-events-none absolute -top-24 -right-28 size-80 rounded-full bg-[radial-gradient(closest-side,color-mix(in_srgb,var(--blue-3)_55%,transparent),transparent)]" />
        <h1 className="rise relative font-display text-[22px] font-extrabold tracking-[-.04em]">Профиль</h1>
        <div className="rise relative mt-5 flex items-end justify-between gap-4" style={{ animationDelay: '60ms' }}>
          <div>
            <p className="text-[15px] font-semibold text-white/85">Норма твоей семьи</p>
            <p className="mt-1 font-display leading-[.9] font-black tracking-[-.06em]">
              <span className="text-[84px] tabular-nums">{normCubes}</span>
            </p>
            <p className="mt-1.5 font-display text-[17px] font-medium tracking-[-.01em]">{pl(normCubes, CUBES)} в день</p>
          </div>
          <IconCube className="mb-2 size-24 flex-none rotate-12 text-white drop-shadow-[0_14px_24px_color-mix(in_srgb,var(--ink)_40%,transparent)]" />
        </div>
      </header>

      <div className="on-light relative flex-1 rounded-t-sheet bg-white px-3.5 pt-6 pb-6 text-ink shadow-panel">
        {/* ── семья ── */}
        <section aria-labelledby="pf-h-family">
          <h2 id="pf-h-family" className="px-1 pb-3 font-display text-[19px] leading-tight font-extrabold tracking-[-.02em]">Кто ест из корзины</h2>
          <div className="grid gap-2">
            <Stepper label="Взрослые" hint={`до ${ADULT_G} г сахара в день`} value={profile.adults} min={1} max={MAX_ADULTS} onChange={v => profileStore.update({ adults: v })} />
            <Stepper label="Дети" hint={`до ${KID_G} г в день`} value={profile.kids} min={0} max={MAX_KIDS} onChange={v => profileStore.update({ kids: v })} />
          </div>
          <p className="mt-3 px-1 text-[14px] leading-snug font-semibold text-mute">
            На всю семью выходит до <b className="text-ink">{normG} г</b> добавленного сахара в день, или {normCubes * 7} {pl(normCubes * 7, CUBES)} в неделю.
            С этой нормой сравнивается раздел «Неделя».
          </p>
        </section>

        {/* ── достижения ── */}
        <section aria-labelledby="pf-h-badges" className="mt-8">
          <div className="flex items-center justify-between px-1 pb-3">
            <h2 id="pf-h-badges" className="font-display text-[19px] leading-tight font-extrabold tracking-[-.02em]">Достижения</h2>
            <span className="inline-flex h-8 items-center rounded-full bg-tint px-3 font-display text-sm font-extrabold text-blue-1">{done} из {list.length}</span>
          </div>
          <ul className="grid grid-cols-3 gap-2">
            {list.map(b => (
              <li key={b.id}>
                <button
                  type="button"
                  aria-pressed={picked === b.id}
                  aria-label={`${b.title}: ${b.done ? 'получено' : 'ещё нет'}. ${b.desc}`}
                  onClick={() => setPicked(picked === b.id ? null : b.id)}
                  className={`grid w-full justify-items-center gap-2 rounded-3xl px-1.5 pt-3.5 pb-3 transition active:scale-[.95] ${
                    picked === b.id ? 'bg-[color-mix(in_srgb,var(--blue-3)_26%,var(--tint))]' : 'bg-tint'
                  }`}
                >
                  <span className={`grid size-14 place-items-center rounded-[18px] ${
                    b.done
                      ? 'bg-sky text-white shadow-[inset_0_-4px_0_color-mix(in_srgb,var(--ink)_22%,transparent),0_10px_18px_-8px_var(--blue-1)]'
                      : 'bg-white text-[color-mix(in_srgb,var(--mute)_55%,var(--white))] shadow-[inset_0_0_0_1.5px_var(--line)]'
                  }`}>
                    <IconBadge name={b.icon} className="size-7" />
                  </span>
                  <span className={`min-h-8 text-center text-xs leading-[1.25] font-extrabold ${b.done ? 'text-ink' : 'text-mute'}`}>{b.title}</span>
                  {b.progress && !b.done && (
                    <span className="h-1.5 w-12 overflow-hidden rounded-full bg-white" aria-hidden="true">
                      <i className="block h-full rounded-full bg-blue-2" style={{ width: `${b.progress[0] / b.progress[1] * 100}%` }} />
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-3 min-h-11 rounded-2xl bg-tint px-3.5 py-3 text-[14px] leading-snug font-semibold" aria-live="polite">
            {pickedBadge
              ? <><b>{pickedBadge.title}.</b> {pickedBadge.desc}{pickedBadge.progress && !pickedBadge.done ? ` — ${pickedBadge.progress[0]} из ${pickedBadge.progress[1]}` : ''}{pickedBadge.done ? ' — получено.' : '.'}</>
              : <span className="text-mute">Нажми на значок, чтобы узнать, как его получить.</span>}
          </p>
        </section>

        {/* ── один аккаунт: общий сервер и БД с мобильным приложением ── */}
        <section aria-labelledby="pf-h-account" className="mt-8">
          <h2 id="pf-h-account" className="px-1 pb-3 font-display text-[19px] leading-tight font-extrabold tracking-[-.02em]">Один аккаунт</h2>
          <LinkAccount />
        </section>

        {/* ── приложение ── */}
        <section aria-labelledby="pf-h-app" className="mt-8">
          <h2 id="pf-h-app" className="px-1 pb-3 font-display text-[19px] leading-tight font-extrabold tracking-[-.02em]">Приложение</h2>
          <div className="grid gap-2">
            <div>
              <button type="button" aria-expanded={openRow === 'install'} onClick={() => setOpenRow(openRow === 'install' ? null : 'install')} className={row}>
                <span className={rowIcon}><IconDownload className="size-5" /></span>
                <span className="flex-1">Установить на телефон</span>
                <IconChevron className={`size-5 text-mute transition-transform ${openRow === 'install' ? 'rotate-90' : ''}`} />
              </button>
              {openRow === 'install' && (
                <div className="rise px-3.5 pt-3 pb-1 text-[15px] leading-snug font-semibold" style={{ animationDuration: '320ms' }}>
                  {canInstall && (
                    <button type="button" onClick={install} className="mb-3 inline-flex min-h-13 w-full items-center justify-center gap-2 rounded-btn bg-blue-1 px-5 font-display text-base font-bold text-white active:scale-[.97]">
                      <IconDownload className="size-5.5" />
                      <span>Установить</span>
                    </button>
                  )}
                  <p><b>iPhone:</b> в Safari нажми «Поделиться», затем «На экран „Домой“».</p>
                  <p className="mt-1.5"><b>Android:</b> в Chrome открой меню с тремя точками и выбери «Установить приложение».</p>
                  <p className="mt-1.5 text-mute">После этого «Чек-ап» открывается с рабочего стола на весь экран.</p>
                </div>
              )}
            </div>

            <div>
              <button type="button" aria-expanded={openRow === 'how'} onClick={() => setOpenRow(openRow === 'how' ? null : 'how')} className={row}>
                <span className={rowIcon}><IconInfo className="size-5.5" /></span>
                <span className="flex-1">Как считается оценка</span>
                <IconChevron className={`size-5 text-mute transition-transform ${openRow === 'how' ? 'rotate-90' : ''}`} />
              </button>
              {openRow === 'how' && (
                <div className="rise px-3.5 pt-3 pb-1 text-[15px] leading-snug font-semibold" style={{ animationDuration: '320ms' }}>
                  <p>Оценка корзины — от 0 до 100. Её снижают две вещи: доля вредных товаров в сумме чека и количество добавленного сахара.</p>
                  <p className="mt-1.5">Сахар показываем кубиками: 1 кубик = {CUBE_G} г. Считается только добавленный сахар; сахар в целых фруктах, овощах и молоке не учитывается.</p>
                  <p className="mt-1.5 text-mute">Цифры примерные: это ориентир для покупок, а не медицинская рекомендация.</p>
                </div>
              )}
            </div>

            <button type="button" onClick={onReplayIntro} className={row}>
              <span className={rowIcon}><IconCube className="size-5.5" /></span>
              <span className="flex-1">Показать знакомство заново</span>
              <IconChevron className="size-5 text-mute" />
            </button>

            {confirm ? (
              <div className="rounded-[20px] bg-[color-mix(in_srgb,var(--bad)_10%,var(--white))] p-3.5">
                <p className="text-[15px] leading-snug font-bold">
                  Удалить {entries.length} {pl(entries.length, RECEIPTS_F)} из истории? Вернуть их не получится.
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setConfirm(false)} className="min-h-12 rounded-2xl bg-white font-bold shadow-[inset_0_0_0_1.5px_var(--line)] active:scale-[.97]">Оставить</button>
                  <button type="button" onClick={() => { setConfirm(false); onClear(); }} className="min-h-12 rounded-2xl bg-bad font-bold text-white active:scale-[.97]">Удалить</button>
                </div>
              </div>
            ) : (
              <button type="button" disabled={!ready || entries.length === 0} onClick={() => setConfirm(true)} className={`${row} disabled:opacity-45 disabled:active:scale-100`}>
                <span className={`${rowIcon} text-bad`}><IconTrash className="size-5" /></span>
                <span className="flex-1">Очистить историю чеков</span>
              </button>
            )}
          </div>
        </section>

        <p className="mt-7 px-1 text-xs leading-relaxed font-semibold text-mute">
          Чек-ап, версия 0.1. Чеки и профиль хранятся на этом устройстве и в твоём аккаунте на сервере (без фото чеков). Оценки примерные и не заменяют консультацию врача.
        </p>
      </div>
    </div>
  );
}

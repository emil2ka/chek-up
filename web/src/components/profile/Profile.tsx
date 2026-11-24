'use client';
// «Профиль»: состав семьи и нормы, достижения, аккаунт и семья, язык, установка, справка.
import { useEffect, useMemo, useRef, useState } from 'react';
import { bigNum, CUBES, isCubeMetric, METRIC_IDS, METRICS, pl, UNITS_NOTE } from '@/lib/engine';
import type { FamilyState } from '@/lib/family';
import { t } from '@/lib/i18n';
import { badges, isDemo } from '@/lib/insights';
import { MAX_ADULTS, MAX_KIDS, familyDaily, familyDailyCubesOf, profile as profileStore, type Profile as ProfileData } from '@/lib/profile';
import type { WeekMark } from '@/lib/streak';
import type { HistoryEntry } from '@/lib/types';
import { Account } from '@/components/account/Account';
import { IconBadge, IconChevron, IconCube, IconDownload, IconInfo, IconTrash } from '@/components/icons';
import { RECEIPTS_F } from '@/components/streak/Streak';
import { dangerCls, H2, iconCls, quietCls, rowCls, Segmented } from '@/components/ui/kit';
import { Stepper } from '@/components/ui/Stepper';

type InstallEvent = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };

type Props = {
  ready: boolean;
  entries: HistoryEntry[];
  profile: ProfileData;
  family: FamilyState;
  marks: WeekMark[];
  best: number;
  /** стереть свои чеки */
  onClear(): void;
  onReplayIntro(): void;
  onToast(text: string): void;
};

export function Profile({ ready, entries, profile, family, marks, best, onClear, onReplayIntro, onToast }: Props) {
  const list = useMemo(() => badges(ready ? entries : [], profile, marks, best), [ready, entries, profile, marks, best]);
  const done = list.filter(b => b.done).length;
  const [picked, setPicked] = useState<string | null>(null);
  const [openRow, setOpenRow] = useState<'install' | 'how' | null>(null);
  const [confirm, setConfirm] = useState(false);
  const pickedBadge = list.find(b => b.id === picked) ?? null;
  const own = entries.filter(e => !e.by || e.by === family.me.id || isDemo(e)).length;
  const child = family.me.role === 'child';

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

  return (
    <div className="flex min-h-full flex-col">
      <header className="relative overflow-clip px-5 pt-[calc(env(safe-area-inset-top)+16px)] pb-6 text-white">
        <div aria-hidden className="pointer-events-none absolute -top-24 -right-28 size-80 rounded-full bg-[radial-gradient(closest-side,color-mix(in_srgb,var(--blue-3)_55%,transparent),transparent)]" />
        <h1 className="rise relative font-display text-[26px] font-black tracking-[-.04em]">{family.me.name || t('Профиль')}</h1>
        <p className="rise relative mt-3 text-[14px] font-semibold text-white/88" style={{ animationDelay: '60ms' }}>{t('Ориентиры на день для семьи')}</p>
        <ul className="rise relative mt-2 grid grid-cols-3 gap-2" style={{ animationDelay: '60ms' }}>
          {METRIC_IDS.map(m => (
            <li key={m} className="grid min-w-0 justify-items-start gap-0.5 rounded-2xl bg-white/12 p-2.5">
              <b className="font-display text-[20px] leading-none font-black tracking-[-.05em] tabular-nums">{bigNum(familyDaily(profile, m), m)}</b>
              <span className="flex min-w-0 items-center gap-1.5 text-[13px] font-bold text-white/88"><i aria-hidden className="size-2 flex-none rounded-full" style={{ background: METRICS[m].color, boxShadow: '0 0 0 1.5px rgba(255,255,255,.85)' }} /><span className="truncate">{m === 'kcal' ? t('Ккал') : `${t(METRICS[m].short)}, ${isCubeMetric(m) ? t('куб.') : t(METRICS[m].unit)}`}</span></span>
            </li>
          ))}
        </ul>
      </header>

      <div className="on-light relative flex-1 rounded-t-sheet bg-white px-3.5 pt-6 pb-6 text-ink shadow-panel">
        <section aria-labelledby="pf-h-family">
          <H2 id="pf-h-family">{t('Кто ест из корзины')}</H2>
          <fieldset disabled={child} className="grid gap-2">
            <Stepper label={t('Взрослые')} hint={t('до {a} г сахара и {b} г соли в день', { a: METRICS.sugar.adult, b: METRICS.salt.adult })} value={profile.adults} min={1} max={MAX_ADULTS} onChange={v => profileStore.updateFamily({ adults: v })} />
            <Stepper label={t('Дети')} hint={t('до {a} г сахара и {b} г соли в день', { a: METRICS.sugar.kid, b: METRICS.salt.kid })} value={profile.kids} min={0} max={MAX_KIDS} onChange={v => profileStore.updateFamily({ kids: v })} />
          </fieldset>
          <p className="mt-3 px-1 text-[14px] leading-snug font-semibold text-mute">
            {child ? t('Состав семьи меняет взрослый.') : t('На неделю это до {n} {w} сахара.', { n: familyDailyCubesOf(profile, 'sugar') * 7, w: pl(familyDailyCubesOf(profile, 'sugar') * 7, CUBES) })}
          </p>
        </section>

        <section aria-labelledby="pf-h-badges" className="mt-8">
          <H2 id="pf-h-badges" right={<span className="inline-flex h-8 items-center rounded-full bg-tint px-3 font-display text-sm font-extrabold text-blue-1">{done} {t('из')} {list.length}</span>}>{t('Достижения')}</H2>
          <ul className="grid grid-cols-3 gap-2">
            {list.map(b => (
              <li key={b.id}>
                <button
                  type="button"
                  aria-pressed={picked === b.id}
                  aria-label={`${t(b.title)}: ${b.done ? t('получено') : t('ещё нет')}. ${t(b.desc)}`}
                  onClick={() => setPicked(picked === b.id ? null : b.id)}
                  className={`grid w-full justify-items-center gap-2 rounded-3xl px-1.5 pt-3.5 pb-3 transition active:scale-[.95] ${picked === b.id ? 'bg-[color-mix(in_srgb,var(--blue-3)_26%,var(--tint))]' : 'bg-tint'}`}
                >
                  <span className={`grid size-14 place-items-center rounded-[18px] ${
                    b.done
                      ? 'bg-sky text-white shadow-[inset_0_-4px_0_color-mix(in_srgb,var(--ink)_22%,transparent),0_10px_18px_-8px_var(--blue-1)]'
                      : 'bg-white text-[color-mix(in_srgb,var(--mute)_55%,var(--white))] shadow-[inset_0_0_0_1.5px_var(--line)]'
                  }`}>
                    <IconBadge name={b.icon} className="size-7" />
                  </span>
                  <span className={`min-h-8 text-center text-xs leading-[1.25] font-extrabold ${b.done ? 'text-ink' : 'text-mute'}`}>{t(b.title)}</span>
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
              ? <><b>{t(pickedBadge.title)}.</b> {t(pickedBadge.desc)}. {pickedBadge.done ? t('Получено.') : pickedBadge.progress ? t('Сейчас {a} из {b}.', { a: pickedBadge.progress[0], b: pickedBadge.progress[1] }) : ''}</>
              : <span className="text-mute">{t('Нажми на значок, чтобы узнать, как его получить.')}</span>}
          </p>
        </section>

        <Account family={family} onToast={onToast} />

        <section aria-labelledby="pf-h-app" className="mt-8">
          <H2 id="pf-h-app">{t('Приложение')}</H2>
          <div className="grid gap-2">
            <Segmented label={t('Язык')} value={profile.lang} onChange={v => profileStore.update({ lang: v })} options={[['ru', 'Русский'], ['kk', 'Қазақша']] as const} />
            <div>
              <button type="button" aria-expanded={openRow === 'install'} onClick={() => setOpenRow(openRow === 'install' ? null : 'install')} className={rowCls}>
                <span className={iconCls}><IconDownload className="size-5" /></span>
                <span className="flex-1">{t('Установить на телефон')}</span>
                <IconChevron className={`size-5 text-mute transition-transform ${openRow === 'install' ? 'rotate-90' : ''}`} />
              </button>
              {openRow === 'install' && (
                <div className="rise px-3.5 pt-3 pb-1 text-[15px] leading-snug font-semibold" style={{ animationDuration: '320ms' }}>
                  {canInstall && (
                    <button type="button" onClick={install} className="mb-3 inline-flex min-h-13 w-full items-center justify-center gap-2 rounded-btn bg-blue-1 px-5 font-display text-base font-bold text-white active:scale-[.97]">
                      <IconDownload className="size-5.5" />
                      <span>{t('Установить')}</span>
                    </button>
                  )}
                  <p><b>iPhone:</b> {t('в Safari нажми «Поделиться», затем «На экран „Домой“».')}</p>
                  <p className="mt-1.5"><b>Android:</b> {t('в Chrome открой меню с тремя точками и выбери «Установить приложение». Тогда фото чека можно отправить сюда кнопкой «Поделиться» из галереи.')}</p>
                </div>
              )}
            </div>

            <div>
              <button type="button" aria-expanded={openRow === 'how'} onClick={() => setOpenRow(openRow === 'how' ? null : 'how')} className={rowCls}>
                <span className={iconCls}><IconInfo className="size-5.5" /></span>
                <span className="flex-1">{t('Как считаем')}</span>
                <IconChevron className={`size-5 text-mute transition-transform ${openRow === 'how' ? 'rotate-90' : ''}`} />
              </button>
              {openRow === 'how' && (
                <div className="rise grid gap-2 px-3.5 pt-3 pb-1 text-[15px] leading-snug font-semibold" style={{ animationDuration: '320ms' }}>
                  <p>{t('Оценка от 0 до 100 не зависит от размера корзины: сахар, соль и жиры сравниваем с калориями, вредное и алкоголь с суммой на еду. Запасы вроде сахара и масла делим на недели.')}</p>
                  <p>{t('Замены в чеке это план. В экономию и минус кубиков они попадут, когда следующий чек подтвердит, что ты правда купил другое.')}</p>
                  <p>{t('Стрик: неделя засчитана, если ты отметил, что внёс все чеки или что покупок не было. Прошлую неделю можно закрыть до вечера понедельника. За четыре недели даётся заморозка на пропуск, запас до двух.')}</p>
                  <p>{t(UNITS_NOTE)} {t('Сахар только добавленный, из цельных фруктов не считаем.')}</p>
                  <p className="text-mute">{t('Цифры примерные: это ориентир для покупок, а не медицинская рекомендация.')}</p>
                </div>
              )}
            </div>

            <button type="button" onClick={onReplayIntro} className={rowCls}>
              <span className={iconCls}><IconCube className="size-5.5" /></span>
              <span className="flex-1">{t('Показать знакомство заново')}</span>
              <IconChevron className="size-5 text-mute" />
            </button>

            {confirm ? (
              <div className="rounded-[20px] bg-[color-mix(in_srgb,var(--bad)_10%,var(--white))] p-3.5">
                <p className="text-[15px] leading-snug font-bold">{t('Удалить {n} {w}? Вернуть их не получится.', { n: own, w: pl(own, RECEIPTS_F) })}</p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setConfirm(false)} className={quietCls}>{t('Оставить')}</button>
                  <button type="button" onClick={() => { setConfirm(false); onClear(); }} className={dangerCls}>{t('Удалить')}</button>
                </div>
              </div>
            ) : (
              <button type="button" disabled={!ready || own === 0} onClick={() => setConfirm(true)} className={rowCls}>
                <span className={`${iconCls} text-bad!`}><IconTrash className="size-5" /></span>
                <span className="flex-1">{t('Удалить все мои чеки')}</span>
              </button>
            )}
          </div>
        </section>

        <p className="mt-7 px-1 text-xs leading-relaxed font-semibold text-mute">
          {t('Чек-ап, версия {v}. Чеки и профиль хранятся на этом устройстве и в твоём аккаунте на сервере. Фото чеков не храним. Оценки примерные и не заменяют консультацию врача.', { v: '0.2' })}
        </p>
      </div>
    </div>
  );
}

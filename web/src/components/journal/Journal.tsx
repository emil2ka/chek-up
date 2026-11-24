'use client';
// Журнал: календарь месяца, итоги, поиск и все чеки без ограничения по времени.
import { useMemo, useState } from 'react';
import { addMonths, dayTxt, daysInMonth, dowOf, DOW_SHORT, monthOf, monthTxt, todayIso } from '@/lib/calendar';
import { CUBES, money, pl, verdict } from '@/lib/engine';
import { t } from '@/lib/i18n';
import { isDemo, monthDays, monthStats, receiptOf } from '@/lib/insights';
import { factOf } from '@/lib/plan';
import type { HistoryEntry } from '@/lib/types';
import { IconChevron, IconLock, IconSearch } from '@/components/icons';
import { RECEIPTS_F } from '@/components/streak/Streak';
import { H2, inputCls } from '@/components/ui/kit';

type Props = { entries: HistoryEntry[]; names: Map<string, string>; hideMoney: boolean; onOpen(id: string): void };
const PAGE = 30;
const norm = (s: string) => s.toLowerCase().replaceAll('ё', 'е');

export function Journal({ entries, names, hideMoney, onOpen }: Props) {
  const today = todayIso();
  const [ym, setYm] = useState(monthOf(today));
  const [day, setDay] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(PAGE);

  const days = useMemo(() => monthDays(entries, ym), [entries, ym]);
  const sum = useMemo(() => monthStats(entries, ym), [entries, ym]);
  const prev = useMemo(() => monthStats(entries, addMonths(ym, -1)), [entries, ym]);
  const q = norm(query.trim());
  const list = useMemo(() => entries
    .filter(e => {
      const r = receiptOf(e);
      if (!r) return false;
      if (q) return norm(`${e.store} ${r.title} ${dayTxt(e.date)} ${r.items.map(i => i.n).join(' ')}`).includes(q);
      return day ? e.date === day : monthOf(e.date) === ym;
    })
    .sort((a, b) => b.date.localeCompare(a.date) || b.savedAt - a.savedAt), [entries, q, day, ym]);

  const first = dowOf(`${ym}-01`), n = daysInMonth(ym);
  const max = Math.max(1, ...[...days.values()].map(d => d.cubes));
  const go = (d: number) => { setYm(addMonths(ym, d)); setDay(null); setLimit(PAGE); };
  const diff = prev.cubes ? Math.round((sum.cubes - prev.cubes) / prev.cubes * 100) : 0;

  return (
    <>
      <section className="rs-sec" aria-labelledby="jr-month">
        <div className="flex items-center justify-between gap-2 pb-3">
          <button type="button" onClick={() => go(-1)} aria-label={t('Предыдущий месяц')} className="grid size-11 place-items-center rounded-2xl bg-tint text-blue-1 active:scale-[.92]"><IconChevron className="size-5 rotate-180" /></button>
          <h2 id="jr-month" className="font-display text-[19px] font-extrabold tracking-[-.02em]" aria-live="polite">{monthTxt(ym)}</h2>
          <button type="button" onClick={() => go(1)} disabled={ym >= monthOf(today)} aria-label={t('Следующий месяц')} className="grid size-11 place-items-center rounded-2xl bg-tint text-blue-1 active:scale-[.92] disabled:opacity-35"><IconChevron className="size-5" /></button>
        </div>
        <div className="grid grid-cols-7 gap-1 rounded-3xl bg-tint p-2.5">
          {DOW_SHORT.map(d => <span key={d} aria-hidden className="pb-1 text-center text-xs font-extrabold text-mute uppercase">{t(d)}</span>)}
          {Array.from({ length: first }, (_, i) => <span key={`e${i}`} aria-hidden />)}
          {Array.from({ length: n }, (_, i) => {
            const iso = `${ym}-${String(i + 1).padStart(2, '0')}`, d = days.get(iso), on = day === iso;
            return (
              <button
                key={iso} type="button" disabled={!d} aria-pressed={on}
                aria-label={`${dayTxt(iso)}: ${d ? `${d.n} ${pl(d.n, RECEIPTS_F)}, ${d.cubes} ${pl(d.cubes, CUBES)}` : t('чеков нет')}`}
                onClick={() => setDay(on ? null : iso)}
                className={`grid aspect-square min-w-0 place-items-center rounded-xl text-[14px] font-extrabold tabular-nums ${on ? 'ring-3 ring-ink' : ''} ${d ? 'text-white active:scale-[.93]' : iso === today ? 'text-blue-1' : 'text-mute'}`}
                style={d ? { background: `color-mix(in srgb, var(--blue-1) ${Math.round(45 + 55 * d.cubes / max)}%, var(--blue-3))` } : undefined}
              >{i + 1}</button>
            );
          })}
        </div>
      </section>

      <section className="rs-sec" aria-labelledby="jr-sum">
        <H2 id="jr-sum">{t('Итог месяца')}</H2>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-3xl bg-tint p-4">
            <p className="text-[13px] font-bold text-mute">{t('Сахар куплен')}</p>
            <p className="mt-1 font-display text-[26px] leading-none font-black tracking-[-.04em] tabular-nums">{sum.cubes}</p>
            <p className="mt-2 text-[13px] leading-tight font-semibold text-mute">{pl(sum.cubes, CUBES)}{prev.cubes ? ` · ${diff > 0 ? '+' : diff < 0 ? '−' : ''}${Math.abs(diff)}% ${t('к прошлому')}` : ''}</p>
          </div>
          <div className="rounded-3xl bg-tint p-4">
            <p className="text-[13px] font-bold text-mute">{hideMoney ? t('Чеков') : t('На продукты')}</p>
            <p className="mt-1 font-display text-[22px] leading-none font-black tracking-[-.04em] tabular-nums">{hideMoney ? sum.receipts : money(sum.food)}</p>
            <p className="mt-2 text-[13px] leading-tight font-semibold text-mute">{sum.receipts} {pl(sum.receipts, RECEIPTS_F)}</p>
          </div>
          {!hideMoney && (
            <>
              <div className="rounded-3xl bg-tint p-4">
                <p className="text-[13px] font-bold text-mute">{t('На вредное')}</p>
                <p className="mt-1 font-display text-[20px] leading-none font-black tracking-[-.04em] tabular-nums">{money(sum.junk)}</p>
                <p className="mt-2 text-[13px] leading-tight font-semibold text-mute">{sum.food ? t('{n}% еды', { n: Math.round(sum.junk / sum.food * 100) }) : '—'}</p>
              </div>
              <div className="rounded-3xl bg-[color-mix(in_srgb,var(--good)_12%,var(--white))] p-4">
                <p className="text-[13px] font-bold text-mute">{t('Замены сработали')}</p>
                <p className="mt-1 font-display text-[20px] leading-none font-black tracking-[-.04em] tabular-nums">{sum.saved < 0 ? `−${money(-sum.saved)}` : money(sum.saved)}</p>
                <p className="mt-2 text-[13px] leading-tight font-semibold text-mute">{t('подтверждено чеками')}</p>
              </div>
            </>
          )}
        </div>
        {!hideMoney && sum.stores.length > 1 && (
          <ul className="mt-2 grid gap-1.5 rounded-3xl bg-tint p-3.5">
            {sum.stores.map(s => <li key={s.name} className="flex justify-between gap-3 text-[14px] font-semibold"><span className="min-w-0 truncate">{s.name}</span><b className="font-display font-extrabold whitespace-nowrap tabular-nums">{money(s.total)}</b></li>)}
          </ul>
        )}
      </section>

      <section className="rs-sec" aria-labelledby="jr-list">
        <H2 id="jr-list">{day && !q ? dayTxt(day) : t('Все чеки')}</H2>
        <label className="relative mb-2 block">
          <span className="sr-only">{t('Поиск по чекам')}</span>
          <IconSearch className="pointer-events-none absolute top-3.5 left-3.5 size-6 text-blue-1" />
          <input type="search" className={`${inputCls} pl-12`} value={query} onChange={e => { setQuery(e.target.value); setLimit(PAGE); }} placeholder={t('Магазин или продукт')} />
        </label>
        {list.length === 0 ? <p className="rs-empty">{q ? t('Ничего не нашлось') : t('В этом месяце чеков нет')}</p> : (
          <ul className="grid gap-2">
            {list.slice(0, limit).map(e => {
              const r = receiptOf(e)!, a = factOf(e, r), score = r.masked ? e.score : a.score, v = verdict(score);
              const who = e.by ? names.get(e.by) : '';
              return (
                <li key={e.id}>
                  <button type="button" onClick={() => onOpen(e.id)} className="grid min-h-16 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-[22px] bg-tint px-4 py-2.5 text-left active:scale-[.985]">
                    <span className="grid min-w-0 gap-0.5">
                      <span className="flex min-w-0 items-center gap-1.5 font-display text-[15px] font-bold tracking-[-.02em]"><span className="truncate">{e.store}</span>{e.priv && <IconLock className="size-4 flex-none text-mute" aria-label={t('Личный чек')} />}</span>
                      <span className="text-[13px] leading-snug font-semibold text-mute">{dayTxt(e.date)}{r.refund ? ` · ${t('возврат')}` : ''}{e.tag === 'guests' ? ` · ${t('гости')}` : ''}{isDemo(e) ? ` · ${t('пример')}` : ''}{who ? ` · ${who}` : ''}{hideMoney || r.masked ? '' : ` · ${money(a.total)}`}</span>
                    </span>
                    <span className="inline-flex items-center gap-2"><b className="font-display text-xl font-black tracking-[-.04em] tabular-nums">{a.cubes}</b><i className={`dot ${v.tone}`} /><span className="sr-only">{pl(a.cubes, CUBES)}, {t('оценка')} {score}</span></span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {list.length > limit && <button type="button" onClick={() => setLimit(l => l + PAGE)} className="mt-2 min-h-12 w-full rounded-2xl bg-tint text-[14px] font-bold text-blue-1">{t('Показать ещё')}</button>}
      </section>
    </>
  );
}

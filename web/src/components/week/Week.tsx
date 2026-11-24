'use client';
// «Неделя»: гора за календарную неделю по факту, стрик и закрытие недели, норма и цель, дни, источники, деньги. Вторая вкладка — журнал.
import { useEffect, useMemo, useRef, useState } from 'react';
import { addDays, dayTxt, todayIso, weekOf, weekTxt } from '@/lib/calendar';
import { bigCap, bigNum, CUBES, hasMetricData, isCubeMetric, METRICS, metricTxt, money, PILE_HINTS, pl, unitNote, verdict, type Forms } from '@/lib/engine';
import type { FamilyState } from '@/lib/family';
import { t } from '@/lib/i18n';
import { completeness, goalState, GOALS, weekFacts, weekStats } from '@/lib/insights';
import { useNow } from '@/lib/now';
import { PALETTES, skinFor } from '@/lib/pile';
import { profile as profileStore, type Profile } from '@/lib/profile';
import { saltGrainCount } from '@/lib/saltCrystal';
import { weekToClose, type Streak, type WeekMark } from '@/lib/streak';
import type { HistoryEntry, MetricId, Tone } from '@/lib/types';
import { attachPile } from '@/components/result/attachPile';
import { IconCamera, IconChevron } from '@/components/icons';
import { Journal } from '@/components/journal/Journal';
import { RECEIPTS_F, StreakCard } from '@/components/streak/Streak';
import { MetricTabs } from '@/components/ui/MetricTabs';
import { Segmented } from '@/components/ui/kit';
import '@/components/result/result.css';

/** больше кубиков на экране не рисуем — счётчик всё равно показывает настоящее число */
const PILE_CAP = 220;
const ADULTS: Forms = ['взрослый', 'взрослых', 'взрослых'];
const KIDS: Forms = ['ребёнок', 'ребёнка', 'детей'];

type Props = {
  /** гидратация закончилась — можно читать журнал и запускать canvas */
  ready: boolean;
  entries: HistoryEntry[];
  profile: Profile;
  family: FamilyState;
  marks: WeekMark[];
  streak: Streak;
  onOpen(id: string): void;
  onScan(): void;
  onProfile(): void;
  onMark(week: string, state: WeekMark['state']): void;
  onShareWeek(week: string): void;
};

export function Week({ ready, entries, profile, family, marks, streak, onOpen, onScan, onProfile, onMark, onShareWeek }: Props) {
  const now = useNow();
  const thisWeek = weekOf(todayIso(now));
  const [week, setWeek] = useState(thisWeek);
  const [view, setView] = useState<'week' | 'journal'>('week');
  const list = useMemo(() => (ready ? entries : []), [ready, entries]);
  const stats = useMemo(() => weekStats(list, profile, { week, now }), [list, profile, week, now]);
  const facts = useMemo(() => weekFacts(list, profile), [list, profile]);
  const closing = weekToClose(marks, facts, now);
  const done = useMemo(() => completeness(list, marks, closing), [list, marks, closing]);
  const goal = useMemo(() => goalState(list, profile, marks, profile.goal, { week }), [list, profile, marks, week]);
  const names = useMemo(() => new Map(family.members.filter(m => !m.me).map(m => [m.id, m.name || t('участник')])), [family.members]);
  const child = family.me.role === 'child';

  const [metric, setMetric] = useState<MetricId>('sugar');
  const mdef = METRICS[metric];
  const mw = stats.metrics[metric];
  const { cubes, ratio, norm, total } = mw;
  const cubeMetric = isCubeMetric(metric);
  const pileCount = metric === 'salt' ? saltGrainCount(total) : Math.min(cubes, PILE_CAP);
  const pct = Math.round(ratio * 100);
  const tone: Tone = !mdef.harmful ? 'good' : ratio <= 0.7 ? 'good' : ratio <= 1 ? 'mid' : 'bad';
  const maxDay = Math.max(1, ...stats.days.map(d => d.amounts[metric]));
  const empty = ready && stats.receipts.length === 0 && total === 0;
  const incomplete = stats.receipts.some(({ analysis }) => analysis.items.some(it => !it.nf && !it.off && !hasMetricData(it, metric)));
  const current = week === thisWeek;

  const heroRef = useRef<HTMLElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const numRef = useRef<HTMLElement>(null);
  const capRef = useRef<HTMLParagraphElement>(null);
  const skin = streak.level;

  // ── гора за неделю ──
  useEffect(() => {
    const hero = heroRef.current, head = headRef.current, sheet = sheetRef.current, canvas = canvasRef.current;
    const num = numRef.current, cap = capRef.current;
    if (!ready || !hero || !head || !sheet || !canvas || !num || !cap) return;
    const shown = pileCount;
    const paint = (n: number) => {
      // если кубиков больше, чем рисуем, цифра всё равно доходит до настоящего значения
      const real = shown ? Math.round(n * cubes / shown) : 0;
      if (isCubeMetric(metric)) {
        num.textContent = String(real);
        cap.textContent = `${bigCap(real * METRICS[metric].cubeG, metric)} ${t('за неделю')}`;
        num.classList.toggle('is-3', real >= 100);
      }
    };
    paint(0);
    if (!shown) return;
    const pile = attachPile({ hero, head, sheet, canvas }, shown, paint, metric === 'sugar' ? skinFor(skin) : PALETTES[metric]);
    pile.set(shown);
    return () => pile.destroy();
  }, [ready, cubes, metric, pileCount, skin, week]);

  const familyTxt = `${profile.adults} ${pl(profile.adults, ADULTS)}${profile.kids ? ` ${t('и')} ${profile.kids} ${pl(profile.kids, KIDS)}` : ''}`;
  const over = total - norm;
  const normLine = incomplete
    ? t('Сумма по доступным данным: в части чеков этого показателя нет.')
    : empty
      ? t('Внеси чек — и здесь появятся данные за неделю.')
      : !mdef.harmful
        ? t('По чекам: {n}% недельного ориентира семьи.', { n: pct })
        : over > 0.05
          ? t('Это на {x} больше недельной нормы семьи.', { x: metricTxt(over, metric) })
          : t('В пределах недельной нормы семьи.');

  return (
    <div className="rs">
      <section className="rs-hero" ref={heroRef}>
        <header className="rs-bar">
          <div className="flex items-center gap-1 text-white">
            <button type="button" className="rs-ic" aria-label={t('Предыдущая неделя')} onClick={() => setWeek(w => addDays(w, -7))}><IconChevron className="rotate-180" /></button>
            <h1 className="min-w-0 px-1 text-center font-display text-[15px] leading-tight font-extrabold tracking-[-.03em]">{current ? t('Эта неделя') : weekTxt(week)}</h1>
            <button type="button" className="rs-ic disabled:opacity-35" aria-label={t('Следующая неделя')} disabled={current} onClick={() => setWeek(w => addDays(w, 7))}><IconChevron /></button>
          </div>
          <div className="rs-pill" role="status" data-tone={tone}>
            <i className="rs-dot" />
            <span className="rs-pill-t">{empty ? t('чеков нет') : t('{n}% нормы', { n: pct })}</span>
          </div>
        </header>
        <MetricTabs value={metric} onChange={setMetric} className="rs-tabs" />
        <div className="rs-head" ref={headRef}>
          <p className="rs-kick">{t('Куплено по чекам')}</p>
          <b key={`${metric}${week}`} className={`rs-num${bigNum(total, metric).length >= 4 ? ' is-wide' : !cubeMetric && bigNum(total, metric).length >= 3 ? ' is-3' : ''}`} aria-hidden="true" ref={numRef}>{cubeMetric ? '0' : bigNum(total, metric)}</b>
          <p key={`cap-${metric}${week}`} className="rs-cap" aria-hidden="true" ref={capRef}>{bigCap(cubeMetric ? 0 : total, metric)} {t('за неделю')}</p>
          <p className="rs-sr">{metricTxt(total, metric)} {t('за неделю')}, {t('{n}% нормы', { n: pct })}</p>
          {total > 0 && <p aria-hidden="true" className="rs-scene-hint rs-pile-hint">{t(PILE_HINTS[metric])}</p>}
        </div>
        <canvas className="rs-pile" ref={canvasRef} role={total > 0 ? 'button' : undefined} tabIndex={total > 0 ? 0 : undefined} aria-label={total > 0 ? t(PILE_HINTS[metric]) : undefined} />
      </section>

      <div className="rs-sheet on-light" ref={sheetRef}>
        <Segmented label={t('Раздел')} value={view} onChange={setView} options={[['week', t('Неделя')], ['journal', t('Журнал')]] as const} />

        {view === 'journal' ? <div className="mt-6"><Journal entries={list} names={names} hideMoney={child} onOpen={onOpen} /></div> : (
          <div className="mt-6">
            {current && (
              <StreakCard
                streak={streak} week={closing} done={done} best={family.bestWeeks} canEdit={!child}
                closedState={marks.find(m => m.week === closing)?.state ?? 'open'}
                onSet={onMark} onScan={onScan} onShare={() => onShareWeek(closing)}
              />
            )}

            {/* ── норма семьи ── */}
            <section className="rs-sec" aria-labelledby="wk-h-norm">
              <h2 id="wk-h-norm" className="rs-h">{t('Норма семьи')}</h2>
              <div className="rounded-3xl bg-tint p-4">
                <div className="flex items-end justify-between gap-3">
                  <p className="font-display leading-none font-black tracking-[-.05em]">
                    <span className="text-[46px] tabular-nums">{bigNum(total, metric)}</span>
                    <span className="ml-1.5 text-lg text-mute">{t('из')} {bigNum(norm, metric)}</span>
                  </p>
                  <p className="pb-1 text-right text-[13px] leading-tight font-bold text-mute">{bigCap(norm, metric)}<br />{t('в неделю')}</p>
                </div>
                <div className="relative mt-3 h-4 overflow-hidden rounded-full bg-white shadow-[inset_0_0_0_1px_var(--line)]" aria-hidden="true">
                  <i className={`block h-full rounded-full transition-[width] duration-700 ease-out ${tone === 'good' ? 'bg-good' : tone === 'mid' ? 'bg-mid' : 'bg-bad'}`} style={{ width: `${Math.max(total ? 4 : 0, Math.min(100, pct))}%` }} />
                </div>
                <p className="mt-3 text-[15px] leading-snug font-semibold">{normLine}</p>
                {mw.fromStock > 0.05 && <p className="mt-1.5 text-[13px] leading-snug font-semibold text-mute">{t('Из них {x} — из запасов, купленных раньше.', { x: metricTxt(mw.fromStock, metric) })}</p>}
                {stats.guests > 0 && <p className="mt-1.5 text-[13px] leading-snug font-semibold text-mute">{t('Чеки с пометкой «гости» в норму не входят.')}</p>}
                <button type="button" onClick={onProfile} className="mt-2 inline-flex min-h-11 items-center gap-1 rounded-xl text-[14px] font-bold text-blue-1 active:opacity-70">
                  <span>{t('Семья')}: {familyTxt}</span><IconChevron className="size-4" />
                </button>
              </div>
            </section>

            {/* ── личная цель ── */}
            {cubeMetric && (
              <section className="rs-sec" aria-labelledby="wk-h-goal">
                <h2 id="wk-h-goal" className="rs-h">{t('Цель')}</h2>
                <div className="rounded-3xl bg-tint p-4">
                  {goal.base < 2
                    ? <p className="text-[15px] leading-snug font-semibold">{t('Закрой две недели — посчитаем твоё обычное количество сахара и предложим цель.')}</p>
                    : profile.goal
                      ? <>
                          <p className="text-[15px] leading-snug font-semibold">{t('Обычно {a}, цель −{p}%: до {g} {w}.', { a: goal.average, p: profile.goal, g: goal.target, w: pl(goal.target, CUBES) })}</p>
                          <p className={`mt-1 text-[15px] font-extrabold ${goal.now <= goal.target ? 'text-[#0E8A51]' : 'text-[#B26A00]'}`}>{goal.now <= goal.target ? t('Идёшь по цели: {n}', { n: goal.now }) : t('Уже {n}, на {d} больше цели', { n: goal.now, d: goal.now - goal.target })}</p>
                        </>
                      : <p className="text-[15px] leading-snug font-semibold">{t('Обычно у вас {n} {w} в неделю. На сколько уменьшим?', { n: goal.average, w: pl(goal.average, CUBES) })}</p>}
                  {goal.base >= 2 && !child && (
                    <div className="mt-3 grid grid-cols-4 gap-1.5">
                      {[0, ...GOALS].map(g => <button key={g} type="button" aria-pressed={profile.goal === g} onClick={() => profileStore.updateFamily({ goal: g })} className={`min-h-11 rounded-full text-[14px] font-extrabold active:scale-[.96] ${profile.goal === g ? 'bg-blue-1 text-white' : 'bg-white text-ink'}`}>{g ? `−${g}%` : t('нет')}</button>)}
                    </div>
                  )}
                  <p className="mt-2 text-[13px] leading-snug font-semibold text-mute">{t('На стрик цель не влияет.')}</p>
                </div>
              </section>
            )}

            {/* ── по дням ── */}
            <section className="rs-sec" aria-labelledby="wk-h-days">
              <h2 id="wk-h-days" className="rs-h">{t('По дням')}</h2>
              <ol className="grid grid-cols-7 items-end gap-1.5 rounded-3xl bg-tint px-2.5 pt-4 pb-3">
                {stats.days.map(d => (
                  <li key={d.iso} className={`grid justify-items-center gap-1.5 ${d.future ? 'opacity-45' : ''}`}>
                    <span className={`font-display text-[13px] leading-none font-extrabold tabular-nums ${d.amounts[metric] ? 'text-ink' : 'text-transparent'}`}>{bigNum(d.amounts[metric], metric)}</span>
                    <span className="flex h-24 w-full items-end justify-center" aria-hidden="true">
                      <i className={`block w-full max-w-8 rounded-[9px] transition-[height] duration-700 ease-out ${d.amounts[metric] ? (d.today ? 'bg-blue-1' : 'bg-blue-3') : 'bg-line'}`} style={{ height: d.amounts[metric] ? `${Math.max(10, d.amounts[metric] / maxDay * 100)}%` : '6px' }} />
                    </span>
                    <span className={`text-xs leading-none font-extrabold uppercase ${d.today ? 'text-blue-1' : 'text-mute'}`}>{t(d.label)}</span>
                    <span className="sr-only">{dayTxt(d.iso)}: {metricTxt(d.amounts[metric], metric)}</span>
                  </li>
                ))}
              </ol>
            </section>

            {empty ? (
              <section className="rs-sec">
                <button type="button" onClick={onScan} className="inline-flex min-h-14 w-full items-center justify-center gap-2.5 rounded-btn bg-blue-1 px-5 font-display text-base font-bold text-white active:scale-[.97]"><IconCamera className="size-6" /><span>{t('Внести чек')}</span></button>
              </section>
            ) : (
              <>
                {mw.sources.length > 0 && (
                  <section className="rs-sec" aria-labelledby="wk-h-src">
                    <h2 id="wk-h-src" className="rs-h">{t('Главные источники')}</h2>
                    <ol className="grid gap-2">
                      {mw.sources.map((s, i) => (
                        <li key={s.name} className="grid grid-cols-[34px_minmax(0,1fr)_auto] items-center gap-3 rounded-[20px] bg-tint py-2.5 pr-4 pl-2.5">
                          <span className="grid size-8.5 place-items-center rounded-xl bg-white font-display text-sm font-black text-blue-1">{i + 1}</span>
                          <span className="line-clamp-2 min-w-0 text-[15px] leading-snug font-bold">{s.name}</span>
                          <span className="text-right leading-tight"><b className="font-display text-[17px] font-black tracking-[-.03em] tabular-nums">{bigNum(s.value, metric)}</b><small className="ml-1 text-xs font-bold text-mute">{bigCap(s.value, metric)}</small></span>
                        </li>
                      ))}
                    </ol>
                  </section>
                )}

                {!child && stats.receipts.length + stats.refunds.length > 0 && (
                  <section className="rs-sec" aria-labelledby="wk-h-money">
                    <h2 id="wk-h-money" className="rs-h">{t('Деньги')}</h2>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded-3xl bg-tint p-4">
                        <p className="text-[13px] font-bold text-mute">{t('На вредное')}</p>
                        <p className="mt-1 font-display text-[22px] leading-none font-black tracking-[-.04em] tabular-nums">{money(stats.junk)}</p>
                        <p className="mt-2 text-[13px] leading-tight font-semibold text-mute">{stats.food ? t('{n}% из {m} на еду', { n: Math.round(stats.junk / stats.food * 100), m: money(stats.food) }) : t('трат нет')}</p>
                      </div>
                      <div className="rounded-3xl bg-[color-mix(in_srgb,var(--good)_12%,var(--white))] p-4">
                        <p className="text-[13px] font-bold text-mute">{t('Замены сработали')}</p>
                        <p className="mt-1 font-display text-[22px] leading-none font-black tracking-[-.04em] tabular-nums">{stats.saved < 0 ? `−${money(-stats.saved)}` : money(stats.saved)}</p>
                        <p className="mt-2 text-[13px] leading-tight font-semibold text-mute">{stats.confirmed.length ? t('и минус {n} {w} сахара', { n: stats.cubesSaved, w: pl(stats.cubesSaved, CUBES) }) : t('засчитаем, когда следующий чек подтвердит')}</p>
                      </div>
                    </div>
                    {stats.confirmed.length > 0 && (
                      <ul className="mt-2 grid gap-1.5">
                        {stats.confirmed.slice(0, 4).map(c => <li key={`${c.planId}${c.i}`} className="rounded-2xl bg-[color-mix(in_srgb,var(--good)_9%,var(--white))] px-3.5 py-2.5 text-[14px] leading-snug font-semibold"><s className="text-mute">{c.from}</s> → <b>{c.to}</b></li>)}
                      </ul>
                    )}
                    {stats.flagged > 0 && (
                      <p className="mt-2 flex items-baseline justify-between gap-3 rounded-2xl bg-[color-mix(in_srgb,var(--bad)_8%,var(--white))] px-4 py-3 text-[14px] font-bold"><span>{t('Алкоголь и энергетики')}</span><b className="font-display text-[17px] font-extrabold">{money(stats.flagged)}</b></p>
                    )}
                  </section>
                )}

                {stats.receipts.length + stats.refunds.length > 0 && <section className="rs-sec" aria-labelledby="wk-h-rc">
                  <h2 id="wk-h-rc" className="rs-h">{stats.receipts.length} {pl(stats.receipts.length, RECEIPTS_F)} {t('за неделю')}</h2>
                  <ul className="grid gap-2">
                    {[...stats.receipts, ...stats.refunds].map(({ entry, receipt, analysis }) => {
                      const score = receipt.masked ? entry.score : analysis.score, v = verdict(score);
                      return (
                        <li key={entry.id}>
                          <button type="button" onClick={() => onOpen(entry.id)} className="grid min-h-15 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-[22px] bg-tint px-4 py-2.5 text-left active:scale-[.985]">
                            <span className="grid min-w-0 gap-0.5">
                              <span className="truncate font-display text-[15px] font-bold tracking-[-.02em]">{receipt.store}</span>
                              <span className="truncate text-[13px] font-semibold text-mute">{dayTxt(receipt.date)}{receipt.refund ? ` · ${t('возврат')}` : ''}{entry.tag === 'guests' ? ` · ${t('гости')}` : ''}{entry.by && names.get(entry.by) ? ` · ${names.get(entry.by)}` : ''}</span>
                            </span>
                            <span className="inline-flex items-center gap-2"><b className="font-display text-xl font-black tracking-[-.04em] tabular-nums">{receipt.refund ? '−' : ''}{bigNum(analysis.totals[metric], metric)}</b><i className={`dot ${v.tone}`} /><span className="sr-only">{bigCap(analysis.totals[metric], metric)}, {t('оценка')} {score}</span></span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>}
              </>
            )}

            <p className="rs-note">{t('Неделя — с понедельника по воскресенье. Это купленное, а не съеденное.')} {unitNote(metric)}. {t('Норма')}: {t(mdef.norm)}.</p>
          </div>
        )}
      </div>
    </div>
  );
}

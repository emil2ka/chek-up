'use client';
// «Неделя»: гора сахара из всех чеков за 7 дней, сравнение с нормой семьи, дни, источники, деньги.
// Верх переиспользует стили и кучу экрана результата (классы rs-…).
import { useEffect, useMemo, useRef, useState } from 'react';
import { bigCap, bigNum, dateRu, hasMetricData, isCubeMetric, METRICS, metricTxt, money, PILE_HINTS, pl, unitNote, verdict, type Forms } from '@/lib/engine';
import { PALETTES } from '@/lib/pile';
import { saltGrainCount } from '@/lib/saltCrystal';
import { weekStats } from '@/lib/insights';
import type { Profile } from '@/lib/profile';
import type { HistoryEntry, MetricId, Tone } from '@/lib/types';
import { attachPile } from '@/components/result/attachPile';
import { MetricTabs } from '@/components/ui/MetricTabs';
import { IconCamera, IconChevron, IconTrash } from '@/components/icons';
import '@/components/result/result.css';

/** больше кубиков на экране не рисуем — счётчик всё равно показывает настоящее число */
const PILE_CAP = 220;
const ADULTS: Forms = ['взрослый', 'взрослых', 'взрослых'];
const KIDS: Forms = ['ребёнок', 'ребёнка', 'детей'];
const RECEIPTS_F: Forms = ['чек', 'чека', 'чеков'];

type Props = {
  /** гидратация закончилась — можно читать историю и запускать canvas */
  ready: boolean;
  entries: HistoryEntry[];
  profile: Profile;
  onOpen(id: string): void;
  onDelete(id: string): void;
  onScan(): void;
  onProfile(): void;
};

export function Week({ ready, entries, profile, onOpen, onDelete, onScan, onProfile }: Props) {
  const stats = useMemo(
    () => weekStats(ready ? entries : [], profile),
    [ready, entries, profile],
  );
  const [metric, setMetric] = useState<MetricId>('sugar');
  const mdef = METRICS[metric];
  const mw = stats.metrics[metric];
  const { cubes, ratio, norm, total } = mw;
  const cubeMetric = isCubeMetric(metric);
  const pileCount = metric === 'salt' ? saltGrainCount(total) : Math.min(cubes, PILE_CAP);
  const pct = Math.round(ratio * 100);
  const tone: Tone = !mdef.harmful ? 'good' : ratio <= 0.7 ? 'good' : ratio <= 1 ? 'mid' : 'bad';
  const maxDay = Math.max(1, ...stats.days.map(d => d.amounts[metric]));
  const empty = ready && stats.receipts.length === 0;
  const incomplete = stats.receipts.some(({ analysis }) => analysis.items.some(({ active }) => !hasMetricData(active, metric)));

  const heroRef = useRef<HTMLElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const numRef = useRef<HTMLElement>(null);
  const capRef = useRef<HTMLParagraphElement>(null);

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
        cap.textContent = `${bigCap(real * METRICS[metric].cubeG, metric)} за 7 дней`;
        num.classList.toggle('is-3', real >= 100);
      }
    };
    paint(0);
    if (!shown) return;
    const pile = attachPile({ hero, head, sheet, canvas }, shown, paint, PALETTES[metric]);
    pile.set(shown);
    return () => pile.destroy();
  }, [ready, cubes, metric, pileCount]);

  const family = `${profile.adults} ${pl(profile.adults, ADULTS)}${profile.kids ? ` и ${profile.kids} ${pl(profile.kids, KIDS)}` : ''}`;
  const over = total - norm;
  const normLine = incomplete
    ? 'Сумма по доступным данным: в части чеков этого показателя нет.'
    : empty
    ? 'Отсканируй чек — и здесь появятся данные за неделю.'
    : !mdef.harmful
      ? `По чекам: ${pct}% недельного ориентира семьи.`
      : over > 0.05
        ? `Это на ${metricTxt(over, metric)} больше недельной нормы семьи.`
        : 'В пределах недельной нормы семьи.';

  return (
    <div className="rs">
      <section className="rs-hero" ref={heroRef}>
        <header className="rs-bar">
          <h1 className="pl-2 font-display text-[22px] font-extrabold tracking-[-.04em] text-white">Неделя</h1>
          <div className="rs-pill" role="status" data-tone={tone}>
            <i className="rs-dot" />
            <span className="rs-pill-t">{empty ? 'чеков пока нет' : `${pct}% нормы семьи`}</span>
          </div>
        </header>
        <MetricTabs value={metric} onChange={setMetric} className="rs-tabs" />
        <div className="rs-head" ref={headRef}>
          <p className="rs-kick">В чеках за неделю</p>
          <b key={metric} className={`rs-num${bigNum(total, metric).length >= 4 ? ' is-wide' : !cubeMetric && bigNum(total, metric).length >= 3 ? ' is-3' : ''}`} aria-hidden="true" ref={numRef}>{cubeMetric ? '0' : bigNum(total, metric)}</b>
          <p key={`cap-${metric}`} className="rs-cap" aria-hidden="true" ref={capRef}>{bigCap(cubeMetric ? 0 : total, metric)} за 7 дней</p>
          <p className="rs-sr">{metricTxt(total, metric)} за 7 дней, {pct}% нормы семьи</p>
          {total > 0 && <p aria-hidden="true" className="rs-scene-hint rs-pile-hint">{PILE_HINTS[metric]}</p>}
        </div>
        <canvas className="rs-pile" ref={canvasRef} role={total > 0 ? 'button' : undefined} tabIndex={total > 0 ? 0 : undefined} aria-label={total > 0 ? PILE_HINTS[metric] : undefined} />
      </section>

      <div className="rs-sheet on-light" ref={sheetRef}>
        {/* ── норма семьи ── */}
        <section className="rs-sec" aria-labelledby="wk-h-norm">
          <h2 id="wk-h-norm" className="rs-h">Норма семьи</h2>
          <div className="rounded-3xl bg-tint p-4">
            <div className="flex items-end justify-between gap-3">
              <p className="font-display leading-none font-black tracking-[-.05em]">
                <span className="text-[46px] tabular-nums">{bigNum(total, metric)}</span>
                <span className="ml-1.5 text-lg text-mute">из {bigNum(norm, metric)}</span>
              </p>
              <p className="pb-1 text-right text-[13px] leading-tight font-bold text-mute">{bigCap(norm, metric)}<br />в неделю</p>
            </div>
            <div className="relative mt-3 h-4 overflow-hidden rounded-full bg-white shadow-[inset_0_0_0_1px_var(--line)]" aria-hidden="true">
              <i
                className={`block h-full rounded-full transition-[width] duration-700 ease-out ${tone === 'good' ? 'bg-good' : tone === 'mid' ? 'bg-mid' : 'bg-bad'}`}
                style={{ width: `${Math.max(total ? 4 : 0, Math.min(100, pct))}%` }}
              />
            </div>
            <p className="mt-3 text-[15px] leading-snug font-semibold">{normLine}</p>
            <button
              type="button"
              onClick={onProfile}
              className="mt-2 inline-flex min-h-11 items-center gap-1 rounded-xl text-[14px] font-bold text-blue-1 active:opacity-70"
            >
              <span>Семья: {family}</span>
              <IconChevron className="size-4" />
            </button>
          </div>
        </section>

        {/* ── по дням ── */}
        <section className="rs-sec" aria-labelledby="wk-h-days">
          <h2 id="wk-h-days" className="rs-h">По дням</h2>
          <ol className="grid grid-cols-7 items-end gap-1.5 rounded-3xl bg-tint px-2.5 pt-4 pb-3">
            {stats.days.map(d => (
              <li key={d.iso} className="grid justify-items-center gap-1.5">
                <span className={`font-display text-[13px] leading-none font-extrabold tabular-nums ${d.amounts[metric] ? 'text-ink' : 'text-transparent'}`}>
                  {bigNum(d.amounts[metric], metric)}
                </span>
                <span className="flex h-24 w-full items-end justify-center" aria-hidden="true">
                  <i
                    className={`block w-full max-w-8 rounded-[9px] transition-[height] duration-700 ease-out ${
                      d.amounts[metric] ? (d.today ? 'bg-blue-1' : 'bg-blue-3') : 'bg-line'
                    }`}
                    style={{ height: d.amounts[metric] ? `${Math.max(10, d.amounts[metric] / maxDay * 100)}%` : '6px' }}
                  />
                </span>
                <span className={`text-xs leading-none font-extrabold uppercase ${d.today ? 'text-blue-1' : 'text-mute'}`}>{d.label}</span>
                <span className="sr-only">{d.day}-е число: {metricTxt(d.amounts[metric], metric)}</span>
              </li>
            ))}
          </ol>
        </section>

        {empty ? (
          <section className="rs-sec">
            <div className="rounded-3xl bg-sky p-5 text-white">
              <p className="font-display text-[22px] leading-[1.05] font-black tracking-[-.04em]">Неделя пока пустая</p>
              <p className="mt-2 text-[15px] leading-snug font-semibold text-white/90">
                Сканируй чеки после каждого похода в магазин — увидишь, сколько семья покупает за неделю.
              </p>
              <button
                type="button"
                onClick={onScan}
                className="btn-white mt-4 inline-flex min-h-14 w-full items-center justify-center gap-2.5 rounded-btn px-5 font-display text-base font-bold active:scale-[.97]"
              >
                <IconCamera className="size-6" />
                <span>Сканировать чек</span>
              </button>
            </div>
          </section>
        ) : (
          <>
            {/* ── источники ── */}
            {mw.sources.length > 0 && (
              <section className="rs-sec" aria-labelledby="wk-h-src">
                <h2 id="wk-h-src" className="rs-h">Главные источники</h2>
                <ol className="grid gap-2">
                  {mw.sources.map((s, i) => {
                    return (
                      <li key={s.name} className="grid grid-cols-[34px_minmax(0,1fr)_auto] items-center gap-3 rounded-[20px] bg-tint py-2.5 pr-4 pl-2.5">
                        <span className="grid size-8.5 place-items-center rounded-xl bg-white font-display text-sm font-black text-blue-1">{i + 1}</span>
                        <span className="min-w-0 truncate text-[15px] font-bold">{s.name}</span>
                        <span className="text-right leading-tight">
                          <b className="font-display text-[17px] font-black tracking-[-.03em] tabular-nums">{bigNum(s.value, metric)}</b>
                          <small className="ml-1 text-xs font-bold text-mute">{bigCap(s.value, metric)}</small>
                        </span>
                      </li>
                    );
                  })}
                </ol>
              </section>
            )}

            {/* ── деньги ── */}
            <section className="rs-sec" aria-labelledby="wk-h-money">
              <h2 id="wk-h-money" className="rs-h">Деньги</h2>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-3xl bg-tint p-4">
                  <p className="text-[13px] font-bold text-mute">На вредное</p>
                  <p className="mt-1 font-display text-[22px] leading-none font-black tracking-[-.04em] tabular-nums">{money(stats.junk)}</p>
                  <p className="mt-2 text-[13px] leading-tight font-semibold text-mute">
                    {stats.total ? `${Math.round(stats.junk / stats.total * 100)}% всех трат` : 'трат нет'}
                  </p>
                </div>
                <div className="rounded-3xl bg-[color-mix(in_srgb,var(--good)_12%,var(--white))] p-4">
                  <p className="text-[13px] font-bold text-mute">Замены экономят</p>
                  <p className="mt-1 font-display text-[22px] leading-none font-black tracking-[-.04em] tabular-nums">
                    {stats.saved >= 0 ? money(stats.saved) : `−${money(-stats.saved)}`}
                  </p>
                  <p className="mt-2 text-[13px] leading-tight font-semibold text-mute">
                    {mw.amountSaved > 0.05 ? `и минус ${metricTxt(mw.amountSaved, metric)}` : 'эффект зависит от выбранных замен'}
                  </p>
                </div>
              </div>
            </section>

            {stats.flagged > 0 && (
              <section className="rs-sec" aria-labelledby="wk-h-flag">
                <h2 id="wk-h-flag" className="rs-h">Алкоголь и энергетики</h2>
                <div className="rounded-3xl bg-[color-mix(in_srgb,var(--bad)_8%,var(--white))] p-4">
                  <p className="font-display text-[26px] leading-none font-black tracking-[-.04em] tabular-nums">{money(stats.flagged)}</p>
                  <p className="mt-2 text-[13px] leading-tight font-semibold text-mute">
                    {stats.total ? `${Math.round(stats.flagged / stats.total * 100)}% всех трат за неделю` : ''}
                  </p>
                </div>
              </section>
            )}

            {/* ── чеки недели ── */}
            <section className="rs-sec" aria-labelledby="wk-h-rc">
              <h2 id="wk-h-rc" className="rs-h">
                {stats.receipts.length} {pl(stats.receipts.length, RECEIPTS_F)} за неделю
              </h2>
              <ul className="grid gap-2">
                {stats.receipts.map(({ entry, receipt, analysis }) => {
                  const v = verdict(analysis.score);
                  return (
                    <li key={entry.id} className="grid grid-cols-[minmax(0,1fr)_44px] items-center gap-1 rounded-[22px] bg-tint p-1.5">
                      <button
                        type="button"
                        onClick={() => onOpen(entry.id)}
                        className="grid min-h-14 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-2xl px-2.5 py-1.5 text-left active:scale-[.985]"
                      >
                        <span className="grid min-w-0 gap-0.5">
                          <span className="truncate font-display text-[15px] font-bold tracking-[-.02em]">{receipt.store}</span>
                          <span className="truncate text-[13px] font-semibold text-mute">{dateRu(receipt.date)} · {receipt.title}</span>
                        </span>
                        <span className="inline-flex items-center gap-2">
                          <b className="font-display text-xl font-black tracking-[-.04em] tabular-nums">{bigNum(analysis.totals[metric], metric)}</b>
                          <i className={`dot ${v.tone}`} />
                          <span className="sr-only">{bigCap(analysis.totals[metric], metric)}, оценка {analysis.score}, {v.label}</span>
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(entry.id)}
                        aria-label={`Удалить чек: ${receipt.store}, ${dateRu(receipt.date)}`}
                        className="grid size-11 place-items-center rounded-2xl text-mute transition active:scale-[.9] active:text-bad"
                      >
                        <IconTrash className="size-5" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          </>
        )}

        <p className="rs-note">
          Неделя считается по датам чеков. Это купленное, а не съеденное: часть продуктов останется на потом.
          {unitNote(metric)}. Норма: {mdef.norm}.
        </p>
      </div>
    </div>
  );
}

'use client';
// «Неделя»: гора сахара из всех чеков за 7 дней, сравнение с нормой семьи, дни, источники, деньги.
// Верх переиспользует стили и кучу экрана результата (классы rs-…).
import { useEffect, useMemo, useRef } from 'react';
import { CUBES, CUBE_G, dateRu, money, pl, verdict, type Forms } from '@/lib/engine';
import { weekStats } from '@/lib/insights';
import type { Profile } from '@/lib/profile';
import type { HistoryEntry, Tone } from '@/lib/types';
import { attachPile } from '@/components/result/attachPile';
import { capOf } from '@/components/result/model';
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
  const { cubes, ratio, normCubes } = stats;
  const pct = Math.round(ratio * 100);
  const tone: Tone = ratio <= 0.7 ? 'good' : ratio <= 1 ? 'mid' : 'bad';
  const maxDay = Math.max(1, ...stats.days.map(d => d.cubes));
  const empty = ready && stats.receipts.length === 0;

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
    const shown = Math.min(cubes, PILE_CAP);
    const paint = (n: number) => {
      // если кубиков больше, чем рисуем, цифра всё равно доходит до настоящего значения
      const real = shown ? Math.round(n * cubes / shown) : 0;
      num.textContent = String(real);
      cap.textContent = `${capOf(real)} за 7 дней`;
      num.classList.toggle('is-3', real >= 100);
    };
    paint(0);
    if (!shown) return;
    const pile = attachPile({ hero, head, sheet, canvas }, shown, paint);
    pile.set(shown);
    return () => pile.destroy();
  }, [ready, cubes]);

  const family = `${profile.adults} ${pl(profile.adults, ADULTS)}${profile.kids ? ` и ${profile.kids} ${pl(profile.kids, KIDS)}` : ''}`;
  const over = cubes - normCubes;
  const normLine = empty
    ? 'Отсканируй чек — и здесь появится гора сахара за неделю.'
    : over > 0
      ? `Это на ${over} ${pl(over, CUBES)} больше недельной нормы семьи.`
      : ratio <= 0.7
        ? 'Отличная неделя: сахара заметно меньше нормы.'
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
        <div className="rs-head" ref={headRef}>
          <p className="rs-kick">В чеках за неделю</p>
          <b className="rs-num" aria-hidden="true" ref={numRef}>0</b>
          <p className="rs-cap" aria-hidden="true" ref={capRef}>{capOf(0)} за 7 дней</p>
          <p className="rs-sr">{cubes} {pl(cubes, CUBES)} сахара за 7 дней, {pct}% нормы семьи</p>
        </div>
        <canvas className="rs-pile" ref={canvasRef} role="img" aria-label="Гора сахара за неделю. Нажми, чтобы подбросить" />
      </section>

      <div className="rs-sheet on-light" ref={sheetRef}>
        {/* ── норма семьи ── */}
        <section className="rs-sec" aria-labelledby="wk-h-norm">
          <h2 id="wk-h-norm" className="rs-h">Норма семьи</h2>
          <div className="rounded-3xl bg-tint p-4">
            <div className="flex items-end justify-between gap-3">
              <p className="font-display leading-none font-black tracking-[-.05em]">
                <span className="text-[46px] tabular-nums">{cubes}</span>
                <span className="ml-1.5 text-lg text-mute">из {normCubes}</span>
              </p>
              <p className="pb-1 text-right text-[13px] leading-tight font-bold text-mute">{pl(normCubes, CUBES)}<br />в неделю</p>
            </div>
            <div className="relative mt-3 h-4 overflow-hidden rounded-full bg-white shadow-[inset_0_0_0_1px_var(--line)]" aria-hidden="true">
              <i
                className={`block h-full rounded-full transition-[width] duration-700 ease-out ${tone === 'good' ? 'bg-good' : tone === 'mid' ? 'bg-mid' : 'bg-bad'}`}
                style={{ width: `${Math.max(cubes ? 4 : 0, Math.min(100, pct))}%` }}
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
                <span className={`font-display text-[13px] leading-none font-extrabold tabular-nums ${d.cubes ? 'text-ink' : 'text-transparent'}`}>
                  {d.cubes || 0}
                </span>
                <span className="flex h-24 w-full items-end justify-center" aria-hidden="true">
                  <i
                    className={`block w-full max-w-8 rounded-[9px] transition-[height] duration-700 ease-out ${
                      d.cubes ? (d.today ? 'bg-blue-1' : 'bg-blue-3') : 'bg-line'
                    }`}
                    style={{ height: d.cubes ? `${Math.max(10, d.cubes / maxDay * 100)}%` : '6px' }}
                  />
                </span>
                <span className={`text-xs leading-none font-extrabold uppercase ${d.today ? 'text-blue-1' : 'text-mute'}`}>{d.label}</span>
                <span className="sr-only">{d.day}-е число: {d.cubes} {pl(d.cubes, CUBES)}</span>
              </li>
            ))}
          </ol>
        </section>

        {empty ? (
          <section className="rs-sec">
            <div className="rounded-3xl bg-sky p-5 text-white">
              <p className="font-display text-[22px] leading-[1.05] font-black tracking-[-.04em]">Неделя пока пустая</p>
              <p className="mt-2 text-[15px] leading-snug font-semibold text-white/90">
                Сканируй чеки после каждого похода в магазин — увидишь, сколько сахара семья покупает за неделю.
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
            {stats.sources.length > 0 && (
              <section className="rs-sec" aria-labelledby="wk-h-src">
                <h2 id="wk-h-src" className="rs-h">Главные источники</h2>
                <ol className="grid gap-2">
                  {stats.sources.map((s, i) => {
                    const c = Math.round(s.grams / CUBE_G);
                    return (
                      <li key={s.name} className="grid grid-cols-[34px_minmax(0,1fr)_auto] items-center gap-3 rounded-[20px] bg-tint py-2.5 pr-4 pl-2.5">
                        <span className="grid size-8.5 place-items-center rounded-xl bg-white font-display text-sm font-black text-blue-1">{i + 1}</span>
                        <span className="min-w-0 truncate text-[15px] font-bold">{s.name}</span>
                        <span className="text-right leading-tight">
                          <b className="font-display text-[17px] font-black tracking-[-.03em] tabular-nums">{c}</b>
                          <small className="ml-1 text-xs font-bold text-mute">{pl(c, CUBES)}</small>
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
                    {stats.cubesSaved > 0 ? `и минус ${stats.cubesSaved} ${pl(stats.cubesSaved, CUBES)}` : 'включи замены в чеке'}
                  </p>
                </div>
              </div>
            </section>

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
                          <b className="font-display text-xl font-black tracking-[-.04em] tabular-nums">{analysis.cubes}</b>
                          <i className={`dot ${v.tone}`} />
                          <span className="sr-only">{pl(analysis.cubes, CUBES)}, оценка {analysis.score}, {v.label}</span>
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
          Неделя считается по датам чеков. Это купленный сахар, а не съеденный: часть продуктов останется на потом.
          1 кубик = {CUBE_G} г.
        </p>
      </div>
    </div>
  );
}

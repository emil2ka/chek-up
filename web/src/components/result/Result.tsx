'use client';
// Экран результата в стиле «Гора сахара».
// Контракт (его менять нельзя, на нём держится оболочка):
//   export default function Result(props: ResultProps)
//   ResultProps = { receipt, swaps, onBack(), onScan(), onChange({ swaps, analysis }) } — см. src/lib/types.ts
//   onChange вызывается сразу после монтирования и после каждого переключения замены.
//   Компонент рисуется внутри прокручиваемого экрана оболочки.
//
// Устройство: расчёты — model.ts (без DOM), куча — attachPile.ts + lib/pile.ts (императивно через ref),
// разметка — здесь. Большая цифра обновляется напрямую из onCount, без перерисовки React на каждый кубик.
import {
  useEffect, useEffectEvent, useMemo, useRef, useState, useSyncExternalStore,
  type CSSProperties, type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import type { ResultProps } from '@/lib/types';
import { bigCap, bigNum, dateRu, isCubeMetric, METRICS, metricTxt, money, PILE_HINTS, verdict } from '@/lib/engine';
import { PALETTES } from '@/lib/pile';
import { saltGrainCount } from '@/lib/saltCrystal';
import { shareCard } from '@/lib/shareCard';
import type { MetricId } from '@/lib/types';
import { MetricTabs } from '@/components/ui/MetricTabs';
import { NOTE, resultModel, swapRows, type ResultModel } from './model';
import { Prices } from './Prices';
import { attachPile, type PileHandle } from './attachPile';
import './result.css';

const PATHS = {
  back: <path d="M15 5l-7 7 7 7" />,
  share: <><path d="M12 3.5v11" /><path d="M7.5 8L12 3.5 16.5 8" /><path d="M6 12.5v5.5a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-5.5" /></>,
  check: <path d="M6 12.5l4 4 8-9" />,
  camera: <><path d="M4 8.5h3.2l1.8-2.6h6l1.8 2.6H20v10.5H4z" /><circle cx="12" cy="13.6" r="3.4" /></>,
  cal: <><rect x="4" y="5.5" width="16" height="14.5" rx="3" /><path d="M4 10.5h16M9 3.5v4M15 3.5v4" /></>,
  arrow: <path d="M5 12h13M13 7l5 5-5 5" />,
} satisfies Record<string, ReactNode>;

function Icon({ name, className }: { name: keyof typeof PATHS; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[name]}
    </svg>
  );
}

const noop = () => () => {};
const sortNums = (a: number, b: number) => a - b;

export default function Result({ receipt, swaps, onBack, onScan, onChange }: ResultProps) {
  const [on, setOn] = useState<number[]>(() => [...new Set(swaps)].sort(sortNums));
  const [metric, setMetric] = useState<MetricId>('sugar');
  const model = useMemo(() => resultModel(receipt, on, metric), [receipt, on, metric]);
  const rows = useMemo(() => swapRows(receipt, metric), [receipt, metric]);
  const maxCubes = useMemo(() => resultModel(receipt, [], metric).maxCubes, [receipt, metric]);
  const cubes = model.analysis.cubesBy[metric];
  const mdef = METRICS[metric];
  const total = model.analysis.totals[metric];
  const available = model.available.includes(metric);
  const cubeMetric = isCubeMetric(metric);
  const animatedCount = cubeMetric && maxCubes <= 220 && cubes <= 220;
  const pileCount = metric === 'salt' ? saltGrainCount(total) : Math.min(cubes, 220);

  const [srcReady, setSrcReady] = useState(false);
  const [toast, setToast] = useState({ id: 0, text: '', on: false });
  const client = useSyncExternalStore(noop, () => true, () => false);

  const heroRef = useRef<HTMLElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const numRef = useRef<HTMLElement>(null);
  const capRef = useRef<HTMLParagraphElement>(null);
  const pileRef = useRef<PileHandle | null>(null);

  // ——— куча: создаётся в эффекте и уничтожается при размонтировании (Strict Mode создаст её заново) ———
  const target = useEffectEvent(() => pileCount);
  const paintCount = useEffectEvent((n: number, num: HTMLElement, cap: HTMLParagraphElement) => {
    if (!animatedCount) return;
    num.textContent = String(n);
    cap.textContent = bigCap(n * mdef.cubeG, metric);
    num.classList.toggle('is-3', n >= 100);
  });
  useEffect(() => {
    const hero = heroRef.current, head = headRef.current, sheet = sheetRef.current, canvas = canvasRef.current;
    const num = numRef.current, cap = capRef.current;
    if (!hero || !head || !sheet || !canvas || !num || !cap) return;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

    // счётчик идёт вместе с кубиками — пишем прямо в DOM
    let shown = -1;
    const paint = (n: number) => {
      shown = n;
      paintCount(n, num, cap);
    };
    paint(0);
    const onCount = (n: number) => {
      if (n === shown) return;
      paint(n);
      if (!reduced && isCubeMetric(metric)) num.animate?.([{ transform: 'scale(1.045)' }, { transform: 'scale(1)' }], { duration: 160, easing: 'ease-out' });
    };

    const pile = attachPile({ hero, head, sheet, canvas }, Math.min(220, maxCubes), onCount, PALETTES[metric]);
    pileRef.current = pile;
    pile.set(target());
    return () => {
      pile.destroy();
      if (pileRef.current === pile) pileRef.current = null;
    };
  }, [receipt, maxCubes, metric, available]);

  // замены → куча
  useEffect(() => { pileRef.current?.set(pileCount); }, [pileCount]);

  // onChange: один раз после монтирования и после каждого переключения (повтор эффекта в Strict Mode не дублирует)
  const emitChange = useEffectEvent((m: ResultModel) => onChange({ swaps: m.swaps, analysis: m.analysis }));
  const emitted = useRef<ResultModel | null>(null);
  useEffect(() => {
    if (emitted.current === model) return;
    emitted.current = model;
    emitChange(model);
  }, [model]);

  // полосы «Откуда сахар» вырастают только при первом показе
  useEffect(() => {
    const t = setTimeout(() => setSrcReady(true), 800);
    return () => clearTimeout(t);
  }, []);

  // уведомление
  useEffect(() => {
    if (!toast.on) return;
    const t = setTimeout(() => setToast(s => ({ ...s, on: false })), 2200);
    return () => clearTimeout(t);
  }, [toast.id, toast.on]);
  const say = (text: string) => setToast(s => ({ id: s.id + 1, text, on: true }));

  const toggle = (i: number) => {
    setOn(prev => (prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i].sort(sortNums)));
    if (navigator.userActivation?.isActive !== false) navigator.vibrate?.(8);
  };

  const sharing = useRef(false);
  const share = async () => {
    const text = model.shareText;
    // сначала пробуем картинку-карточку; если не вышло — делимся текстом, как раньше
    if (sharing.current) return;
    sharing.current = true;
    try {
      const a = model.analysis;
      const how = await shareCard({
        metric,
        cubesBy: a.cubesBy,
        totals: a.totals,
        available: model.available,
        score: a.score,
        verdict: verdict(a.score).label.toLowerCase(),
        tone: model.tone,
        where: `${receipt.store} · ${dateRu(receipt.date)}`,
      }, text);
      if (how === 'saved') say('Картинка сохранена — отправь её друзьям');
      return;
    } catch {
      /* canvas или шрифты подвели — ниже запасной путь */
    } finally {
      sharing.current = false;
    }
    if (navigator.share) {
      try { await navigator.share({ title: 'Чек-ап', text }); return; }
      catch (e) { if ((e as Error)?.name === 'AbortError') return; }
    }
    try { await navigator.clipboard.writeText(text); say('Текст скопирован — вставь его в чат'); }
    catch { say('Не получилось скопировать'); }
  };

  const { summary, junk, harm, flagged } = model;

  return (
    <div className="rs">
      <section className="rs-hero" ref={heroRef}>
        <header className="rs-bar">
          <button className="rs-ic" type="button" aria-label="Назад" onClick={onBack}><Icon name="back" /></button>
          <div className="rs-pill" role="status" data-tone={model.tone}>
            <i className="rs-dot" />
            <span className="rs-pill-t">{model.pill}</span>
          </div>
          <button className="rs-ic" type="button" aria-label="Поделиться результатом" onClick={share}><Icon name="share" /></button>
        </header>
        <MetricTabs value={metric} onChange={setMetric} className="rs-tabs" />
        <div className="rs-head" ref={headRef}>
          <p className="rs-kick">В твоём чеке</p>
          <b key={metric} className={`rs-num${bigNum(total, metric).length >= 4 ? ' is-wide' : !animatedCount && bigNum(total, metric).length >= 3 ? ' is-3' : ''}`} aria-hidden="true" ref={numRef}>{!available ? '—' : animatedCount ? '0' : bigNum(total, metric)}</b>
          <p key={`cap-${metric}`} className="rs-cap" aria-hidden="true" ref={capRef}>{available ? bigCap(animatedCount ? 0 : total, metric) : 'нет данных в этом чеке'}</p>
          <p className="rs-sr">{model.srLabel}</p>
          {available && total > 0 && <p aria-hidden="true" className="rs-scene-hint rs-pile-hint">{PILE_HINTS[metric]}</p>}
        </div>
        {available && <canvas className="rs-pile" ref={canvasRef} role={total > 0 ? 'button' : undefined} tabIndex={total > 0 ? 0 : undefined} aria-label={total > 0 ? PILE_HINTS[metric] : undefined} />}
      </section>

      <div className="rs-sheet" ref={sheetRef}>
        <section className="rs-sec rs-swaps" aria-labelledby="rs-h-sw">
          <h2 id="rs-h-sw" className="rs-h">{cubeMetric ? 'Замени — и кубики исчезнут' : 'Что изменится с заменой'}</h2>
          {rows.length ? (
            <ul className="rs-sw-list">
              {rows.map(r => (
                <li key={r.i}>
                  <button className="rs-sw" type="button" aria-pressed={on.includes(r.i)} onClick={() => toggle(r.i)}>
                    <span className="rs-chk"><Icon name="check" /></span>
                    <span className="rs-sw-t">
                      <span className="rs-sw-from">{r.from}</span>
                      <span className="rs-sw-to"><Icon name="arrow" className="rs-arr" />{r.to}</span>
                    </span>
                    <span className="rs-sw-d"><b>{r.cubes}</b><small>{r.price}</small></span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rs-empty">Нет замен, которые меняют этот показатель.</p>
          )}
          <p className="rs-sum" aria-live="polite" hidden={!summary}>
            {summary && (
              <>
                <Icon name="check" />
                <span>С заменами: <b>{summary.points}</b>, {summary.label}{summary.money && <> <b>{summary.money}</b></>}</span>
              </>
            )}
          </p>
        </section>

        <section className="rs-sec" aria-labelledby="rs-h-src">
          <h2 id="rs-h-src" className="rs-h">{`Откуда ${mdef.label.toLowerCase()}`}</h2>
          <ul className={`rs-src${srcReady ? ' is-ready' : ''}`}>
            {model.sources.length ? model.sources.map(s => (
              <li key={s.i} className={`rs-src-i${s.off ? ' is-off' : ''}`}>
                <div className="rs-src-t">
                  <span className="rs-src-n">{s.name}</span>
                  <span className="rs-src-v"><b>{s.amount}</b>{s.cubes}</span>
                </div>
                <div className="rs-src-bar" aria-hidden="true">
                  <i style={{ width: `${s.width}%`, '--n': s.cells } as CSSProperties} />
                </div>
                {s.off && <p className="rs-src-sw"><Icon name="arrow" className="rs-arr" /><span>{s.swapTo}</span></p>}
              </li>
            )) : <li className="rs-empty">Нет данных об этом показателе.</li>}
          </ul>
        </section>

        <section className="rs-sec rs-harm" aria-labelledby="rs-h-harm">
          <h2 id="rs-h-harm" className="rs-h">{mdef.harmful ? 'Цена вреда' : 'Сколько это стоит'}</h2>
          {harm.total ? (
            <>
              <p className="rs-harm-big"><b>{money(harm.perUnit)}</b> за {cubeMetric ? 'кубик' : metric === 'kcal' ? '100 ккал' : mdef.unit} {metric === 'kcal' ? '' : mdef.of}</p>
              <p className="rs-harm-sub">{`На эти покупки ушло ${money(harm.spend)}, в них ${metricTxt(harm.total, metric)}.`}</p>
              <ul className="rs-harm-top">
                {harm.top.map((t, index) => (
                  <li key={`${t.name}-${index}`}><span className="rs-harm-n">{t.name}</span><span className="rs-harm-v"><b>{money(t.price)}</b>{metricTxt(t.value, metric)}</span></li>
                ))}
              </ul>
            </>
          ) : (
            <p className="rs-empty">{`Нет позиций с учтённым количеством ${mdef.of}.`}</p>
          )}
        </section>

        <section className="rs-sec rs-junk" aria-labelledby="rs-h-junk">
          <h2 id="rs-h-junk" className="rs-h">На вредное</h2>
          <div className="rs-junk-top">
            <b className="rs-junk-sum">{junk.sum}</b>
            <span className="rs-junk-share" data-tone={junk.tone}>{junk.share}</span>
          </div>
          <div className="rs-meter" aria-hidden="true"><i style={{ width: `${junk.width}%` }} /></div>
          <p className="rs-junk-of">{junk.of}</p>
          <p className="rs-days"><Icon name="cal" /><span>{junk.days}</span></p>
        </section>

        <Prices receipt={receipt} />

        {flagged && (
          <section className="rs-sec rs-flag" aria-labelledby="rs-h-flag">
            <h2 id="rs-h-flag" className="rs-h">Алкоголь и энергетики</h2>
            <div className="rs-flag-top">
              <b className="rs-flag-sum">{flagged.sum}</b>
              <span className="rs-flag-share">{flagged.share}</span>
            </div>
            <ul className="rs-flag-list">
              {flagged.lines.map(l => (
                <li key={l.name}><span>{(l.kind === 'alcohol' ? 'Алкоголь' : 'Энергетик').toLowerCase().slice(0, 6) !== l.name.toLowerCase().slice(0, 6) ? `${l.kind === 'alcohol' ? 'Алкоголь' : 'Энергетик'} · ` : ''}{l.name}</span><b>{l.price}</b></li>
              ))}
            </ul>
          </section>
        )}

        <div className="rs-actions">
          <button className="rs-btn rs-btn-main" type="button" onClick={onScan}><Icon name="camera" /><span>Сканировать новый чек</span></button>
          <button className="rs-btn rs-btn-alt" type="button" onClick={share}><Icon name="share" /><span>Поделиться</span></button>
        </div>
        <p className="rs-note">{NOTE}</p>
      </div>

      {client && createPortal(
        <div className={`rs-toast${toast.on ? ' is-on' : ''}`} role="status" aria-live="polite">{toast.text}</div>,
        document.body,
      )}
    </div>
  );
}

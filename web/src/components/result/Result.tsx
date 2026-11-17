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
import { dateRu, verdict } from '@/lib/engine';
import { shareCard } from '@/lib/shareCard';
import { capOf, NOTE, resultModel, swapRows, type ResultModel } from './model';
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
  const model = useMemo(() => resultModel(receipt, on), [receipt, on]);
  const rows = useMemo(() => swapRows(receipt), [receipt]);
  const maxCubes = useMemo(() => resultModel(receipt, []).maxCubes, [receipt]);
  const cubes = model.analysis.cubes;

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
  const target = useEffectEvent(() => cubes);
  useEffect(() => {
    const hero = heroRef.current, head = headRef.current, sheet = sheetRef.current, canvas = canvasRef.current;
    const num = numRef.current, cap = capRef.current;
    if (!hero || !head || !sheet || !canvas || !num || !cap) return;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

    // счётчик идёт вместе с кубиками — пишем прямо в DOM
    let shown = -1;
    const paint = (n: number) => {
      shown = n;
      num.textContent = String(n);
      cap.textContent = capOf(n);
      num.classList.toggle('is-3', n >= 100);
    };
    paint(0);
    const onCount = (n: number) => {
      if (n === shown) return;
      paint(n);
      if (!reduced) num.animate?.([{ transform: 'scale(1.045)' }, { transform: 'scale(1)' }], { duration: 160, easing: 'ease-out' });
    };

    const pile = attachPile({ hero, head, sheet, canvas }, maxCubes, onCount);
    pileRef.current = pile;
    pile.set(target());
    return () => {
      pile.destroy();
      if (pileRef.current === pile) pileRef.current = null;
    };
  }, [receipt, maxCubes]);

  // замены → куча
  useEffect(() => { pileRef.current?.set(cubes); }, [cubes]);

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
        cubes: a.cubes,
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

  const { summary, junk } = model;

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
        <div className="rs-head" ref={headRef}>
          <p className="rs-kick">В твоём чеке</p>
          <b className="rs-num" aria-hidden="true" ref={numRef}>0</b>
          <p className="rs-cap" aria-hidden="true" ref={capRef}>{capOf(0)}</p>
          <p className="rs-sr">{model.srLabel}</p>
        </div>
        <canvas className="rs-pile" ref={canvasRef} role="img" aria-label="Куча кубиков сахара. Нажми, чтобы подбросить" />
      </section>

      <div className="rs-sheet" ref={sheetRef}>
        <section className="rs-sec rs-swaps" aria-labelledby="rs-h-sw">
          <h2 id="rs-h-sw" className="rs-h">Замени — и кубики исчезнут</h2>
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
            <p className="rs-empty">Заменять нечего — в этом чеке нет сладких позиций с понятной заменой.</p>
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
          <h2 id="rs-h-src" className="rs-h">Откуда сахар</h2>
          <ul className={`rs-src${srcReady ? ' is-ready' : ''}`}>
            {model.sources.length ? model.sources.map(s => (
              <li key={s.i} className={`rs-src-i${s.off ? ' is-off' : ''}`}>
                <div className="rs-src-t">
                  <span className="rs-src-n">{s.name}</span>
                  <span className="rs-src-v"><b>{s.grams}</b>{s.cubes}</span>
                </div>
                <div className="rs-src-bar" aria-hidden="true">
                  <i style={{ width: `${s.width}%`, '--n': s.cells } as CSSProperties} />
                </div>
                {s.off && <p className="rs-src-sw"><Icon name="arrow" className="rs-arr" /><span>{s.swapTo}</span></p>}
              </li>
            )) : <li className="rs-empty">Добавленного сахара в чеке нет.</li>}
          </ul>
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

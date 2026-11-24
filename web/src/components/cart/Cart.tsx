'use client';
// Корзина до кассы: гора того, что лежит сейчас, и короткий список «убери или замени». Нажал — фигурки ушли с экрана.
// В журнал ничего не пишется: это ещё не покупка. «Готово, на кассу» запоминает решения, чтобы сверить их с чеком.
import { useEffect, useEffectEvent, useMemo, useRef, useState, type CSSProperties } from 'react';
import { advise, cartAnalysis, cartMoney, decide, priced, TOP_MOVES, weekAdd, type Move } from '@/lib/cart';
import { bigCap, bigNum, amountTxt, cubesOfValue, CUBES, isCubeMetric, METRIC_IDS, METRICS, money, PILE_HINTS, pl, valueOf, verdict, type Forms } from '@/lib/engine';
import { t } from '@/lib/i18n';
import { PALETTES, skinFor } from '@/lib/pile';
import { saltGrainCount } from '@/lib/saltGrains';
import type { Cart as CartData, MetricId } from '@/lib/types';
import { IconArrow, IconCamera, IconCheck, IconChevron, IconEdit, IconPlus, IconTrash } from '@/components/icons';
import { MetricIcon } from '@/components/ui/MetricIcon';
import { MetricTabs } from '@/components/ui/MetricTabs';
import { iconCls, rowCls } from '@/components/ui/kit';
import { attachPile, type PileHandle } from '@/components/result/attachPile';
import '@/components/result/result.css';
import './cart.css';

const STEPS: Forms = ['решение', 'решения', 'решений'];
const SWAPS: Forms = ['замена', 'замены', 'замен'];
const ITEMS: Forms = ['товар', 'товара', 'товаров'];
const nb = (s: string) => s.replace(/(\d) (?=\S)/g, '$1 ');
/** «42 кубика», «2,3 г соли» */
const deltaTxt = (v: number, m: MetricId): string => (isCubeMetric(m) ? `${cubesOfValue(v, m)} ${pl(cubesOfValue(v, m), CUBES)}` : `${amountTxt(v, m)} ${t(METRICS[m].of)}`);
const bigTxt = (v: number, m: MetricId): string => `${bigNum(v, m)} ${isCubeMetric(m) ? pl(cubesOfValue(v, m), CUBES) : t(METRICS[m].unit)}`;

type Props = {
  cart: CartData;
  /** ещё уточняем показатели скольких товаров */
  pending: number;
  level: number;
  /** неделя сейчас: сколько сахара уже в чеках и какая норма, г; null — считать не с чем */
  week: { total: number; norm: number } | null;
  onBack(): void;
  onChange(p: { out: number[]; swaps: number[] }): void;
  onDone(): void;
  onEdit(): void;
  /** доснять кадр; нет — фото уже не под рукой */
  onMore?(): void;
  onDelete(): void;
};

export function Cart({ cart, pending, level, week, onBack, onChange, onDone, onEdit, onMore, onDelete }: Props) {
  const advice = useMemo(() => advise(cart), [cart]);
  const now = useMemo(() => cartAnalysis(cart), [cart]);
  const start = advice.before;
  const [metric, setMetric] = useState<MetricId>('sugar');
  const [allMoves, setAllMoves] = useState(false);
  const [rest, setRest] = useState(false);

  const total = now.totals[metric], cubes = now.cubesBy[metric];
  const maxCubes = Math.max(1, start.cubesBy[metric], cubes);
  const cubeMetric = isCubeMetric(metric);
  const animated = cubeMetric && maxCubes <= 220;
  const pileCount = metric === 'salt' ? saltGrainCount(total) : Math.min(cubes, 220);
  const touched = cart.out.length + cart.swaps.length > 0;
  const saved = cartMoney(cart);
  const v = verdict(now.score);

  // ── куча ──
  const heroRef = useRef<HTMLElement>(null), headRef = useRef<HTMLDivElement>(null), sheetRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null), numRef = useRef<HTMLElement>(null), capRef = useRef<HTMLParagraphElement>(null);
  const pileRef = useRef<PileHandle | null>(null);
  const target = useEffectEvent(() => pileCount);
  const paint = useEffectEvent((n: number, num: HTMLElement, cap: HTMLElement) => {
    if (!animated) return;
    num.textContent = String(n);
    cap.textContent = bigCap(n * METRICS[metric].cubeG, metric);
    num.classList.toggle('is-3', n >= 100);
  });
  useEffect(() => {
    const hero = heroRef.current, head = headRef.current, sheet = sheetRef.current, canvas = canvasRef.current, num = numRef.current, cap = capRef.current;
    if (!hero || !head || !sheet || !canvas || !num || !cap) return;
    let shown = -1;
    const onCount = (n: number) => { if (n !== shown) { shown = n; paint(n, num, cap); } };
    onCount(0);
    const pile = attachPile({ hero, head, sheet, canvas }, Math.min(220, maxCubes), onCount, metric === 'sugar' ? skinFor(level) : PALETTES[metric]);
    pileRef.current = pile;
    pile.set(target());
    return () => { pile.destroy(); if (pileRef.current === pile) pileRef.current = null; };
  }, [cart.id, maxCubes, metric, level]);
  useEffect(() => { pileRef.current?.set(pileCount); }, [pileCount]);

  // ── решения ──
  const set = (i: number, kind: 'out' | 'swap' | null) => {
    onChange({
      out: kind === 'out' ? [...cart.out.filter(x => x !== i), i].sort((a, b) => a - b) : cart.out.filter(x => x !== i),
      swaps: kind === 'swap' ? [...cart.swaps.filter(x => x !== i), i].sort((a, b) => a - b) : cart.swaps.filter(x => x !== i),
    });
    if (navigator.userActivation?.isActive !== false) navigator.vibrate?.(8);
  };
  const stateOf = (i: number): 'out' | 'swap' | null => (cart.out.includes(i) ? 'out' : cart.swaps.includes(i) ? 'swap' : null);
  const first = advice.moves.slice(0, advice.enough);
  const doFirst = () => {
    const d = decide(first);
    const mine = (list: number[], other: number[]) => [...new Set([...list.filter(i => !first.some(m => m.i === i)), ...other])].sort((a, b) => a - b);
    onChange({ out: mine(cart.out, d.out), swaps: mine(cart.swaps, d.swaps) });
    heroRef.current?.closest('[data-screen]')?.scrollTo({ top: 0, behavior: 'smooth' });
    if (navigator.userActivation?.isActive !== false) navigator.vibrate?.([10, 30, 10]);
  };

  const m0 = advice.metric;
  const phrase = advice.moves.length === 0
    ? t('Хорошая корзина. Можно на кассу.')
    : t('{n} {w}, и {x} станет {a} вместо {b}', { n: advice.enough, w: pl(advice.enough, first.every(m => m.kind === 'swap') ? SWAPS : STEPS), x: t(METRICS[m0].of), a: bigNum(advice.after.totals[m0], m0), b: bigTxt(start.totals[m0], m0) });

  const listed = new Set(advice.moves.map(m => m.i));
  const shownMoves = allMoves ? advice.moves : advice.moves.filter((m, k) => k < TOP_MOVES || stateOf(m.i));
  const others = cart.items.map((it, i) => ({ it, i })).filter(x => !listed.has(x.i)).sort((a, b) => valueOf(b.it, metric) - valueOf(a.it, metric));
  const food = cart.items.filter(it => !it.nf).length;

  const ratio = (g: number) => (week && week.norm ? Math.round((week.total + g) / week.norm * 100) : 0);
  const wBefore = ratio(weekAdd(cart, [], [], 'sugar')), wNow = ratio(weekAdd(cart, cart.out, cart.swaps, 'sugar'));

  return (
    <div className="rs ct">
      <section className="rs-hero" ref={heroRef}>
        <header className="rs-bar">
          <button className="rs-ic" type="button" aria-label={t('Назад')} onClick={onBack}><IconChevron className="rotate-180" /></button>
          <div className="rs-pill" role="status" data-tone={v.tone}><i className="rs-dot" /><span className="rs-pill-t">{t('{n} из 100 · {v}', { n: now.score, v: v.label.toLowerCase() })}</span></div>
          <button className="rs-ic" type="button" aria-label={t('Исправить корзину')} onClick={onEdit}><IconEdit /></button>
        </header>
        <MetricTabs value={metric} onChange={setMetric} className="rs-tabs" />
        <div className="rs-head" ref={headRef}>
          <p className="rs-kick">{touched ? t('Останется в корзине') : t('Сейчас в корзине')}</p>
          <b key={metric} className={`rs-num${bigNum(total, metric).length >= 4 ? ' is-wide' : !animated && bigNum(total, metric).length >= 3 ? ' is-3' : ''}`} aria-hidden="true" ref={numRef}>{animated ? '0' : bigNum(total, metric)}</b>
          <p key={`cap-${metric}`} className="rs-cap" aria-hidden="true" ref={capRef}>{bigCap(animated ? 0 : total, metric)}</p>
          <p className="rs-sr" aria-live="polite">{touched ? t('Останется в корзине') : t('Сейчас в корзине')}: {bigNum(total, metric)} {bigCap(total, metric)}</p>
          {total > 0 && <p aria-hidden="true" className="rs-scene-hint rs-pile-hint">{t(PILE_HINTS[metric])}</p>}
        </div>
        <canvas className="rs-pile" ref={canvasRef} role={total > 0 ? 'button' : undefined} tabIndex={total > 0 ? 0 : undefined} aria-label={total > 0 ? t(PILE_HINTS[metric]) : undefined} />
      </section>

      <div className="rs-sheet on-light" ref={sheetRef}>
        <section className="rs-sec">
          <p className="rs-phrase">{phrase}</p>
          <p className="rs-meta">
            {cart.kind === 'order' ? t('Заказ') : t('Корзина')}{cart.store ? ` · ${cart.store}` : ''} · {food} {pl(food, ITEMS)}{priced(cart.items) ? ` · ${money(start.total)}` : ''}{cart.demo ? ` · ${t('пример')}` : ''}
          </p>
        </section>

        {pending > 0 && <p className="ct-note" role="status">{t('Уточняю состав: {n} {w}', { n: pending, w: pl(pending, ITEMS) })}</p>}
        {cart.hidden && onMore && (
          <button type="button" className="rs-check mt-4" onClick={onMore}><span>{t('Видно не всё: часть товаров закрыта.')}</span><b>{t('Доснять')}</b></button>
        )}

        {shownMoves.length > 0 && (
          <section className="rs-sec" aria-labelledby="ct-h">
            <h2 id="ct-h" className="rs-h">{t('Что сделать до кассы')}</h2>
            <ul className="ct-list">
              {shownMoves.map(m => <MoveRow key={m.i} m={m} cart={cart} state={stateOf(m.i)} onSet={k => set(m.i, k)} />)}
            </ul>
            {advice.moves.length > shownMoves.length && <button type="button" className="rs-more" onClick={() => setAllMoves(true)}>{t('Ещё советы: {n}', { n: advice.moves.length - shownMoves.length })}</button>}
          </section>
        )}

        {week && week.norm > 0 && wBefore > 0 && (
          <section className="rs-sec ct-week" aria-labelledby="ct-w">
            <h2 id="ct-w" className="rs-h">{t('Неделя с этой корзиной')}</h2>
            <p className="ct-week-n"><b data-tone={wNow > 100 ? 'bad' : wNow > 70 ? 'mid' : 'good'}>{wNow}%</b><span>{t('нормы сахара семьи')}</span>{wNow < wBefore && <s>{wBefore}%</s>}</p>
            <div className="rs-meter" aria-hidden="true"><i style={{ width: `${Math.min(100, wNow)}%` }} /></div>
          </section>
        )}

        {others.length > 0 && (
          <section className="rs-sec">
            <button type="button" className="rs-disclose" aria-expanded={rest} onClick={() => setRest(x => !x)}>
              <span>{listed.size ? t('Остальное в корзине: {n}', { n: others.length }) : t('Что в корзине: {n}', { n: others.length })}</span><IconChevron className={`size-5 transition-transform ${rest ? '-rotate-90' : 'rotate-90'}`} />
            </button>
            {rest && (
              <ul className="ct-rest">
                {others.map(({ it, i }) => {
                  const off = cart.out.includes(i);
                  return (
                    <li key={i} data-off={off || undefined}>
                      <span className="ct-rest-n">{nb(it.n)}{it.q && <small>{t('возможно, узнали неверно')}</small>}</span>
                      <span className="ct-rest-v">{it.nf ? t('не еда') : it.src ? amountTxt(valueOf(it, metric), metric) : '…'}</span>
                      <button type="button" aria-pressed={off} aria-label={off ? t('Вернуть: {n}', { n: it.n }) : t('Убрать: {n}', { n: it.n })} onClick={() => set(i, off ? null : 'out')}>{off ? <IconPlus className="size-5" /> : <IconTrash className="size-5" />}</button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}

        <section className="rs-sec grid gap-2">
          {first.length > 0 && !touched && !cart.doneAt && <button type="button" className={rowCls} onClick={onDone}><span className={iconCls}><IconCheck className="size-5" /></span><span className="flex-1">{t('Оставлю как есть, на кассу')}</span></button>}
          <button type="button" className={rowCls} onClick={onEdit}><span className={iconCls}><IconEdit className="size-5" /></span><span className="flex-1">{t('Узнали неверно? Исправь или добавь')}</span><IconChevron className="size-5 text-mute" /></button>
          {onMore && !cart.hidden && <button type="button" className={rowCls} onClick={onMore}><span className={iconCls}><IconCamera className="size-5" /></span><span className="flex-1">{t('Доснять корзину')}</span><IconChevron className="size-5 text-mute" /></button>}
          <button type="button" className={rowCls} onClick={onDelete}><span className={iconCls}><IconTrash className="size-5" /></span><span className="flex-1">{t('Удалить корзину')}</span></button>
        </section>

        <p className="rs-note">{t('Узнаём товары по фото, вес и состав оцениваем примерно. Это не совет врача.')}</p>
      </div>

      <div className="ct-foot on-light">
        <div className="ct-foot-t">
          <b>{touched ? <><s>{bigNum(start.totals.sugar, 'sugar')}</s><IconArrow className="size-4" />{bigNum(now.totals.sugar, 'sugar')}</> : bigNum(now.totals.sugar, 'sugar')} <MetricIcon m="sugar" className="size-5" /></b>
          {saved !== null && saved !== 0 && <span>{saved > 0 ? '−' : '+'}{money(Math.abs(saved))}</span>}
        </div>
        {first.length > 0 && !touched && !cart.doneAt
          ? <button type="button" className="ct-go is-blue" onClick={doFirst}>{t('Так и сделаю')}</button>
          : <button type="button" className="ct-go" onClick={onDone}>{cart.doneAt ? t('Готово') : t('Готово, на кассу')}</button>}
      </div>
    </div>
  );
}

function MoveRow({ m, cart, state, onSet }: { m: Move; cart: CartData; state: 'out' | 'swap' | null; onSet(k: 'out' | 'swap' | null): void }) {
  const it = cart.items[m.i];
  const own = valueOf(it, m.metric);
  const diff = it.p && it.swap?.p ? it.p - it.swap.p : 0;
  return (
    <li className="ct-row" data-state={state ?? undefined}>
      <div className="ct-row-t">
        <MetricIcon m={m.metric} className="size-9" />
        <span className="ct-row-n"><b>{nb(it.n)}</b><small>{it.x === 'alcohol' ? t('алкоголь') : it.x === 'energy' ? t('энергетик') : deltaTxt(own, m.metric)}{it.q ? ` · ${t('возможно, узнали неверно')}` : ''}</small></span>
        {it.p > 0 && <span className="ct-row-p">{money(it.p)}</span>}
      </div>
      <div className="ct-row-b" style={{ '--n': it.swap ? 2 : 1 } as CSSProperties}>
        {it.swap && (
          <button type="button" data-best={m.kind === 'swap' || undefined} aria-pressed={state === 'swap'} onClick={() => onSet(state === 'swap' ? null : 'swap')}>
            <span>{state === 'swap' && <IconCheck className="size-4" />}{t('Заменить')}</span><small>{nb(it.swap.n)}</small>{diff !== 0 && <small className="ct-diff">{diff > 0 ? '−' : '+'}{money(Math.abs(diff))}</small>}
          </button>
        )}
        <button type="button" data-best={m.kind === 'out' || undefined} aria-pressed={state === 'out'} onClick={() => onSet(state === 'out' ? null : 'out')}>
          <span>{state === 'out' && <IconCheck className="size-4" />}{state === 'out' ? t('Убрано') : t('Убрать')}</span>{it.swap && <small>{t('совсем')}</small>}
        </button>
      </div>
    </li>
  );
}

export const cartHasData = (c: CartData): boolean => METRIC_IDS.some(m => c.items.some(it => valueOf(it, m) > 0));

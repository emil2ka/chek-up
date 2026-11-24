'use client';
// Экран результата в стиле «Гора сахара»: гора → одна мысль → три лучшие замены → остальное под «Подробнее».
// Замены — это план на следующий раз: гора уменьшается на экране, но в факт и экономию они попадают, только когда их подтвердит чек.
// Пропсы — ResultProps в src/lib/types.ts. Компонент рисуется внутри прокручиваемого экрана оболочки; план хранит оболочка.
import { useEffect, useEffectEvent, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { MetricId, ResultProps } from '@/lib/types';
import { bigCap, bigNum, dateRu, isCubeMetric, METRICS, metricTxt, money, PILE_HINTS, pl, UNITS_NOTE, type Forms } from '@/lib/engine';
import { t } from '@/lib/i18n';
import { PALETTES, skinFor } from '@/lib/pile';
import { saltGrainCount } from '@/lib/saltGrains';
import { shareCard } from '@/lib/shareCard';
import { IconChevron, IconEdit } from '@/components/icons';
import { MetricTabs } from '@/components/ui/MetricTabs';
import { SixGrid } from '@/components/ui/SixMetrics';
import { rowCls, iconCls, Switch } from '@/components/ui/kit';
import { CartFactCard } from '@/components/cart/CartFactCard';
import { conclusion, metricPhrase, resultModel, swapRows } from './model';
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

const POS_F: Forms = ['позицию', 'позиции', 'позиций'];
const TOP = 3;
const noop = () => () => {};
const sortNums = (a: number, b: number) => a - b;
const NO_OFF: number[] = [];

export default function Result({ receipt, swaps, off = NO_OFF, tag, priv, score, level = 0, author, demo, cart, onBack, onScan, onSwaps, onFlags, onEdit }: ResultProps) {
  const [metric, setMetric] = useState<MetricId>('sugar');
  const model = useMemo(() => resultModel(receipt, swaps, metric, off, score), [receipt, swaps, metric, off, score]);
  const rows = useMemo(() => swapRows(receipt, metric, off), [receipt, metric, off]);
  const phrase = useMemo(() => (metric === 'sugar' ? conclusion(receipt, model.base, tag) : metricPhrase(model.base, metric)), [receipt, model.base, tag, metric]);
  const { maxCubes } = model;
  const cubes = model.analysis.cubesBy[metric];
  const mdef = METRICS[metric];
  const total = model.analysis.totals[metric];
  const available = model.available.includes(metric);
  const cubeMetric = isCubeMetric(metric);
  const animatedCount = cubeMetric && maxCubes <= 220 && cubes <= 220;
  const pileCount = metric === 'salt' ? saltGrainCount(total) : Math.min(cubes, 220);
  const planned = swaps.some(i => rows.some(r => r.i === i));

  const [srcReady, setSrcReady] = useState(false);
  const [more, setMore] = useState(false);
  const [allSwaps, setAllSwaps] = useState(false);
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
    const paint = (n: number) => { shown = n; paintCount(n, num, cap); };
    paint(0);
    const onCount = (n: number) => {
      if (n === shown) return;
      paint(n);
      if (!reduced && isCubeMetric(metric)) num.animate?.([{ transform: 'scale(1.045)' }, { transform: 'scale(1)' }], { duration: 160, easing: 'ease-out' });
    };

    const pile = attachPile({ hero, head, sheet, canvas }, Math.min(220, maxCubes), onCount, metric === 'sugar' ? skinFor(level) : PALETTES[metric]);
    pileRef.current = pile;
    pile.set(target());
    return () => {
      pile.destroy();
      if (pileRef.current === pile) pileRef.current = null;
    };
  }, [receipt.id, maxCubes, metric, available, level]);

  // замены → куча
  useEffect(() => { pileRef.current?.set(pileCount); }, [pileCount]);

  // полосы «Откуда сахар» вырастают только при первом показе
  useEffect(() => {
    if (!more) return;
    const id = setTimeout(() => setSrcReady(true), 800);
    return () => clearTimeout(id);
  }, [more]);

  // уведомление
  useEffect(() => {
    if (!toast.on) return;
    const id = setTimeout(() => setToast(s => ({ ...s, on: false })), 2200);
    return () => clearTimeout(id);
  }, [toast.id, toast.on]);
  const say = (text: string) => setToast(s => ({ id: s.id + 1, text, on: true }));

  const toggle = (i: number) => {
    onSwaps(swaps.includes(i) ? swaps.filter(x => x !== i) : [...swaps, i].sort(sortNums));
    if (navigator.userActivation?.isActive !== false) navigator.vibrate?.(8);
  };

  const sharing = useRef(false);
  const share = async () => {
    const text = model.shareText;
    // сначала пробуем картинку-карточку; если не вышло — делимся текстом
    if (sharing.current) return;
    sharing.current = true;
    try {
      const a = model.base;
      const how = await shareCard({
        metric,
        cubesBy: a.cubesBy,
        totals: a.totals,
        available: model.available,
        pill: model.pill,
        tone: model.tone,
        where: `${receipt.store} · ${dateRu(receipt.date)}`,
        level,
      }, text);
      if (how === 'saved') say(t('Картинка сохранена, отправь её друзьям'));
      return;
    } catch {
      /* canvas или шрифты подвели — ниже запасной путь */
    } finally {
      sharing.current = false;
    }
    if (navigator.share) {
      try { await navigator.share({ title: t('Чек-ап'), text }); return; }
      catch (e) { if ((e as Error)?.name === 'AbortError') return; }
    }
    try { await navigator.clipboard.writeText(text); say(t('Текст скопирован, вставь его в чат')); }
    catch { say(t('Не получилось скопировать')); }
  };

  const { summary, junk, harm, flagged } = model;
  const unsure = receipt.items.filter(it => it.q).length;
  const gap = receipt.sum && !receipt.masked ? Math.round(receipt.items.reduce((n, it) => n + it.p, 0) - receipt.sum) : 0;
  const shownRows = allSwaps ? rows : rows.filter((r, k) => k < TOP || swaps.includes(r.i));
  const other = model.base.offCount;

  return (
    <div className="rs">
      <section className="rs-hero" ref={heroRef}>
        <header className="rs-bar">
          <button className="rs-ic" type="button" aria-label={t('Назад')} onClick={onBack}><Icon name="back" /></button>
          <div className="rs-pill" role="status" data-tone={model.tone}>
            <i className="rs-dot" />
            <span className="rs-pill-t">{model.pill}</span>
          </div>
          <button className="rs-ic" type="button" aria-label={t('Поделиться результатом')} onClick={share}><Icon name="share" /></button>
        </header>
        <MetricTabs value={metric} onChange={setMetric} className="rs-tabs" />
        <div className="rs-head" ref={headRef}>
          <p className="rs-kick">{planned ? t('Будет в следующий раз') : t('В твоём чеке')}</p>
          <b key={metric} className={`rs-num${bigNum(total, metric).length >= 4 ? ' is-wide' : !animatedCount && bigNum(total, metric).length >= 3 ? ' is-3' : ''}`} aria-hidden="true" ref={numRef}>{!available ? '—' : animatedCount ? '0' : bigNum(total, metric)}</b>
          <p key={`cap-${metric}`} className="rs-cap" aria-hidden="true" ref={capRef}>{available ? bigCap(animatedCount ? 0 : total, metric) : t('нет данных в этом чеке')}</p>
          <p className="rs-sr">{model.srLabel}</p>
          {available && total > 0 && <p aria-hidden="true" className="rs-scene-hint rs-pile-hint">{t(PILE_HINTS[metric])}</p>}
        </div>
        {available && <canvas className="rs-pile" ref={canvasRef} role={total > 0 ? 'button' : undefined} tabIndex={total > 0 ? 0 : undefined} aria-label={total > 0 ? t(PILE_HINTS[metric]) : undefined} />}
      </section>

      <div className="rs-sheet on-light" ref={sheetRef}>
        {(unsure > 0 || gap !== 0) && onEdit && (
          <button type="button" className="rs-check" onClick={onEdit}>
            <span>
              {unsure > 0 && <>{t('Проверь {n} {w}: прочитались плохо.', { n: unsure, w: pl(unsure, POS_F) })} </>}
              {gap !== 0 && (gap < 0 ? t('Не хватает {n} до суммы на чеке.', { n: money(-gap) }) : t('На {n} больше суммы на чеке.', { n: money(gap) }))}
            </span>
            <b>{t('Проверить')}</b>
          </button>
        )}

        <section className="rs-sec">
          <p className="rs-phrase">{phrase}</p>
          <p className="rs-meta">
            {receipt.store} · {dateRu(receipt.date)}{receipt.masked ? '' : ` · ${money(model.base.total)}`}
            {author ? ` · ${t('внесено: {n}', { n: author })}` : ''}{demo ? ` · ${t('пример, в учёт не идёт')}` : ''}{other ? ` · ${t('не считаем: {n}', { n: other })}` : ''}
          </p>
        </section>

        {cart && <CartFactCard fact={cart} />}

        <section className="rs-sec" aria-labelledby="rs-h-all">
          <h2 id="rs-h-all" className="rs-h">{t('Всё, что в чеке')}</h2>
          <SixGrid totals={model.base.totals} available={model.available} value={metric} onChange={setMetric} />
        </section>

        {!receipt.refund && (
          <section className="rs-sec rs-swaps" aria-labelledby="rs-h-sw">
            <h2 id="rs-h-sw" className="rs-h">{t('В следующий раз возьми')}</h2>
            {rows.length ? (
              <ul className="rs-sw-list">
                {shownRows.map(r => (
                  <li key={r.i}>
                    <button className="rs-sw" type="button" aria-pressed={swaps.includes(r.i)} onClick={() => toggle(r.i)}>
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
              <p className="rs-empty">{t('Нет замен, которые меняют этот показатель.')}</p>
            )}
            {rows.length > shownRows.length && <button type="button" className="rs-more" onClick={() => setAllSwaps(true)}>{t('Ещё замены: {n}', { n: rows.length - shownRows.length })}</button>}
            <p className="rs-sum" aria-live="polite" hidden={!summary}>
              {summary && (
                <>
                  <Icon name="check" />
                  <span>{t('В плане')}: <b>{summary.points}</b>{summary.label && <>, {summary.label}</>}{summary.money && <> <b>{summary.money}</b></>}. {t('Засчитаем, когда купишь.')}</span>
                </>
              )}
            </p>
          </section>
        )}

        {(onEdit || onFlags) && (
          <section className="rs-sec grid gap-2" aria-label={t('Как учесть чек')}>
            {onEdit && <button type="button" className={rowCls} onClick={onEdit}><span className={iconCls}><IconEdit className="size-5" /></span><span className="flex-1">{t('Изменить чек')}</span><IconChevron className="size-5 text-mute" /></button>}
            {onFlags && <Switch label={t('Для гостей')} hint={t('деньги посчитаем, норму не тронем')} checked={tag === 'guests'} onChange={v => onFlags({ tag: v ? 'guests' : null })} />}
            {onFlags && !author && <Switch label={t('Личный чек')} hint={t('семья его не увидит')} checked={!!priv} onChange={v => onFlags({ priv: v })} />}
          </section>
        )}

        <section className="rs-sec">
          <button type="button" className="rs-disclose" aria-expanded={more} onClick={() => setMore(v => !v)}>
            <span>{t('Подробнее')}</span><IconChevron className={`size-5 transition-transform ${more ? '-rotate-90' : 'rotate-90'}`} />
          </button>
        </section>

        {more && (
          <>
            <section className="rs-sec" aria-labelledby="rs-h-src">
              <h2 id="rs-h-src" className="rs-h">{t('Откуда')}: {t(mdef.label).toLowerCase()}</h2>
              <ul className={`rs-src${srcReady ? ' is-ready' : ''}`}>
                {model.sources.length ? model.sources.map(s => (
                  <li key={s.i} className={`rs-src-i${s.swapped ? ' is-off' : ''}`}>
                    <div className="rs-src-t">
                      <span className="rs-src-n">{s.name}{s.weeks > 1 && <small> · {t('запас на {n} нед.', { n: s.weeks })}</small>}</span>
                      <span className="rs-src-v"><b>{s.amount}</b>{s.cubes}</span>
                    </div>
                    <div className="rs-src-bar" aria-hidden="true">
                      <i style={{ width: `${s.width}%`, '--n': s.cells } as CSSProperties} />
                    </div>
                    {s.swapped && <p className="rs-src-sw"><Icon name="arrow" className="rs-arr" /><span>{s.swapTo}</span></p>}
                  </li>
                )) : <li className="rs-empty">{t('Нет данных об этом показателе.')}</li>}
              </ul>
            </section>

            {!receipt.masked && (
              <>
                <section className="rs-sec rs-harm" aria-labelledby="rs-h-harm">
                  <h2 id="rs-h-harm" className="rs-h">{mdef.harmful ? t('Цена вреда') : t('Сколько это стоит')}</h2>
                  {harm.total ? (
                    <>
                      <p className="rs-harm-big"><b>{money(harm.perUnit)}</b> {cubeMetric ? t('за кубик сахара') : metric === 'kcal' ? t('за 100 ккал') : t('за грамм')}</p>
                      <p className="rs-harm-sub">{t('На эти покупки ушло {m}, в них {x}.', { m: money(harm.spend), x: metricTxt(harm.total, metric) })}</p>
                      <ul className="rs-harm-top">
                        {harm.top.map((r, index) => (
                          <li key={`${r.name}-${index}`}><span className="rs-harm-n">{r.name}</span><span className="rs-harm-v"><b>{money(r.price)}</b>{bigNum(r.value, metric)} {cubeMetric ? t('куб.') : t(mdef.unit)}</span></li>
                        ))}
                      </ul>
                    </>
                  ) : (
                    <p className="rs-empty">{t('Таких позиций в чеке нет.')}</p>
                  )}
                </section>

                <section className="rs-sec rs-junk" aria-labelledby="rs-h-junk">
                  <h2 id="rs-h-junk" className="rs-h">{t('На вредное')}</h2>
                  <div className="rs-junk-top">
                    <b className="rs-junk-sum">{junk.sum}</b>
                    <span className="rs-junk-share" data-tone={junk.tone}>{junk.share}</span>
                  </div>
                  <div className="rs-meter" aria-hidden="true"><i style={{ width: `${junk.width}%` }} /></div>
                  <p className="rs-junk-of">{junk.of}</p>
                  <p className="rs-days"><Icon name="cal" /><span>{junk.days}</span></p>
                </section>

                <Prices receipt={receipt} />
              </>
            )}

            {flagged && (
              <section className="rs-sec rs-flag" aria-labelledby="rs-h-flag">
                <h2 id="rs-h-flag" className="rs-h">{t('Алкоголь и энергетики')}</h2>
                <div className="rs-flag-top">
                  <b className="rs-flag-sum">{flagged.sum}</b>
                  <span className="rs-flag-share">{flagged.share}</span>
                </div>
                <ul className="rs-flag-list">
                  {flagged.lines.map((l, k) => <li key={`${l.name}${k}`}><span>{l.name}</span><b>{l.price}</b></li>)}
                </ul>
              </section>
            )}
            <p className="rs-note">{t(UNITS_NOTE)} {t('Оценка примерная и не заменяет консультацию врача.')}</p>
          </>
        )}

        <div className="rs-actions">
          <button className="rs-btn rs-btn-main" type="button" onClick={onScan}><Icon name="camera" /><span>{t('Внести ещё чек')}</span></button>
          <button className="rs-btn rs-btn-alt" type="button" onClick={share}><Icon name="share" /><span>{t('Поделиться')}</span></button>
        </div>
        {!more && <p className="rs-note">{t('Оценка примерная и не заменяет консультацию врача.')}</p>}
      </div>

      {client && createPortal(
        <div className={`rs-toast${toast.on ? ' is-on' : ''}`} role="status" aria-live="polite">{toast.text}</div>,
        document.body,
      )}
    </div>
  );
}

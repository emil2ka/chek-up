'use client';
// «Продукты»: справочник «Сколько сахара в…» с поиском и разделами.
import { useMemo, useState } from 'react';
import { CATS, searchCatalog, type Cat } from '@/lib/catalog';
import { CUBES, CUBE_G, DAILY_G, pl, type Forms } from '@/lib/engine';
import { IconArrow, IconClose, IconSearch } from '@/components/icons';

const PRODUCTS: Forms = ['продукт', 'продукта', 'продуктов'];
/** столько клеточек-кубиков рисуем в строке, остальное — «+N» */
const STRIP = 24;

export function Catalog() {
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState<Cat | 'all'>('all');
  const [open, setOpen] = useState<string | null>(null);
  const items = useMemo(() => searchCatalog(query, cat), [query, cat]);

  return (
    <div className="flex min-h-full flex-col">
      <header className="px-5 pt-[calc(env(safe-area-inset-top)+16px)] pb-5 text-white">
        <h1 className="font-display text-[clamp(30px,9.4vw,38px)] leading-[.98] font-black tracking-[-.045em]">
          <span className="rise block">Сколько сахара</span>
          <span className="rise block" style={{ animationDelay: '60ms' }}>в <span className="hl">продуктах</span></span>
        </h1>

        <label className="on-light rise mt-5 flex h-14 items-center gap-3 rounded-[20px] bg-white pr-1.5 pl-4 text-ink shadow-[0_14px_30px_-12px_color-mix(in_srgb,var(--ink)_55%,transparent)] focus-within:outline-3 focus-within:outline-offset-2 focus-within:outline-white" style={{ animationDelay: '120ms' }}>
          <IconSearch className="size-6 flex-none text-blue-1" />
          <span className="sr-only">Поиск продукта</span>
          <input
            type="search"
            inputMode="search"
            enterKeyHint="search"
            autoComplete="off"
            value={query}
            onChange={e => { setQuery(e.target.value); setOpen(null); }}
            placeholder="Кола, йогурт, печенье…"
            className="h-full min-w-0 flex-1 bg-transparent text-[17px] font-semibold outline-none placeholder:text-mute [&::-webkit-search-cancel-button]:hidden"
          />
          {query && (
            <button type="button" onClick={() => setQuery('')} aria-label="Очистить поиск" className="grid size-11 flex-none place-items-center rounded-2xl text-mute active:scale-[.9]">
              <IconClose className="size-5" />
            </button>
          )}
        </label>

        <ul className="no-scrollbar rise -mx-5 mt-3.5 flex gap-2 overflow-x-auto px-5 pb-1" style={{ animationDelay: '170ms' }} aria-label="Разделы">
          {CATS.map(c => {
            const active = c.id === cat;
            return (
              <li key={c.id} className="flex-none">
                <button
                  type="button"
                  aria-pressed={active}
                  onClick={() => { setCat(c.id); setOpen(null); }}
                  className={`min-h-11 rounded-full px-4 text-[14px] font-extrabold transition active:scale-[.94] ${
                    active ? 'bg-white text-blue-1' : 'btn-glass'
                  }`}
                >
                  {c.label}
                </button>
              </li>
            );
          })}
        </ul>
      </header>

      <section className="on-light relative flex-1 rounded-t-sheet bg-white px-3 pt-5 pb-6 text-ink shadow-panel" aria-live="polite">
        <p className="px-2 pb-2.5 text-[13px] font-bold text-mute">
          {items.length} {pl(items.length, PRODUCTS)} · сначала самые сладкие
        </p>

        {items.length === 0 ? (
          <div className="mx-1 rounded-3xl bg-tint p-5">
            <p className="font-display text-xl leading-tight font-black tracking-[-.03em]">Такого пока нет</p>
            <p className="mt-1.5 text-[15px] font-semibold text-mute">Попробуй короче: «сок», «йогурт», «шоколад».</p>
          </div>
        ) : (
          <ul className="grid gap-2">
            {items.map(it => {
              const cubes = Math.round(it.g / CUBE_G);
              const expanded = open === it.id;
              const pct = Math.round(it.g / DAILY_G * 100);
              const cells = Math.min(cubes, STRIP);
              return (
                <li key={it.id} className={`rounded-[22px] transition-colors ${expanded ? 'bg-[color-mix(in_srgb,var(--blue-3)_22%,var(--tint))]' : 'bg-tint'}`}>
                  <button
                    type="button"
                    aria-expanded={expanded}
                    onClick={() => setOpen(expanded ? null : it.id)}
                    className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 rounded-[22px] px-4 py-3 text-left active:scale-[.985]"
                  >
                    <span className="grid min-w-0 gap-0.5">
                      <span className="font-display text-base leading-tight font-bold tracking-[-.02em]">{it.name}</span>
                      <span className="text-[13px] font-semibold text-mute">{it.portion}</span>
                    </span>
                    {cubes > 0 ? (
                      <span className="grid justify-items-end leading-none">
                        <b className="font-display text-[26px] font-black tracking-[-.05em] tabular-nums">{cubes}</b>
                        <small className="mt-0.5 text-xs font-bold text-mute">{pl(cubes, CUBES)}</small>
                      </span>
                    ) : (
                      <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-white px-3 text-[13px] font-extrabold text-good">
                        <i className="dot good" />{it.g > 0 ? 'почти нет' : 'без сахара'}
                      </span>
                    )}
                    {cubes > 0 && (
                      <span className="col-span-2 flex flex-wrap items-center gap-[3px]" aria-hidden="true">
                        {Array.from({ length: cells }, (_, i) => (
                          <i key={i} className="size-2.75 rounded-[3px] bg-blue-1 shadow-[inset_-1.5px_-1.5px_0_color-mix(in_srgb,var(--ink)_28%,transparent)]" />
                        ))}
                        {cubes > cells && <b className="ml-1 text-xs font-extrabold text-blue-1">+{cubes - cells}</b>}
                      </span>
                    )}
                  </button>

                  {expanded && (
                    <div className="rise grid gap-2 px-4 pb-4" style={{ animationDuration: '320ms' }}>
                      <p className="text-[15px] leading-snug font-semibold">
                        {it.g > 0
                          ? <>Около <b>{it.g} г</b> добавленного сахара — это <b>{pct}%</b> дневной нормы взрослого.</>
                          : <>Добавленного сахара нет. Можно не считать.</>}
                      </p>
                      {it.swap && (
                        <p className="flex items-start gap-2 rounded-2xl bg-white px-3 py-2.5 text-[15px] leading-snug font-bold text-good">
                          <IconArrow className="mt-0.5 size-5 flex-none" />
                          <span>Лучше взять: {it.swap}</span>
                        </p>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <p className="mt-5 px-2 text-xs leading-relaxed font-semibold text-mute">
          Значения примерные, по типичным товарам в магазинах. 1 кубик = {CUBE_G} г сахара, норма взрослого — до {DAILY_G} г в день.
        </p>
      </section>
    </div>
  );
}

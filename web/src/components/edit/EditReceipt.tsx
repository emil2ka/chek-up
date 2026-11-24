'use client';
// Правка чека и ручной ввод: строки, «не для нас», не еда, запас на недели, магазин, дата, возврат.
import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { isIso, todayIso } from '@/lib/calendar';
import { CATALOG } from '@/lib/catalog';
import { amountTxt, analyze, METRICS, money, pl, SUGAR_CUBES, type Forms } from '@/lib/engine';
import { isDemo, receiptOf } from '@/lib/insights';
import { t } from '@/lib/i18n';
import { buildItem, lineOf, type Correction } from '@/lib/scan/build';
import type { HistoryEntry, MetricId, Receipt, ReceiptItem } from '@/lib/types';
import { IconChevron, IconPlus, IconTrash } from '@/components/icons';
import { Sheet } from '@/components/ui/Sheet';
import { dangerCls, inputCls, primaryCls, quietCls, Switch } from '@/components/ui/kit';
import { Stepper } from '@/components/ui/Stepper';

const CHECK_F: Forms = ['позицию', 'позиции', 'позиций'];
const FIELDS: [MetricId, 's' | 't' | 'f' | 'k' | 'c' | 'b'][] = [['sugar', 's'], ['salt', 't'], ['fat', 'f'], ['kcal', 'k'], ['carbs', 'c'], ['protein', 'b']];

type Row = { key: string; it: ReceiptItem; off: boolean; /** исходная строка — по ней запоминаем исправление */ was: ReceiptItem | null; touched: boolean };
let seq = 0;
const rowOf = (it: ReceiptItem, off: boolean, was: ReceiptItem | null): Row => ({ key: `r${++seq}`, it, off, was, touched: false });

export type EditResult = { receipt: Receipt; off: number[]; corrections: { raw: string; item: Correction }[] };

type Props = {
  receipt: Receipt;
  off: number[];
  /** новый чек, введённый вручную */
  manual?: boolean;
  entries: HistoryEntry[];
  onSave(r: EditResult): void;
  onClose(): void;
  onDelete?(): void;
};

/** «1 250,5» → 1250.5 */
const parseNum = (s: string): number => { const v = Number(s.replace(/[\s ]/g, '').replace(',', '.')); return Number.isFinite(v) && v >= 0 ? v : NaN; };

function NumField({ label, unit, value, onChange }: { label: string; unit: string; value: number | undefined; onChange(v: number): void }) {
  const [text, setText] = useState(value === undefined ? '' : String(value).replace('.', ','));
  return (
    <label className="grid gap-1">
      <span className="text-[13px] font-bold text-mute">{label}, {unit}</span>
      <input inputMode="decimal" className={inputCls} value={text} onChange={e => { setText(e.target.value); const v = parseNum(e.target.value); if (!Number.isNaN(v)) onChange(v); }} />
    </label>
  );
}

/** Часто покупаемое — чтобы внести чек руками за несколько нажатий. */
export function usualItems(entries: HistoryEntry[], limit = 8): ReceiptItem[] {
  const by = new Map<string, { n: number; at: string; it: ReceiptItem }>();
  for (const e of entries) {
    if (isDemo(e)) continue;
    for (const it of receiptOf(e)?.items ?? []) {
      if (!it.p || it.nf) continue;
      const cur = by.get(it.n);
      by.set(it.n, { n: (cur?.n ?? 0) + 1, at: cur && cur.at > e.date ? cur.at : e.date, it: cur && cur.at > e.date ? cur.it : it });
    }
  }
  return [...by.values()].filter(x => x.n >= 2).sort((a, b) => b.n - a.n || b.at.localeCompare(a.at)).slice(0, limit).map(x => x.it);
}

export function EditReceipt({ receipt, off, manual, entries, onSave, onClose, onDelete }: Props) {
  const [store, setStore] = useState(receipt.store === 'Магазин' && manual ? '' : receipt.store);
  const [date, setDate] = useState(receipt.date);
  const [refund, setRefund] = useState(!!receipt.refund);
  const [rows, setRows] = useState<Row[]>(() => receipt.items.map((it, i) => rowOf(it, off.includes(i), it)));
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  // вторая шторка открывается после первой, иначе окажется под ней
  useEffect(() => { if (!manual) return; const id = setTimeout(() => setAdding(true), 260); return () => clearTimeout(id); }, [manual]);
  const [confirm, setConfirm] = useState(false);

  const usual = useMemo(() => usualItems(entries), [entries]);
  const stores = useMemo(() => [...new Set(entries.filter(e => !isDemo(e)).map(e => e.store))].filter(s => s && s !== 'Магазин').slice(0, 6), [entries]);
  const unsure = rows.filter(r => r.it.q).length;
  const draft: Receipt = { ...receipt, items: rows.map(r => r.it) };
  const a = analyze(draft, [], rows.flatMap((r, i) => (r.off ? [i] : [])));
  const sum = rows.reduce((n, r) => n + r.it.p, 0);
  const gap = receipt.sum ? sum - receipt.sum : 0;
  const badDate = !isIso(date) || date > todayIso();

  const set = (key: string, fn: (r: Row) => Row) => setRows(list => list.map(r => (r.key === key ? { ...fn(r), touched: true } : r)));
  const patch = (key: string, p: Partial<ReceiptItem>) => set(key, r => ({ ...r, it: { ...r.it, ...p, src: 'user' } }));
  const rename = (key: string, n: string) => set(key, r => {
    const next = n.trim() ? buildItem(lineOf({ n: n.trim(), p: r.it.p })) : r.it;
    // неизвестное название не обнуляет то, что уже посчитано
    const known = next.src !== undefined || next.nf;
    return { ...r, it: { ...(known ? next : { ...r.it, n: n.trim() || r.it.n }), p: r.it.p, src: 'user', raw: r.it.raw ?? r.was?.n, q: undefined } };
  });
  const add = (it: ReceiptItem) => { const r = rowOf({ ...it, swap: it.swap }, false, null); setRows(l => [...l, r]); setAdding(false); setOpen(r.key); };

  const save = () => {
    const items = rows.map(r => { const it = { ...r.it }; if (it.raw === undefined) delete it.raw; if (!it.q) delete it.q; return it; });
    const corrections = rows.flatMap(r => {
      if (!r.touched || !r.was) return [];
      const { n, s, t: salt, f, k, c, b, w, nf, junk } = r.it;
      const same = n === r.was.n && s === r.was.s && w === r.was.w && nf === r.was.nf && k === r.was.k && salt === r.was.t && f === r.was.f && c === r.was.c && b === r.was.b;
      return same ? [] : [{ raw: r.was.raw ?? r.was.n, item: { n, s, t: salt, f, k, c, b, w, nf, junk } satisfies Correction }];
    });
    const name = store.trim() || t('Магазин');
    onSave({
      receipt: { ...receipt, store: name, date, title: refund ? t('Возврат') : receipt.title, items, ...(refund ? { refund: true } : { refund: undefined }) },
      off: rows.flatMap((r, i) => (r.off ? [i] : [])),
      corrections,
    });
  };

  return (
    <Sheet
      title={manual ? t('Чек вручную') : t('Изменить чек')}
      kicker={manual ? undefined : receipt.store}
      onClose={onClose}
      footer={
        <div className="grid gap-2">
          <p className="flex items-baseline justify-between px-1 text-[14px] font-bold text-mute" aria-live="polite">
            <span>{money(sum)}{gap ? <span className="text-[#B26A00]"> · {t('на чеке')} {money(receipt.sum!)}</span> : ''}</span>
            {rows.length > 0 && <span>{a.cubes} {pl(a.cubes, SUGAR_CUBES)} · {a.score}/100</span>}
          </p>
          <button type="button" className={primaryCls} disabled={!rows.length || badDate} onClick={save}>{t('Сохранить')}</button>
        </div>
      }
    >
      <div className="grid grid-cols-2 gap-2">
        <label className="col-span-2 grid gap-1">
          <span className="text-[13px] font-bold text-mute">{t('Магазин')}</span>
          <input className={inputCls} list="stores" value={store} maxLength={60} onChange={e => setStore(e.target.value)} placeholder="Magnum, Small…" />
          <datalist id="stores">{stores.map(s => <option key={s} value={s} />)}</datalist>
        </label>
        <label className="grid min-w-0 gap-1">
          <span className="text-[13px] font-bold text-mute">{t('Дата')}</span>
          <input type="date" className={inputCls} value={date} max={todayIso()} onChange={e => setDate(e.target.value)} aria-invalid={badDate} />
        </label>
        <div className="self-end"><Switch label={t('Возврат')} checked={refund} onChange={setRefund} /></div>
      </div>
      {badDate && <p className="mt-1 px-1 text-[13px] font-bold text-bad">{t('Дата не может быть в будущем')}</p>}
      {unsure > 0 && <p className="mt-3 rounded-2xl bg-[color-mix(in_srgb,var(--mid)_16%,var(--white))] px-3.5 py-3 text-[14px] leading-snug font-bold">{t('Уточни')} {unsure} {pl(unsure, CHECK_F)}: {t('прочитались плохо')}</p>}
      {!!gap && <p className="mt-2 rounded-2xl bg-[color-mix(in_srgb,var(--mid)_16%,var(--white))] px-3.5 py-3 text-[14px] leading-snug font-bold">{gap < 0 ? t('Не хватает {n} до суммы на чеке: возможно, пропущена строка.', { n: money(-gap) }) : t('На {n} больше суммы на чеке: возможно, есть лишняя строка или скидка.', { n: money(gap) })}</p>}

      <ul className="mt-3 grid gap-2">
        {rows.map(r => {
          const expanded = open === r.key;
          return (
            <li key={r.key} className={`rounded-[20px] ${r.it.q ? 'bg-[color-mix(in_srgb,var(--mid)_14%,var(--white))]' : 'bg-tint'} ${r.off ? 'opacity-70' : ''}`}>
              <button type="button" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : r.key)} className="grid min-h-14 w-full grid-cols-[minmax(0,1fr)_auto_20px] items-center gap-2.5 rounded-[20px] px-3.5 py-2.5 text-left active:scale-[.99]">
                <span className="min-w-0">
                  <span className={`block text-[15px] leading-snug font-bold ${r.off ? 'line-through' : ''}`}>{r.it.n || t('Без названия')}</span>
                  <span className="mt-0.5 block text-[13px] font-semibold text-mute">
                    {r.off ? t('не для нас') : r.it.nf ? t('не еда') : `${t('сахар')} ${amountTxt(r.it.s, 'sugar')}${r.it.w ? ` · ${t('на {n} нед.', { n: r.it.w })}` : ''}`}
                  </span>
                </span>
                <b className="font-display text-[15px] font-extrabold whitespace-nowrap tabular-nums">{money(r.it.p)}</b>
                <IconChevron className={`size-5 text-mute transition-transform ${expanded ? 'rotate-90' : ''}`} />
              </button>
              {expanded && (
                <div className="grid gap-2 px-3 pb-3 [&_input]:bg-white">
                  <label className="grid gap-1">
                    <span className="text-[13px] font-bold text-mute">{t('Название с весом или объёмом')}</span>
                    <input className={inputCls} defaultValue={r.it.n} maxLength={120} onBlur={e => { if (e.target.value.trim() !== r.it.n) rename(r.key, e.target.value); }} placeholder={t('Кефир 2,5% 1 л')} />
                  </label>
                  {r.it.raw && r.it.raw !== r.it.n && <p className="px-1 text-[13px] font-semibold text-mute">{t('На чеке')}: {r.it.raw}</p>}
                  <NumField label={t('Цена')} unit="₸" value={r.it.p} onChange={v => set(r.key, x => ({ ...x, it: { ...x.it, p: Math.round(v), q: undefined } }))} />
                  <Switch label={t('Не для нас')} hint={t('подарок, для соседей — не считать')} checked={r.off} onChange={v => set(r.key, x => ({ ...x, off: v }))} />
                  <Switch label={t('Не еда')} checked={!!r.it.nf} onChange={v => patch(r.key, v ? { nf: 1 } : { nf: undefined })} />
                  {!r.it.nf && (
                    <>
                      <Stepper label={t('Хватает, недель')} hint={t('сахар и масло покупают впрок')} value={r.it.w ?? 1} min={1} max={26} onChange={v => patch(r.key, { w: v > 1 ? v : undefined })} />
                      <details className="rounded-2xl bg-white px-3.5 py-3">
                        <summary className="cursor-pointer text-[14px] font-bold text-blue-1">{t('Показатели на всю позицию')}</summary>
                        <div key={r.it.n} className="mt-2 grid grid-cols-2 gap-2 [&_input]:bg-tint">
                          {FIELDS.map(([m, f]) => <NumField key={m} label={t(METRICS[m].label)} unit={t(METRICS[m].unit)} value={r.it[f]} onChange={v => patch(r.key, { [f]: v, ...(f === 's' ? { s: v } : {}) })} />)}
                        </div>
                      </details>
                    </>
                  )}
                  <button type="button" className={`${quietCls} bg-white! text-bad!`} onClick={() => { setRows(l => l.filter(x => x.key !== r.key)); setOpen(null); }}><IconTrash className="size-5" />{t('Удалить строку')}</button>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <button type="button" className={`${quietCls} mt-2`} onClick={() => setAdding(true)}><IconPlus className="size-5 text-blue-1" />{t('Добавить позицию')}</button>

      {onDelete && (confirm
        ? <div className="mt-4 rounded-[20px] bg-[color-mix(in_srgb,var(--bad)_10%,var(--white))] p-3.5">
            <p className="text-[15px] leading-snug font-bold">{t('Удалить чек? Вернуть его не получится.')}</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" className={quietCls} onClick={() => setConfirm(false)}>{t('Оставить')}</button>
              <button type="button" className={dangerCls} onClick={onDelete}>{t('Удалить')}</button>
            </div>
          </div>
        : <button type="button" className="mt-4 min-h-12 w-full rounded-2xl text-[14px] font-bold text-bad" onClick={() => setConfirm(true)}>{t('Удалить чек')}</button>)}

      <AnimatePresence>{adding && <AddItem usual={usual} onAdd={add} onClose={() => setAdding(false)} />}</AnimatePresence>
    </Sheet>
  );
}

function AddItem({ usual, onAdd, onClose }: { usual: ReceiptItem[]; onAdd(it: ReceiptItem): void; onClose(): void }) {
  const [q, setQ] = useState('');
  const query = q.toLowerCase().replaceAll('ё', 'е').trim();
  const found = query ? CATALOG.filter(c => c.name.toLowerCase().replaceAll('ё', 'е').includes(query)).slice(0, 5) : [];
  const submit = () => { if (q.trim()) onAdd(buildItem(lineOf({ n: q.trim(), p: 0 }))); };
  return (
    <Sheet title={t('Что купили?')} onClose={onClose}>
      <form onSubmit={e => { e.preventDefault(); submit(); }} className="grid gap-2">
        <input data-autofocus className={inputCls} value={q} maxLength={120} onChange={e => setQ(e.target.value)} placeholder={t('Кола 1 л, хлеб, яблоки 1,2 кг')} aria-label={t('Название с весом или объёмом')} enterKeyHint="done" />
        <button type="submit" className={primaryCls} disabled={!q.trim()}>{t('Добавить')}</button>
      </form>
      {found.length > 0 && (
        <ul className="mt-3 grid gap-1.5">
          {found.map(c => <li key={c.id}><button type="button" className={`${quietCls} justify-between!`} onClick={() => onAdd(buildItem(lineOf({ n: `${c.name}, ${c.portion.replace(/^(бутылка|пакет|банка|стаканчик|плитка|пачка|штука|порция|стакан) /, '')}`, p: 0 })))}><span>{c.name}</span><span className="text-mute">{c.portion}</span></button></li>)}
        </ul>
      )}
      {!query && usual.length > 0 && (
        <>
          <p className="mt-4 px-1 text-[13px] font-bold text-mute">{t('Как обычно')}</p>
          <ul className="mt-1.5 grid gap-1.5">
            {usual.map(it => <li key={it.n}><button type="button" className={`${quietCls} justify-between!`} onClick={() => onAdd(it)}><span className="min-w-0 truncate">{it.n}</span><span className="text-mute">{money(it.p)}</span></button></li>)}
          </ul>
        </>
      )}
    </Sheet>
  );
}

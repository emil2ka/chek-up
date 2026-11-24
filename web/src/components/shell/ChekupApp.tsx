'use client';
// Оболочка «Чек-апа»: состояние и переключение экранов.
// Разделы с нижней навигацией: главная, неделя, продукты, профиль.
// Путь чека: главная → сканирование → результат → главная. Кнопка «назад» браузера — через history API.
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { weekOf, weekTxt, todayIso } from '@/lib/calendar';
import { cartReceipt } from '@/lib/cart';
import { carts, factFor, waitingCart } from '@/lib/cartStore';
import { DEMO_CART, RECEIPTS } from '@/lib/data';
import { dirty } from '@/lib/dirty';
import { analyze, METRIC_IDS, metricTxt } from '@/lib/engine';
import { familyStore, weekMarks } from '@/lib/family';
import { setLang, t } from '@/lib/i18n';
import { badges, completeness, isDemo, receiptOf, weekFacts, weekStats } from '@/lib/insights';
import { blankReceipt, enqueue, newJobId, onBackgroundDone, outbox, outboxServerSnapshot, outboxSnapshot, saveReceipt, scanErrorText, startOutbox, subscribeOutbox, type Outcome } from '@/lib/outbox';
import { useNow } from '@/lib/now';
import { factOf } from '@/lib/plan';
import { profile as profileStore, profileServerSnapshot, profileSnapshot, subscribeProfile } from '@/lib/profile';
import { registerServiceWorker, takeShared } from '@/lib/pwa';
import { enrichCart } from '@/lib/recognize';
import type { ScanErrorCode } from '@/lib/scan/errors';
import { ReceiptSchema, type CartResponse } from '@/lib/schema';
import { shareCard } from '@/lib/shareCard';
import { history as store, historyServerSnapshot, historySnapshot, subscribeHistory } from '@/lib/store';
import { computeStreak, weekToClose, type WeekMark } from '@/lib/streak';
import { authProviders, postAuthed, startSync } from '@/lib/sync';
import type { Cart as CartData, HistoryEntry, MetricId, Receipt } from '@/lib/types';
import { JoinSheet, SignInSheet } from '@/components/account/Account';
import { Cart } from '@/components/cart/Cart';
import { CartScan } from '@/components/cart/CartScan';
import { CartSheet } from '@/components/cart/CartSheet';
import { Catalog } from '@/components/catalog/Catalog';
import { EditReceipt, type EditResult } from '@/components/edit/EditReceipt';
import { Home } from '@/components/home/Home';
import { Onboarding } from '@/components/onboarding/Onboarding';
import { Profile } from '@/components/profile/Profile';
import Result from '@/components/result/Result';
import { Scan } from '@/components/scan/Scan';
import { streakTitle } from '@/components/streak/Streak';
import { primaryCls, quietCls } from '@/components/ui/kit';
import { Sheet } from '@/components/ui/Sheet';
import { Week } from '@/components/week/Week';
import { TabBar, type Tab } from './TabBar';
import { Toast } from './Toast';

type View =
  | { key: number; name: Tab }
  | { key: number; name: 'scan'; files: File[]; jobId: string | null; receipt: Receipt | null }
  | { key: number; name: 'result'; id: string }
  | { key: number; name: 'cartscan'; files: File[] }
  | { key: number; name: 'cart'; id: string };
type ViewInit = View extends infer V ? (V extends View ? Omit<V, 'key'> : never) : never;

/** Наше состояние в history.state (Next.js дописывает туда свои поля). */
type NavState = { s?: 'scan' | 'result' | 'cart'; id?: string } | null;
const navState = (): NavState => (typeof window === 'undefined' ? null : (window.history.state as NavState));

const noop = () => () => {};
const isTab = (name: View['name']): name is Tab => name !== 'scan' && name !== 'result' && name !== 'cartscan' && name !== 'cart';

type ToastItem = { id: number; text: string; ms: number; action?: { label: string; run(): void } };
type Overlay =
  | { name: 'edit'; id: string }
  | { name: 'manual'; jobId: string | null; receipt: Receipt }
  | { name: 'photos'; files: File[] }
  | { name: 'cartpick' }
  | { name: 'editcart'; id: string }
  | { name: 'signin' }
  | { name: 'join'; code: string };

const ASKED = 'chekup.askedLogin';
/** после какого чека предлагаем войти */
const ASK_AFTER = 3;

/** Запись журнала, которую можно открыть: localStorage мог испортиться, поэтому чек проверяем схемой. */
function openable(e: HistoryEntry | null): Receipt | null {
  if (!e) return null;
  if (e.receipt && !ReceiptSchema.safeParse(e.receipt).success) return null;
  return receiptOf(e);
}

export default function ChekupApp() {
  const reduce = useReducedMotion();
  const entries = useSyncExternalStore(subscribeHistory, historySnapshot, historyServerSnapshot);
  const prof = useSyncExternalStore(subscribeProfile, profileSnapshot, profileServerSnapshot);
  const family = useSyncExternalStore(familyStore.subscribe, familyStore.get, familyStore.serverSnapshot);
  const marks = useSyncExternalStore(weekMarks.subscribe, weekMarks.get, weekMarks.serverSnapshot);
  const cartList = useSyncExternalStore(carts.subscribe, carts.get, carts.serverSnapshot);
  const jobs = useSyncExternalStore(subscribeOutbox, outboxSnapshot, outboxServerSnapshot);
  const hydrated = useSyncExternalStore(noop, () => true, () => false);
  const now = useNow();
  setLang(prof.lang); // до отрисовки детей; смена языка перемонтирует экраны через key

  const real = useMemo(() => entries.filter(e => !isDemo(e)), [entries]);
  // примеры видны, только пока нет своих чеков
  const shown = real.length ? real : entries;
  const facts = useMemo(() => weekFacts(real, prof), [real, prof]);
  const streak = useMemo(() => {
    const server = family.streak;
    const fresh = server && !dirty.any() && server.cells.at(-1)?.week === weekOf(todayIso(now));
    return fresh ? server : computeStreak(marks, facts, now);
  }, [family.streak, marks, facts, now]);
  const best = Math.max(family.bestWeeks, streak.best);
  const closing = weekToClose(marks, facts, now);
  const done = useMemo(() => completeness(real, marks, closing), [real, marks, closing]);
  const week = useMemo(() => {
    const w = weekStats(real, prof, { now });
    return METRIC_IDS.some(m => w.metrics[m].total > 0) ? (Object.fromEntries(METRIC_IDS.map(m => [m, w.metrics[m].total])) as Record<MetricId, number>) : null;
  }, [real, prof, now]);
  const names = useMemo(() => new Map(family.members.map(m => [m.id, m.name || t('участник')])), [family.members]);
  const child = family.me.role === 'child';

  const [view, setView] = useState<View>({ key: 0, name: 'home' });
  const viewRef = useRef(view);
  const seq = useRef(0);
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const addTo = useRef<File[]>([]); // кадры длинного чека или корзины, к которым доснимаем ещё один
  const shooting = useRef<'receipt' | 'cart' | 'ask'>('receipt'); // что снимаем
  const [cartFiles, setCartFiles] = useState<{ id: string; files: File[] } | null>(null); // кадры последней корзины: чтобы доснять
  const [refining, setRefining] = useState<{ id: string; n: number } | null>(null);
  const [replayIntro, setReplayIntro] = useState(false);
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  const closeOverlay = useCallback(() => setOverlay(null), []);

  const go = useCallback((v: ViewInit) => {
    const next = { ...v, key: ++seq.current } as View;
    viewRef.current = next;
    setView(next);
  }, []);

  // ── Уведомления: очередь, чтобы одно не затирало другое ──
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const toastSeq = useRef(0);
  const showToast = useCallback((text: string, ms = 5200, action?: ToastItem['action']) => {
    setToasts(q => [...q.slice(-2), { id: ++toastSeq.current, text, ms, action }]);
  }, []);
  const hideToast = useCallback(() => setToasts(q => q.slice(1)), []);
  const toast = toasts[0] ?? null;
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToasts(q => (q[0]?.id === toast.id ? q.slice(1) : q)), toast.ms);
    return () => clearTimeout(id);
  }, [toast]);

  // ── Переходы ──
  const goHome = useCallback(() => go({ name: 'home' }), [go]);

  const openTab = useCallback((tab: Tab) => {
    if (viewRef.current.name === tab) return;
    if (navState()?.s) window.history.replaceState(null, '');
    go({ name: tab });
  }, [go]);

  const openSaved = useCallback((id: string, push: boolean) => {
    if (!openable(store.get(id))) {
      showToast(t('Этот чек не получилось открыть'));
      if (!push) { window.history.replaceState(null, ''); goHome(); }
      return;
    }
    const st: NavState = { s: 'result', id };
    if (push) window.history.pushState(st, '');
    else window.history.replaceState(st, '');
    go({ name: 'result', id });
  }, [go, goHome, showToast]);

  const openCart = useCallback((id: string, push: boolean) => {
    if (!carts.byId(id)) { if (!push) { window.history.replaceState(null, ''); goHome(); } return; }
    const st: NavState = { s: 'cart', id };
    if (push) window.history.pushState(st, '');
    else window.history.replaceState(st, '');
    go({ name: 'cart', id });
  }, [go, goHome]);

  const enterScan = useCallback((v: { files: File[]; jobId: string | null; receipt: Receipt | null }) => {
    const s = navState()?.s;
    if (s) window.history.replaceState({ s: 'scan' } satisfies NavState, '');
    else window.history.pushState({ s: 'scan' } satisfies NavState, '');
    go({ name: 'scan', ...v });
  }, [go]);

  /** Один чек (одно фото или несколько кадров) — на экран сканирования. */
  const scanFiles = useCallback((files: File[]) => {
    const id = newJobId();
    enterScan({ files, jobId: id, receipt: null });
    void enqueue(files, null, id);
  }, [enterScan]);

  /** Корзина до кассы: фото или скриншоты — на экран разбора. */
  const scanCart = useCallback((files: File[]) => {
    if (navState()?.s) window.history.replaceState({ s: 'scan' } satisfies NavState, '');
    else window.history.pushState({ s: 'scan' } satisfies NavState, '');
    go({ name: 'cartscan', files });
  }, [go]);

  const back = useCallback(() => {
    if (navState()?.s) window.history.back(); // вернёт на главную через popstate
    else goHome();
  }, [goHome]);

  const pick = (input: HTMLInputElement | null) => { if (input) { input.value = ''; input.click(); } };
  const shoot = useCallback((what: 'receipt' | 'cart' | 'ask', from: 'camera' | 'gallery') => { addTo.current = []; shooting.current = what; pick((from === 'camera' ? camera : gallery).current); }, []);
  const openCamera = useCallback(() => shoot('receipt', 'camera'), [shoot]);
  const openGallery = useCallback(() => shoot('ask', 'gallery'), [shoot]);

  const addPhotos = useCallback((files: File[]) => {
    if (!files.length) return;
    const prev = addTo.current;
    addTo.current = [];
    if (shooting.current === 'cart') scanCart([...prev, ...files].slice(-3));
    else if (prev.length) scanFiles([...prev, ...files].slice(0, 3));
    else if (shooting.current === 'receipt' && files.length === 1) scanFiles(files);
    else setOverlay({ name: 'photos', files });
  }, [scanFiles, scanCart]);

  // ── Кнопка «назад» браузера ──
  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      const st = e.state as NavState;
      setOverlay(null);
      if (st?.s === 'result' && st.id) openSaved(st.id, false);
      else if (st?.s === 'cart' && st.id) openCart(st.id, false);
      else if (viewRef.current.name !== 'home') {
        if (st?.s) window.history.replaceState(null, ''); // сканирование нельзя «продолжить»
        goHome();
      }
    };
    addEventListener('popstate', onPop);
    return () => removeEventListener('popstate', onPop);
  }, [goHome, openSaved, openCart]);

  // ── Старт: если перезагрузили страницу на результате — открыть его снова; приглашение и фото из «Поделиться» ──
  // Читать history.state можно только после гидратации, иначе разметка разойдётся с серверной.
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    const join = q.get('join'), shared = q.get('shared');
    if (join || shared) window.history.replaceState(navState(), '', location.pathname);
    const st = navState();
    if (st?.s === 'result' && st.id && store.get(st.id)) openSaved(st.id, false);
    else if (st?.s === 'cart' && st.id && carts.byId(st.id)) openCart(st.id, false);
    else if (st?.s) window.history.replaceState(null, '');
    if (join) queueMicrotask(() => setOverlay({ name: 'join', code: join.toUpperCase().slice(0, 14) }));
    if (shared) { shooting.current = 'ask'; void takeShared().then(addPhotos); }
    registerServiceWorker();
  }, [openSaved, openCart, addPhotos]);

  // ── iOS: доступ к датчику наклона по первому нажатию любой кнопки ──
  useEffect(() => {
    type DOE = { requestPermission?: () => Promise<string> };
    const ask = (e: MouseEvent) => {
      if (!(e.target instanceof Element) || !e.target.closest('button, label')) return;
      document.removeEventListener('click', ask, true);
      const D = (window as unknown as { DeviceOrientationEvent?: DOE }).DeviceOrientationEvent;
      if (D && typeof D.requestPermission === 'function') {
        try { D.requestPermission().catch(() => {}); } catch { /* отказ — молча */ }
      }
    };
    document.addEventListener('click', ask, true);
    return () => document.removeEventListener('click', ask, true);
  }, []);

  useEffect(() => { document.documentElement.lang = prof.lang; }, [prof.lang]);

  // ── Общий сервер и БД, очередь чеков ──
  useEffect(() => {
    if (!hydrated) return;
    const offs = [startSync(), startOutbox()];
    return () => offs.forEach(off => off());
  }, [hydrated]);

  useEffect(() => onBackgroundDone(o => {
    if (o.kind === 'error') { showToast(t(scanErrorText(o.code))); return; }
    if (o.kind === 'demo') { showToast(t(o.notice)); return; }
    const open = { label: t('Открыть'), run: () => openSaved(o.entryId, true) };
    showToast(o.kind === 'duplicate' ? t('Этот чек уже есть в журнале') : t('Чек прочитан: {s}', { s: o.receipt.store }), 6000, open);
  }), [openSaved, showToast]);

  // ── Достижения: сообщаем о новых один раз ──
  useEffect(() => {
    if (!hydrated) return;
    const fresh = badges(real, prof, marks, best).filter(b => b.done && !prof.seen.includes(b.id));
    if (!fresh.length) return;
    profileStore.update({ seen: [...prof.seen, ...fresh.map(b => b.id)] }, false);
    const list = fresh.map(b => `«${t(b.title)}»`).join(', ');
    showToast(fresh.length === 1 ? t('Новое достижение: {n}', { n: list }) : t('Новые достижения: {n}', { n: list }), 4200);
  }, [hydrated, real, prof, marks, best, showToast]);

  // ── После третьего чека один раз предлагаем войти, если вход подключён ──
  const homeNow = view.name === 'home';
  const canAsk = hydrated && homeNow && prof.onboarded && !overlay && !family.me.email && !!family.id && real.length >= ASK_AFTER;
  useEffect(() => {
    if (!canAsk) return;
    try { if (localStorage.getItem(ASKED)) return; } catch { return; }
    let dead = false;
    const id = setTimeout(() => {
      authProviders().then(p => {
        if (dead || (!p.email && !p.google)) return;
        try { localStorage.setItem(ASKED, String(Date.now())); } catch { /* ничего */ }
        setOverlay({ name: 'signin' });
      }).catch(() => { /* спросим в другой раз */ });
    }, 1200);
    return () => { dead = true; clearTimeout(id); };
  }, [canAsk]);

  // ── Чек прочитан на экране ──
  const onScanned = (o: Outcome) => {
    if (o.kind === 'error') {
      const v = viewRef.current;
      if (o.code === 'not_receipt' && v.name === 'scan' && v.files.length) {
        const { files, jobId } = v;
        showToast(t('Похоже, это не чек'), 8000, { label: t('Это корзина'), run: () => { if (jobId) void outbox.remove(jobId); scanCart(files); } });
        back();
        return;
      }
      showToast(o.code === 'unavailable' || o.code === 'rate_limit' ? t('Чек в очереди: прочитаем, как только получится') : t(scanErrorText(o.code)));
      back();
      return;
    }
    if (o.kind === 'demo') {
      const r = o.receipt, a = analyze(r);
      const rec = store.findByReceipt(r.id) ?? store.save({ id: store.newId(), receiptId: r.id, store: r.store, date: r.date, cubes: a.cubes, score: a.score, swaps: [], ...(RECEIPTS.some(x => x.id === r.id) ? {} : { receipt: r }) });
      openSaved(rec.id, false);
      if (o.notice) showToast(t(o.notice));
      return;
    }
    openSaved(o.entryId, false);
    if (o.kind === 'duplicate') showToast(t('Этот чек уже есть в журнале, второй раз не считаем'));
  };

  // ── Корзина узнана ──
  const onCart = (files: File[], r: CartResponse) => {
    const c = carts.add(r.cart, r.notice ? { demo: true } : {});
    setCartFiles(r.notice ? null : { id: c.id, files });
    openCart(c.id, false);
    if (r.notice) { showToast(t(r.notice)); return; }
    if (!r.pending.length) return;
    setRefining({ id: c.id, n: r.pending.length });
    void enrichCart(c, r.pending).then(items => {
      setRefining(x => (x?.id === c.id ? null : x));
      const cur = carts.byId(c.id);
      // пока уточняли, человек мог исправить корзину: тогда его правка важнее
      if (items && cur && cur.items.length === items.length && cur.items.every((it, i) => it.n === c.items[i].n)) carts.patch(c.id, { items });
    });
  };
  const onCartError = (files: File[], code: ScanErrorCode) => {
    if (code === 'is_receipt') showToast(t('Это уже чек, а не корзина'), 8000, { label: t('Открыть как чек'), run: () => scanFiles(files) });
    else showToast(code === 'unavailable' && navigator.onLine === false ? t('Нет интернета: корзину пока не проверить') : t(scanErrorText(code)), 6000);
    back();
  };
  const finishCart = (c: CartData) => {
    back();
    if (c.demo) { carts.remove(c.id); return; }
    if (c.doneAt) return;
    carts.finish(c.id);
    showToast(t('Готово. После кассы сфоткай чек: сверим, что получилось'), 5200);
  };
  const saveCartEdit = (c: CartData, r: EditResult) => {
    // решения держатся за название: строки могли удалить или переставить
    const at = (i: number) => r.receipt.items.findIndex(it => it.n === c.items[i]?.n || (it.raw !== undefined && it.raw === c.items[i]?.n));
    const move = (list: number[], need: boolean) => [...new Set(list.map(at).filter(i => i >= 0 && (!need || !!r.receipt.items[i].swap)))].sort((a, b) => a - b);
    const out = [...new Set([...move(c.out, false), ...r.off])].sort((a, b) => a - b);
    carts.patch(c.id, { items: r.receipt.items, out, swaps: move(c.swaps, true).filter(i => !out.includes(i)) });
    setOverlay(null);
  };
  const waiting = hydrated ? waitingCart(cartList, now || undefined) : null;
  const weekSugar = useMemo(() => {
    const w = weekStats(real, prof, { now });
    return { total: w.metrics.sugar.total, norm: w.metrics.sugar.norm };
  }, [real, prof, now]);

  // ── Правка чека ──
  const saveEdit = (e: HistoryEntry, r: EditResult) => {
    // план замен держится за название позиции: строки могли удалить или переставить
    const old = receiptOf(e)?.items ?? [];
    const swaps = e.swaps.flatMap(i => {
      const name = old[i]?.n;
      const at = r.receipt.items.findIndex(it => (it.n === name || it.raw === name) && it.swap);
      return at >= 0 ? [at] : [];
    });
    const a = analyze(r.receipt, [], r.off);
    store.patch(e.id, { receipt: r.receipt, store: r.receipt.store, date: r.receipt.date, off: r.off.length ? r.off : undefined, swaps: [...new Set(swaps)], cubes: a.cubes, score: a.score });
    setOverlay(null);
    showToast(t('Чек исправлен'), 2400);
    if (r.corrections.length && !child) postAuthed('/api/corrections', { store: r.receipt.store, items: r.corrections.slice(0, 100) }).catch(() => { /* запомним в другой раз */ });
  };
  const saveManual = (r: EditResult, jobId: string | null) => {
    const s = saveReceipt(r.receipt);
    if (!s.duplicate && r.off.length) store.patch(s.entryId, { off: r.off });
    if (jobId) void outbox.remove(jobId);
    setOverlay(null);
    openSaved(s.entryId, true);
    if (s.duplicate) showToast(t('Этот чек уже есть в журнале, второй раз не считаем'));
  };

  const setMark = (week: string, state: WeekMark['state']) => {
    weekMarks.setState(week, state);
    if (state !== 'open' && navigator.userActivation?.isActive !== false) navigator.vibrate?.([12, 40, 12]);
  };

  const shareWeek = async (week: string) => {
    const w = weekStats(real, prof, { week });
    const text = t('{s} в «Чек-ап». За неделю в наших чеках: {list}.', { s: streakTitle(streak), list: (['sugar', 'salt', 'fat'] as const).map(m => metricTxt(w.metrics[m].total, m)).join(', ') });
    try {
      const how = await shareCard({
        metric: 'sugar',
        cubesBy: Object.fromEntries(METRIC_IDS.map(m => [m, w.metrics[m].cubes])) as Record<(typeof METRIC_IDS)[number], number>,
        totals: Object.fromEntries(METRIC_IDS.map(m => [m, w.metrics[m].total])) as Record<(typeof METRIC_IDS)[number], number>,
        available: METRIC_IDS,
        pill: streakTitle(streak),
        tone: w.ratio <= 0.7 ? 'good' : w.ratio <= 1 ? 'mid' : 'bad',
        where: weekTxt(week),
        kick: t('За неделю'),
        question: t('А сколько у вас за неделю?'),
        level: streak.level,
      }, text);
      if (how === 'saved') showToast(t('Картинка сохранена, отправь её друзьям'), 3200);
    } catch {
      try { await navigator.clipboard.writeText(text); showToast(t('Текст скопирован, вставь его в чат'), 3200); } catch { showToast(t('Не получилось скопировать'), 3200); }
    }
  };

  // ── Экраны ──
  const renderView = (v: View) => {
    const alive = () => viewRef.current.key === v.key; // уходящий экран не управляет оболочкой
    switch (v.name) {
      case 'home':
        return (
          <Home
            ready={hydrated}
            entries={shown}
            real={real.length > 0}
            jobs={jobs}
            streak={streak}
            done={done}
            week={week}
            hideMoney={child}
            waiting={waiting}
            onCart={() => setOverlay({ name: 'cartpick' })}
            onOpenCart={id => openCart(id, true)}
            onScan={openCamera}
            onGallery={openGallery}
            onManual={jobId => setOverlay({ name: 'manual', jobId: jobId ?? null, receipt: blankReceipt() })}
            onDemo={r => enterScan({ files: [], jobId: null, receipt: r })}
            onOpen={id => openSaved(id, true)}
            onWeek={() => openTab('week')}
          />
        );
      case 'week':
        return (
          <Week
            ready={hydrated}
            entries={shown}
            profile={prof}
            family={family}
            marks={marks}
            streak={streak}
            onOpen={id => openSaved(id, true)}
            onScan={openCamera}
            onProfile={() => openTab('profile')}
            onMark={setMark}
            onShareWeek={w => { void shareWeek(w); }}
          />
        );
      case 'catalog':
        return <Catalog />;
      case 'profile':
        return (
          <Profile
            ready={hydrated}
            entries={entries}
            profile={prof}
            family={family}
            marks={marks}
            best={best}
            onClear={() => {
              for (const e of entries) if (!e.by || e.by === family.me.id || isDemo(e)) store.remove(e.id);
              carts.clear();
              showToast(t('Твои чеки удалены'), 2600);
            }}
            onReplayIntro={() => setReplayIntro(true)}
            onToast={text => showToast(text, 3600)}
          />
        );
      case 'scan':
        return (
          <Scan
            files={v.files}
            jobId={v.jobId}
            receipt={v.receipt}
            onCancel={() => { if (!alive()) return; if (v.jobId) void outbox.remove(v.jobId); back(); }}
            onBackground={() => { if (alive()) back(); }}
            onMore={() => { if (!alive() || !v.jobId) return; addTo.current = v.files; pick(camera.current); }}
            onDone={o => { if (alive()) onScanned(o); }}
          />
        );
      case 'cartscan':
        return <CartScan files={v.files} onCancel={() => { if (alive()) back(); }} onDone={r => { if (alive()) onCart(v.files, r); }} onError={code => { if (alive()) onCartError(v.files, code); }} />;
      case 'cart': {
        const c = cartList.find(x => x.id === v.id);
        if (!c) return null;
        const mine = cartFiles?.id === c.id ? cartFiles.files : null;
        return (
          <Cart
            cart={c}
            pending={refining?.id === c.id ? refining.n : 0}
            level={streak.level}
            week={weekSugar}
            onBack={() => { if (alive()) back(); }}
            onChange={p => carts.patch(c.id, p)}
            onDone={() => { if (alive()) finishCart(c); }}
            onEdit={() => setOverlay({ name: 'editcart', id: c.id })}
            onMore={mine && mine.length < 3 ? () => { addTo.current = mine; shooting.current = 'cart'; pick(camera.current); } : undefined}
            onDelete={() => { if (!alive()) return; back(); carts.remove(c.id); showToast(t('Корзина удалена'), 2400); }}
          />
        );
      }
      case 'result': {
        const e = entries.find(x => x.id === v.id) ?? null;
        const receipt = e && receiptOf(e);
        if (!e || !receipt) return null;
        const mine = !e.by || e.by === family.me.id;
        const editable = !isDemo(e) && !receipt.masked && (mine || !child);
        return (
          <Result
            receipt={receipt}
            swaps={e.swaps}
            off={e.off}
            tag={e.tag}
            priv={e.priv}
            score={e.score}
            level={streak.level}
            author={mine ? undefined : names.get(e.by!)}
            demo={isDemo(e)}
            cart={factFor(cartList, e.id)}
            onBack={() => { if (alive()) back(); }}
            onScan={openCamera}
            onSwaps={swaps => { store.patch(e.id, { swaps, score: receipt.masked ? e.score : factOf(e, receipt).score }); }}
            onFlags={editable ? f => store.patch(e.id, { ...(f.tag !== undefined ? { tag: f.tag ?? undefined } : {}), ...(f.priv !== undefined ? { priv: f.priv || undefined } : {}) }) : undefined}
            onEdit={editable ? () => setOverlay({ name: 'edit', id: e.id }) : undefined}
          />
        );
      }
    }
  };

  const enter = reduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.2 } }
    : {
        initial: { opacity: 0, y: 18, scale: 0.985 },
        animate: { opacity: 1, y: 0, scale: 1 },
        exit: { scale: 0.96, filter: 'brightness(0.8)' },
        transition: { duration: 0.26, ease: [0.2, 0.8, 0.2, 1] as const },
      };

  const tab = isTab(view.name) ? view.name : null;
  const intro = hydrated && (!prof.onboarded || replayIntro);
  const editing = overlay?.name === 'edit' ? entries.find(e => e.id === overlay.id) ?? null : null;
  const editingCart = overlay?.name === 'editcart' ? cartList.find(c => c.id === overlay.id) ?? null : null;
  const editingReceipt = editing && receiptOf(editing);

  return (
    <main
      key={prof.lang}
      data-tabs={tab ? '' : undefined}
      className="app-shell relative isolate mx-auto h-dvh w-full max-w-[430px] overflow-hidden bg-blue-1 md:shadow-[0_0_0_1px_color-mix(in_srgb,var(--white)_8%,transparent),0_30px_90px_color-mix(in_srgb,var(--blue-1)_25%,transparent)]"
    >
      <AnimatePresence initial={false}>
        <motion.section
          key={view.key}
          data-screen={view.name}
          {...enter}
          style={{ zIndex: view.key + 1 }}
          className={`no-scrollbar absolute inset-0 overflow-x-hidden overflow-y-auto overscroll-contain bg-sky text-white ${isTab(view.name) ? 'pb-(--tabbar)' : ''}`}
        >
          {renderView(view)}
        </motion.section>
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {tab && <TabBar key="tabs" tab={tab} onTab={openTab} />}
      </AnimatePresence>

      <AnimatePresence>
        {intro && (
          <Onboarding
            key="intro"
            profile={prof}
            onDone={() => { profileStore.update({ onboarded: true }); setReplayIntro(false); }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {!intro && editing && editingReceipt && (
          <EditReceipt
            key={`edit-${editing.id}`}
            receipt={editingReceipt}
            off={editing.off ?? []}
            entries={real}
            onSave={r => saveEdit(editing, r)}
            onClose={closeOverlay}
            onDelete={() => { setOverlay(null); back(); store.remove(editing.id); showToast(t('Чек удалён'), 2600); }}
          />
        )}
        {!intro && overlay?.name === 'manual' && (
          <EditReceipt key="manual" manual receipt={overlay.receipt} off={[]} entries={real} onSave={r => saveManual(r, overlay.jobId)} onClose={closeOverlay} />
        )}
        {!intro && overlay?.name === 'photos' && (
          <Sheet key="photos" title={overlay.files.length > 1 ? t('Выбрано фото: {n}', { n: overlay.files.length }) : t('Что на фото?')} onClose={closeOverlay}>
            <div className="grid gap-2">
              {overlay.files.length <= 3 && <button type="button" className={quietCls} onClick={() => { const { files } = overlay; setOverlay(null); scanCart(files); }}>{t('Корзина или заказ, до оплаты')}</button>}
              {overlay.files.length === 1 && <button type="button" className={primaryCls} onClick={() => { const { files } = overlay; setOverlay(null); scanFiles(files); }}>{t('Чек, уже оплачен')}</button>}
              {overlay.files.length > 1 && <button type="button" className={primaryCls} onClick={() => { const { files } = overlay; setOverlay(null); void (async () => { for (const f of files.slice(0, 10)) await enqueue([f]); })(); showToast(t('Чеки в очереди: читаю по одному, можно закрыть телефон'), 4200); }}>{t('Это разные чеки')}</button>}
              {overlay.files.length > 1 && <button type="button" className={quietCls} disabled={overlay.files.length > 3} onClick={() => { const { files } = overlay; setOverlay(null); scanFiles(files); }}>{t('Это один длинный чек')}</button>}
              {overlay.files.length > 3 && <p className="px-1 text-[13px] font-semibold text-mute">{t('Длинный чек: до трёх кадров. Разных чеков за раз: до десяти.')}</p>}
            </div>
          </Sheet>
        )}
        {!intro && overlay?.name === 'cartpick' && (
          <CartSheet
            key="cartpick"
            onClose={closeOverlay}
            onCamera={() => { setOverlay(null); shoot('cart', 'camera'); }}
            onGallery={() => { setOverlay(null); shoot('cart', 'gallery'); }}
            onDemo={() => { setOverlay(null); openCart(carts.add(DEMO_CART, { demo: true }).id, true); }}
          />
        )}
        {!intro && editingCart && (
          <EditReceipt key={`cart-${editingCart.id}`} cart receipt={cartReceipt(editingCart)} off={editingCart.out} entries={real} onSave={r => saveCartEdit(editingCart, r)} onClose={closeOverlay} />
        )}
        {!intro && overlay?.name === 'signin' && <SignInSheet key="signin" onClose={closeOverlay} onDone={() => { setOverlay(null); showToast(t('Готово, чеки сохранены в аккаунте'), 3600); }} />}
        {!intro && overlay?.name === 'join' && <JoinSheet key="join" initial={overlay.code} onClose={closeOverlay} onDone={() => { setOverlay(null); showToast(t('Добро пожаловать в семью'), 3600); }} />}
      </AnimatePresence>

      <input
        ref={camera}
        type="file"
        accept="image/*"
        capture="environment"
        tabIndex={-1}
        aria-hidden
        className="sr-only"
        onChange={e => addPhotos([...(e.currentTarget.files ?? [])])}
      />
      <input
        ref={gallery}
        type="file"
        accept="image/*"
        multiple
        tabIndex={-1}
        aria-hidden
        className="sr-only"
        onChange={e => addPhotos([...(e.currentTarget.files ?? [])])}
      />
      <Toast msg={toast && { id: toast.id, text: toast.text, action: toast.action }} onClose={hideToast} />
    </main>
  );
}

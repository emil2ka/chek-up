'use client';
// Оболочка «Чек-апа»: состояние и переключение экранов.
// Разделы с нижней навигацией: главная, неделя, продукты, профиль.
// Путь чека: главная → сканирование → результат → главная. Кнопка «назад» браузера — через history API.
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { RECEIPTS } from '@/lib/data';
import { history as store, historyServerSnapshot, historySnapshot, subscribeHistory } from '@/lib/store';
import { profile as profileStore, profileServerSnapshot, profileSnapshot, subscribeProfile } from '@/lib/profile';
import { badges } from '@/lib/insights';
import { startSync } from '@/lib/sync';
import { ReceiptSchema, type ScanResponse } from '@/lib/schema';
import { ScanError } from '@/lib/scan/errors';
import type { Receipt } from '@/lib/types';
import { Home } from '@/components/home/Home';
import { Scan } from '@/components/scan/Scan';
import Result from '@/components/result/Result';
import { Week } from '@/components/week/Week';
import { Catalog } from '@/components/catalog/Catalog';
import { Profile } from '@/components/profile/Profile';
import { Onboarding } from '@/components/onboarding/Onboarding';
import { TabBar, type Tab } from './TabBar';
import { Toast } from './Toast';

type View =
  | { key: number; name: Tab }
  | { key: number; name: 'scan'; file: File | null; receipt: Receipt | null }
  | { key: number; name: 'result'; receipt: Receipt; swaps: number[]; id: string };
type ViewInit = View extends infer V ? (V extends View ? Omit<V, 'key'> : never) : never;

/** Наше состояние в history.state (Next.js дописывает туда свои поля). */
type NavState = { s?: 'scan' | 'result'; id?: string } | null;
const navState = (): NavState => (typeof window === 'undefined' ? null : (window.history.state as NavState));

const byId = (id: string) => RECEIPTS.find(r => r.id === id) ?? null;
const noop = () => () => {};
const isTab = (name: View['name']): name is Tab => name !== 'scan' && name !== 'result';

type ToastItem = { id: number; text: string; ms: number };

export default function ChekupApp() {
  const reduce = useReducedMotion();
  const entries = useSyncExternalStore(subscribeHistory, historySnapshot, historyServerSnapshot);
  const prof = useSyncExternalStore(subscribeProfile, profileSnapshot, profileServerSnapshot);
  const hydrated = useSyncExternalStore(noop, () => true, () => false);

  const [view, setView] = useState<View>({ key: 0, name: 'home' });
  const viewRef = useRef(view);
  const seq = useRef(0);
  const camera = useRef<HTMLInputElement>(null);
  const [replayIntro, setReplayIntro] = useState(false);

  const go = useCallback((v: ViewInit) => {
    const next = { ...v, key: ++seq.current } as View;
    viewRef.current = next;
    setView(next);
  }, []);

  // ── Уведомления: очередь, чтобы одно не затирало другое ──
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const toastSeq = useRef(0);
  const showToast = useCallback((text: string, ms = 5200) => {
    setToasts(q => [...q.slice(-2), { id: ++toastSeq.current, text, ms }]);
  }, []);
  const hideToast = useCallback(() => setToasts(q => q.slice(1)), []);
  const toast = toasts[0] ?? null;
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToasts(q => (q[0]?.id === toast.id ? q.slice(1) : q)), toast.ms);
    return () => clearTimeout(t);
  }, [toast]);

  // ── Переходы ──
  const goHome = useCallback(() => go({ name: 'home' }), [go]);

  const openTab = useCallback((t: Tab) => {
    if (viewRef.current.name === t) return;
    if (navState()?.s) window.history.replaceState(null, '');
    go({ name: t });
  }, [go]);

  const openResult = useCallback((receipt: Receipt, id: string, swaps: number[], push: boolean) => {
    const st: NavState = { s: 'result', id };
    if (push) window.history.pushState(st, '');
    else window.history.replaceState(st, '');
    go({ name: 'result', receipt, swaps: [...swaps], id });
  }, [go]);

  const openSaved = useCallback((id: string, push: boolean) => {
    const rec = store.get(id);
    // демо-чек берём из data.ts, распознанный — из самой записи (проверяем схемой: localStorage мог испортиться)
    const saved = rec?.receipt ? ReceiptSchema.safeParse(rec.receipt) : null;
    const receipt = rec && (saved?.success ? saved.data : byId(rec.receiptId));
    if (!rec || !receipt) {
      showToast('Этот чек не получилось открыть');
      if (!push) { window.history.replaceState(null, ''); goHome(); }
      return;
    }
    openResult(receipt, rec.id, rec.swaps, push);
  }, [goHome, openResult, showToast]);

  const startScan = useCallback((file: File | null, receipt: Receipt | null) => {
    const s = navState()?.s;
    if (s === 'scan' || s === 'result') window.history.replaceState({ s: 'scan' } satisfies NavState, '');
    else window.history.pushState({ s: 'scan' } satisfies NavState, '');
    go({ name: 'scan', file, receipt });
  }, [go]);

  const back = useCallback(() => {
    if (navState()?.s) window.history.back(); // вернёт на главную через popstate
    else goHome();
  }, [goHome]);

  const openCamera = useCallback(() => {
    const input = camera.current;
    if (!input) return;
    input.value = '';
    input.click();
  }, []);

  // ── Кнопка «назад» браузера ──
  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      const st = e.state as NavState;
      if (st?.s === 'result' && st.id) openSaved(st.id, false);
      else if (viewRef.current.name !== 'home') {
        if (st?.s) window.history.replaceState(null, ''); // сканирование нельзя «продолжить»
        goHome();
      }
    };
    addEventListener('popstate', onPop);
    return () => removeEventListener('popstate', onPop);
  }, [goHome, openSaved]);

  // ── Старт: если перезагрузили страницу на результате — открыть его снова ──
  // Читать history.state можно только после гидратации, иначе разметка разойдётся с серверной.
  useEffect(() => {
    const st = navState();
    // однократная синхронизация с history.state после гидратации
    if (st?.s === 'result' && st.id && store.get(st.id)) openSaved(st.id, false);
    else if (st?.s) window.history.replaceState(null, '');
  }, [openSaved]);

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

  // ── Общий сервер и БД: чеки и профиль синхронизируются с мобильным приложением ──
  useEffect(() => (hydrated ? startSync() : undefined), [hydrated]);

  // ── Достижения: сообщаем о новых один раз ──
  useEffect(() => {
    if (!hydrated) return;
    const fresh = badges(entries, prof).filter(b => b.done && !prof.seen.includes(b.id));
    if (!fresh.length) return;
    profileStore.update({ seen: [...prof.seen, ...fresh.map(b => b.id)] }, false);
    const names = fresh.map(b => `«${b.title}»`).join(', ');
    showToast(fresh.length === 1 ? `Новое достижение: ${names}` : `Новые достижения: ${names}`, 4200);
  }, [hydrated, entries, prof, showToast]);

  // ── Экраны ──
  const renderView = (v: View) => {
    const alive = () => viewRef.current.key === v.key; // уходящий экран не управляет оболочкой
    switch (v.name) {
      case 'home':
        return (
          <Home
            ready={hydrated}
            entries={entries}
            onScan={openCamera}
            onDemo={r => startScan(null, r)}
            onOpen={id => openSaved(id, true)}
          />
        );
      case 'week':
        return (
          <Week
            ready={hydrated}
            entries={entries}
            profile={prof}
            onOpen={id => openSaved(id, true)}
            onDelete={id => { store.remove(id); showToast('Чек удалён из истории', 2600); }}
            onScan={openCamera}
            onProfile={() => openTab('profile')}
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
            onClear={() => { store.clear(); showToast('История очищена', 2600); }}
            onReplayIntro={() => setReplayIntro(true)}
          />
        );
      case 'scan':
        return (
          <Scan
            file={v.file}
            receipt={v.receipt}
            onCancel={() => { if (alive()) back(); }}
            onDone={({ receipt: r, notice }: ScanResponse) => {
              if (!alive()) return;
              const prev = store.findByReceipt(r.id);
              openResult(r, prev ? prev.id : store.newId(), [], false);
              if (notice) showToast(notice);
            }}
            onError={err => {
              if (!alive()) return;
              if (!(err instanceof ScanError)) console.error('Не удалось прочитать чек', err);
              showToast(err instanceof ScanError ? err.message : 'Не получилось прочитать чек. Попробуй ещё раз');
              back();
            }}
          />
        );
      case 'result':
        return (
          <Result
            receipt={v.receipt}
            swaps={v.swaps}
            onBack={() => { if (alive()) back(); }}
            onScan={openCamera}
            onChange={({ swaps, analysis }) => {
              store.save({
                id: v.id,
                receiptId: v.receipt.id,
                store: v.receipt.store,
                date: v.receipt.date,
                cubes: analysis.cubes,
                score: analysis.score,
                swaps,
                ...(byId(v.receipt.id) ? {} : { receipt: v.receipt }),
              });
            }}
          />
        );
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

  return (
    <main
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

      <input
        ref={camera}
        type="file"
        accept="image/*"
        capture="environment"
        tabIndex={-1}
        aria-hidden
        className="sr-only"
        onChange={e => {
          const file = e.currentTarget.files?.[0];
          if (file) startScan(file, null);
        }}
      />
      <Toast msg={toast && { id: toast.id, text: toast.text }} onClose={hideToast} />
    </main>
  );
}

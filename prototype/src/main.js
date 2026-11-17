// Оболочка «Чек-апа»: шрифты, стили, состояние и переключение экранов.
// Путь: главная → сканирование → результат → главная.
import '@fontsource-variable/unbounded';
import '@fontsource-variable/manrope';
import './tokens.css';
import './base.css';
import './home.css';
import './scan.css';

import { RECEIPTS } from './data.js';
import { mountHome } from './home.js';
import { mountScan } from './scan.js';
import { mountResult } from './result.js';
import { history as store } from './store.js';

const app = document.getElementById('app');
const camera = document.getElementById('camera');
const toastEl = document.getElementById('toast');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

const byId = id => RECEIPTS.find(r => r.id === id) || null;

// ── Экраны ──────────────────────────────────────────────
let current = null; // { name, el, view }

function show(name, mount) {
  const prev = current;
  const el = document.createElement('section');
  el.className = `screen screen-${name}`;
  el.dataset.screen = name;
  app.append(el);

  if (prev) {
    prev.view?.destroy?.();
    prev.el.classList.remove('is-entering');
    prev.el.classList.add('is-leaving');
    prev.el.setAttribute('aria-hidden', 'true');
    prev.el.inert = true;
    const drop = () => prev.el.remove();
    if (reduceMotion.matches) setTimeout(drop, 200);
    else {
      prev.el.addEventListener('animationend', drop, { once: true });
      setTimeout(drop, 400); // страховка, если анимация не сработала
    }
    el.classList.add('is-entering');
    el.addEventListener('animationend', () => el.classList.remove('is-entering'), { once: true });
  }

  current = { name, el, view: null };
  current.view = mount(el);
  return current;
}

function goHome() {
  show('home', el => mountHome(el, {
    history: store.all(),
    onScan: openCamera,
    onDemo: receipt => startScan({ receipt }),
    onOpen: id => openSaved(id, { push: true }),
  }));
}

/** Сканирование: либо фото с камеры, либо выбранный демо-чек. */
function startScan({ file = null, receipt = null }) {
  if (history.state?.s === 'scan' || history.state?.s === 'result') history.replaceState({ s: 'scan' }, '');
  else history.pushState({ s: 'scan' }, '');

  show('scan', el => mountScan(el, {
    file,
    receipt,
    onDone: ({ receipt: r, notice }) => {
      const prev = store.findByReceipt(r.id);
      openResult(r, { id: prev ? prev.id : store.newId(), swaps: [] });
      if (notice) toast(notice);
    },
    onCancel: back,
  }));
}

function openSaved(id, { push = false } = {}) {
  const rec = store.get(id);
  const receipt = rec && byId(rec.receiptId);
  if (!receipt) {
    toast('Этот чек не получилось открыть');
    if (!push) { history.replaceState(null, ''); goHome(); }
    return;
  }
  openResult(receipt, { id: rec.id, swaps: rec.swaps || [], push });
}

function openResult(receipt, { id, swaps, push = false }) {
  const state = { s: 'result', id };
  if (push) history.pushState(state, '');
  else history.replaceState(state, '');

  show('result', el => mountResult(el, {
    receipt,
    swaps: [...swaps],
    onBack: back,
    onScan: openCamera,
    onChange: ({ swaps: sw, analysis }) => {
      store.save({
        id,
        receiptId: receipt.id,
        store: receipt.store,
        date: receipt.date,
        cubes: analysis.cubes,
        score: analysis.score,
        swaps: sw,
      });
    },
  }));
}

// ── Назад: кнопка «назад» в приложении и в браузере ──────
function back() {
  if (history.state?.s) history.back(); // вернёт на главную через popstate
  else goHome();
}

addEventListener('popstate', e => {
  const st = e.state;
  if (st?.s === 'result' && st.id) openSaved(st.id);
  else if (current?.name !== 'home') {
    if (st?.s) history.replaceState(null, ''); // экран сканирования нельзя «продолжить»
    goHome();
  }
});

// ── Камера ──────────────────────────────────────────────
function openCamera() {
  camera.value = '';
  camera.click();
}
camera.addEventListener('change', () => {
  const file = camera.files && camera.files[0];
  if (file) startScan({ file });
});

// ── Датчик наклона на iOS: спросить по первому нажатию кнопки ──
function askMotion(e) {
  if (!e.target.closest?.('button, label')) return;
  document.removeEventListener('click', askMotion, true);
  const DOE = window.DeviceOrientationEvent;
  if (DOE && typeof DOE.requestPermission === 'function') {
    try { DOE.requestPermission().catch(() => {}); } catch { /* отказ — молча */ }
  }
}
document.addEventListener('click', askMotion, true);

// ── Уведомление ─────────────────────────────────────────
const ICON_INFO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 11v6"/><circle cx="12" cy="7" r=".6" fill="currentColor"/></svg>';
const ICON_X = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
let toastTimer = 0;
export function toast(text, ms = 5200) {
  toastEl.innerHTML = `<span class="toast-icon">${ICON_INFO}</span><span class="toast-text"></span><button class="toast-close" type="button" aria-label="Закрыть уведомление">${ICON_X}</button>`;
  toastEl.querySelector('.toast-text').textContent = text;
  toastEl.querySelector('.toast-close').onclick = hideToast;
  requestAnimationFrame(() => toastEl.classList.add('show'));
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, ms);
}
function hideToast() {
  clearTimeout(toastTimer);
  toastEl.classList.remove('show');
}

// ── Старт ───────────────────────────────────────────────
const st = history.state;
if (st?.s === 'result' && st.id && store.get(st.id)) openSaved(st.id);
else {
  if (st?.s) history.replaceState(null, '');
  goHome();
}

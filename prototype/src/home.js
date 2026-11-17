// Главный экран: заголовок, кнопки, живые кубики внизу, шторка с примерами и «Мои чеки».
import { RECEIPTS } from './data.js';
import { analyze, verdict, pl, dateRu, CUBES, DAILY_G, CUBE_G } from './engine.js';
import { SugarPile } from './pile.js';

const HOME_CUBES = 9;

const I = {
  camera: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.6l1.3-1.9A1.5 1.5 0 0 1 10.6 3.5h2.8a1.5 1.5 0 0 1 1.2.6L15.9 6h1.6A2.5 2.5 0 0 1 20 8.5v8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5z"/><circle cx="12" cy="12.5" r="3.6"/></svg>',
  receipt: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3h12v18l-2.4-1.6L13.2 21 12 20.2 10.8 21l-2.4-1.6L6 21z"/><path d="M9.5 8h5M9.5 12h5M9.5 16h3"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  cube: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="4.5" fill="currentColor"/><g style="fill:var(--blue-3)"><rect x="8" y="8" width="1.6" height="1.6" rx=".5"/><rect x="13.5" y="9.5" width="1.6" height="1.6" rx=".5"/><rect x="10" y="13.6" width="1.6" height="1.6" rx=".5"/><rect x="14.6" y="14.4" width="1.6" height="1.6" rx=".5"/></g></svg>',
};

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const titleOf = id => RECEIPTS.find(r => r.id === id)?.title || '';
const normCubes = DAILY_G / CUBE_G;

export function mountHome(root, { history = [], onScan, onDemo, onOpen }) {
  const hasHistory = history.length > 0;
  root.classList.toggle('has-history', hasHistory);

  root.innerHTML = `
    <div class="home-hero">
      <canvas class="home-canvas" aria-hidden="true"></canvas>
      <div class="home-layer">
        <header class="home-top">
          <div class="logo" aria-label="Чек-ап">${I.cube}<span aria-hidden="true">чек-ап</span></div>
        </header>

        <div class="home-copy">
          <h1 class="home-title display">
            <span class="w">Сколько</span>
            <span class="w"><span class="hl">сахара</span></span>
            <span class="w">в&nbsp;твоём</span>
            <span class="w">чеке?</span>
          </h1>
          <p class="home-sub">Сфоткай чек из магазина. Покажем сахар кубиками и подскажем, что заменить.</p>
          <p class="home-norm">${I.cube}<span>Норма ВОЗ — до <b>${normCubes}</b> ${pl(normCubes, CUBES)} в день</span></p>
        </div>

        <div class="home-actions">
          <button class="btn btn-white btn-xl" type="button" data-act="scan">
            <span class="btn-ico">${I.camera}</span>
            <span>Сканировать чек</span>
          </button>
          <button class="btn btn-glass" type="button" data-act="demo" aria-haspopup="dialog">
            ${I.receipt}<span>Показать на примере</span>
          </button>
        </div>

        <div class="home-stage">
          <p class="home-hint" hidden>Тапни по кубикам или наклони телефон</p>
        </div>
      </div>
    </div>
    ${hasHistory ? historyHtml(history) : ''}
  `;

  const hero = root.querySelector('.home-hero');
  const canvas = root.querySelector('.home-canvas');
  const stage = root.querySelector('.home-stage');
  const hint = root.querySelector('.home-hint');

  // ── Живой фон: кучка кубиков на полу ──
  let pile = null;
  try {
    const floorRadius = hasHistory ? parseFloat(getComputedStyle(root).getPropertyValue('--r-sheet')) || 0 : 0;
    pile = new SugarPile(canvas, { onCount: n => { hint.hidden = !(n > 0); }, floorRadius });
  } catch (err) {
    console.warn('SugarPile не запустился', err);
  }
  let filled = false;
  const relayout = () => {
    const w = hero.clientWidth, h = hero.clientHeight;
    if (!w || !h || !pile) return;
    const floorY = stage.offsetTop + stage.offsetHeight;
    const size = Math.round(Math.min(w, 430) / 7.2);
    pile.layout(w, h, floorY, size);
    if (!filled) { filled = true; pile.add(HOME_CUBES); }
  };
  const ro = new ResizeObserver(relayout);
  ro.observe(hero);
  relayout();

  // ── Кнопки ──
  root.querySelector('[data-act="scan"]').addEventListener('click', () => onScan?.());
  root.querySelector('[data-act="demo"]').addEventListener('click', e => openSheet(e.currentTarget));
  root.querySelectorAll('[data-open]').forEach(b => b.addEventListener('click', () => onOpen?.(b.dataset.open)));

  // ── Шторка с примерами ──
  let sheet = null;
  function openSheet(opener) {
    if (sheet) return;
    sheet = document.createElement('dialog');
    sheet.className = 'sheet on-light';
    sheet.setAttribute('aria-labelledby', 'sheet-title');
    sheet.innerHTML = `
      <div class="sheet-body">
        <div class="sheet-grip" aria-hidden="true"></div>
        <div class="sheet-head">
          <div>
            <p class="eyebrow">Демо-чеки</p>
            <h2 id="sheet-title" class="display">Выбери пример</h2>
          </div>
          <button class="icon-btn" type="button" data-close aria-label="Закрыть">${I.close}</button>
        </div>
        <ul class="demo-list">
          ${RECEIPTS.map((r, i) => demoHtml(r, i)).join('')}
        </ul>
      </div>`;
    document.body.append(sheet);

    let closing = false;
    const close = (after) => {
      if (closing) return;
      closing = true;
      sheet.classList.add('closing');
      const s = sheet;
      const done = () => {
        s.close();
        s.remove();
        if (sheet === s) sheet = null;
        if (after) after();
        else opener?.focus({ preventScroll: true });
      };
      setTimeout(done, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 230);
    };
    sheet._close = close;

    sheet.addEventListener('cancel', e => { e.preventDefault(); close(); });
    sheet.addEventListener('click', e => {
      if (e.target === sheet) return close(); // тап по затемнению
      if (e.target.closest('[data-close]')) return close();
      const pick = e.target.closest('[data-demo]');
      if (pick) {
        const r = RECEIPTS.find(x => x.id === pick.dataset.demo);
        close(() => onDemo?.(r));
      }
    });

    sheet.showModal();
    sheet.querySelector('[data-demo]')?.focus({ preventScroll: true });
  }

  return {
    destroy() {
      ro.disconnect();
      try { pile?.destroy(); } catch { /* ничего */ }
      pile = null;
      if (sheet) { sheet.close(); sheet.remove(); sheet = null; }
    },
  };
}

function demoHtml(r, i) {
  const a = analyze(r);
  const v = verdict(a.score);
  return `
    <li style="--i:${i}">
      <button class="demo" type="button" data-demo="${esc(r.id)}">
        <span class="demo-tile">
          <b>${a.cubes}</b>
          <small>${pl(a.cubes, CUBES)}</small>
        </span>
        <span class="demo-text">
          <span class="demo-title">${esc(r.title)}</span>
          <span class="demo-meta">${esc(r.store)} · ${dateRu(r.date)}</span>
          <span class="score-chip"><i class="dot ${v.tone}"></i><b>${a.score}</b><span>/100 · ${v.label}</span></span>
        </span>
        <span class="demo-go">${I.arrow}</span>
      </button>
    </li>`;
}

function historyHtml(list) {
  return `
    <section class="mine on-light" aria-labelledby="mine-title">
      <div class="mine-head">
        <h2 id="mine-title" class="display">Мои чеки</h2>
        <span class="mine-count">${list.length}</span>
      </div>
      <ul class="mine-list">
        ${list.map(rec => {
          const v = verdict(rec.score);
          const title = titleOf(rec.receiptId);
          return `
          <li>
            <button class="mine-row" type="button" data-open="${esc(rec.id)}">
              <span class="mine-text">
                <span class="mine-store">${esc(rec.store)}</span>
                <span class="mine-meta">${dateRu(rec.date)}${title ? ' · ' + esc(title) : ''}</span>
              </span>
              <span class="mine-cubes"><b>${rec.cubes}</b><small>${pl(rec.cubes, CUBES)}</small></span>
              <span class="mine-score"><i class="dot ${v.tone}"></i><b>${rec.score}</b></span>
              <span class="mine-go">${I.arrow}</span>
            </button>
          </li>`;
        }).join('')}
      </ul>
      <p class="mine-note">Хранится только на этом телефоне</p>
    </section>`;
}

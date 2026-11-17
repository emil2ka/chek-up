// Экран сканирования: «бумажный» чек, бегущая линия сканера, найденные позиции с сахаром.
import { RECEIPTS } from './data.js';
import { analyze, pl, dateRu, CUBES } from './engine.js';

const DURATION = 2600;   // сколько длится сканирование, мс
const DEMO_ID = 'week';  // какой пример показывать, пока распознавание не подключено

/**
 * Распознавание чека по фото. Единственная точка, куда позже подключится настоящее распознавание
 * (запрос на сервер с ключом). Сейчас честно возвращает демо-чек и текст уведомления.
 * @param {File} file фото чека
 * @returns {Promise<{ receipt, notice: string|null }>} receipt в формате data.js
 */
export async function recognize(file) {
  void file;
  return {
    receipt: RECEIPTS.find(r => r.id === DEMO_ID),
    notice: 'Демо-режим: распознавание чеков ещё не подключено, показываю пример',
  };
}

const ICON_X = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/**
 * @param root     пустой экран
 * @param file     фото с камеры (или null)
 * @param receipt  выбранный демо-чек (если нет фото)
 * @param onDone({ receipt, notice })  по окончании сканирования
 * @param onCancel()                   нажат крестик
 */
export function mountScan(root, { file = null, receipt = null, onDone, onCancel }) {
  const photoUrl = file ? URL.createObjectURL(file) : null;
  const lines = Array.from({ length: 14 }, (_, i) => {
    const w = [92, 64, 80, 48, 86, 70, 58, 90, 44, 76, 66, 84, 52, 72][i];
    return `<i style="--w:${w}%;--d:${i * 70}ms"></i>`;
  }).join('');

  root.innerHTML = `
    <div class="scan">
      <header class="scan-top">
        <button class="icon-btn" type="button" data-cancel aria-label="Отменить сканирование">${ICON_X}</button>
        <p class="scan-step eyebrow">Сканирую</p>
        <span class="scan-spacer" aria-hidden="true"></span>
      </header>

      <div class="scan-stage">
        <div class="scan-frame" aria-hidden="true">
          <span class="corner tl"></span><span class="corner tr"></span>
          <span class="corner bl"></span><span class="corner br"></span>
          <div class="paper ${photoUrl ? 'has-photo' : ''}">
            ${photoUrl
              ? `<img class="paper-photo" alt="" src="${photoUrl}">`
              : `<div class="paper-head">
                   <b class="paper-store"></b>
                   <span class="paper-date"></span>
                 </div>
                 <div class="paper-lines">${lines}</div>
                 <div class="paper-total"><i></i><i></i></div>`}
            <div class="beam"><span></span></div>
          </div>
        </div>
      </div>

      <div class="scan-info" aria-live="polite">
        <h1 class="scan-title display">Читаю чек<span class="dots"><i>.</i><i>.</i><i>.</i></span></h1>
        <div class="scan-ticker"><p class="tick is-wait">Ищу сладкие позиции</p></div>
        <p class="scan-count"><b class="scan-num">0</b><span class="scan-unit">${pl(0, CUBES)} сахара найдено</span></p>
      </div>
    </div>
  `;

  const ticker = root.querySelector('.scan-ticker');
  const num = root.querySelector('.scan-num');
  const unit = root.querySelector('.scan-unit');
  root.querySelector('[data-cancel]').addEventListener('click', () => onCancel?.());

  let dead = false;
  const timers = [];
  const later = (fn, ms) => timers.push(setTimeout(() => { if (!dead) fn(); }, ms));
  const t0 = performance.now();

  const fill = r => {
    const head = root.querySelector('.paper-store');
    if (head) {
      head.textContent = r.store;
      root.querySelector('.paper-date').textContent = dateRu(r.date);
    }
  };
  if (receipt) fill(receipt);

  const job = receipt
    ? Promise.resolve({ receipt, notice: null })
    : recognize(file);

  job.then(res => {
    if (dead) return;
    const r = res.receipt;
    fill(r);
    const a = analyze(r);
    const sweet = a.items.filter(it => it.active.s > 0);
    const startAt = Math.max(150, performance.now() - t0);
    const span = DURATION - startAt - 450;
    const step = sweet.length ? span / sweet.length : span;

    sweet.forEach((it, k) => later(() => {
      showTick(it.active.n.replace(/(\d) (?=\S)/g, '$1\u00a0'), `${it.active.s}\u00a0г сахара`);
      const shown = Math.round(a.cubes * (k + 1) / sweet.length);
      num.textContent = shown;
      unit.textContent = `${pl(shown, CUBES)} сахара найдено`;
      num.classList.remove('bump'); void num.offsetWidth; num.classList.add('bump');
    }, startAt + k * step));

    later(() => onDone?.(res), Math.max(DURATION, performance.now() - t0 + 300));
  }).catch(err => {
    console.error('Не удалось прочитать чек', err);
    if (!dead) onCancel?.();
  });

  function showTick(name, grams) {
    const old = ticker.querySelector('.tick:not(.out)');
    if (old) {
      old.classList.add('out');
      setTimeout(() => old.remove(), 260);
    }
    const p = document.createElement('p');
    p.className = 'tick';
    p.innerHTML = `<i class="tick-dot" aria-hidden="true"></i><span>${esc(name)} — <b>${esc(grams)}</b></span>`;
    ticker.append(p);
  }

  return {
    destroy() {
      dead = true;
      timers.forEach(clearTimeout);
      if (photoUrl) setTimeout(() => URL.revokeObjectURL(photoUrl), 400);
    },
  };
}

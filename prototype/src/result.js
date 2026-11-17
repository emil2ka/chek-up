// Экран результата в стиле «Гора сахара».
// Контракт (его менять нельзя, на нём держится оболочка приложения):
//   mountResult(root, { receipt, swaps, onBack, onScan, onChange }) → { destroy() }
//     root      — пустой элемент, в который рисуется экран
//     receipt   — чек из data.js
//     swaps     — массив индексов уже применённых замен
//     onBack()  — нажата «назад»
//     onScan()  — нажата «Сканировать новый чек»
//     onChange({ swaps, analysis }) — вызывается сразу после монтирования и после каждого переключения замены
//
// Устройство: расчёты — result-model.js (без DOM), куча — result-pile.js (без разметки),
// здесь только разметка и обработчики.
import { resultModel, swapRows, capOf, NOTE } from './result-model.js';
import { attachPile } from './result-pile.js';
import './result.css';

const svg = (d, cls = '') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
export const ICONS = {
  back: '<path d="M15 5l-7 7 7 7"/>',
  share: '<path d="M12 3.5v11"/><path d="M7.5 8L12 3.5 16.5 8"/><path d="M6 12.5v5.5a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-5.5"/>',
  check: '<path d="M6 12.5l4 4 8-9"/>',
  camera: '<path d="M4 8.5h3.2l1.8-2.6h6l1.8 2.6H20v10.5H4z"/><circle cx="12" cy="13.6" r="3.4"/>',
  cal: '<rect x="4" y="5.5" width="16" height="14.5" rx="3"/><path d="M4 10.5h16M9 3.5v4M15 3.5v4"/>',
  arrow: '<path d="M5 12h13M13 7l5 5-5 5"/>',
};
const I = Object.fromEntries(Object.entries(ICONS).map(([k, d]) => [k, svg(d, k === 'arrow' ? 'rs-arr' : '')]));
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ——— разметка ———

const shellHTML = rows => `
  <div class="rs">
    <section class="rs-hero">
      <header class="rs-bar">
        <button class="rs-ic" type="button" data-act="back" aria-label="Назад">${I.back}</button>
        <div class="rs-pill" role="status"><i class="rs-dot"></i><span class="rs-pill-t"></span></div>
        <button class="rs-ic" type="button" data-act="share" aria-label="Поделиться результатом">${I.share}</button>
      </header>
      <div class="rs-head">
        <p class="rs-kick">В твоём чеке</p>
        <b class="rs-num" aria-hidden="true">0</b>
        <p class="rs-cap" aria-hidden="true">${capOf(0)}</p>
        <p class="rs-sr rs-total"></p>
      </div>
      <canvas class="rs-pile" aria-label="Куча кубиков сахара. Нажми, чтобы подбросить" role="img"></canvas>
    </section>

    <main class="rs-sheet">
      <section class="rs-sec rs-swaps" aria-labelledby="rs-h-sw">
        <h2 id="rs-h-sw" class="rs-h">Замени — и кубики исчезнут</h2>
        ${rows.length ? `<ul class="rs-sw-list">${rows.map(swapRowHTML).join('')}</ul>`
          : `<p class="rs-empty">Заменять нечего — в этом чеке нет сладких позиций с понятной заменой.</p>`}
        <p class="rs-sum" aria-live="polite" hidden></p>
      </section>

      <section class="rs-sec" aria-labelledby="rs-h-src">
        <h2 id="rs-h-src" class="rs-h">Откуда сахар</h2>
        <ul class="rs-src"></ul>
      </section>

      <section class="rs-sec rs-junk" aria-labelledby="rs-h-junk">
        <h2 id="rs-h-junk" class="rs-h">На вредное</h2>
        <div class="rs-junk-top"><b class="rs-junk-sum"></b><span class="rs-junk-share"></span></div>
        <div class="rs-meter" aria-hidden="true"><i></i></div>
        <p class="rs-junk-of"></p>
        <p class="rs-days">${I.cal}<span></span></p>
      </section>

      <div class="rs-actions">
        <button class="rs-btn rs-btn-main" type="button" data-act="scan">${I.camera}<span>Сканировать новый чек</span></button>
        <button class="rs-btn rs-btn-alt" type="button" data-act="share">${I.share}<span>Поделиться</span></button>
      </div>
      <p class="rs-note">${NOTE}</p>
    </main>
    <div class="rs-toast" role="status" aria-live="polite"></div>
  </div>`;

const swapRowHTML = r => `<li><button class="rs-sw" type="button" data-i="${r.i}" aria-pressed="false">
    <span class="rs-chk">${I.check}</span>
    <span class="rs-sw-t"><span class="rs-sw-from">${esc(r.from)}</span><span class="rs-sw-to">${I.arrow}${esc(r.to)}</span></span>
    <span class="rs-sw-d"><b>${r.cubes}</b><small>${r.price}</small></span>
  </button></li>`;

const sourceHTML = s => `<li class="rs-src-i${s.off ? ' is-off' : ''}">
    <div class="rs-src-t"><span class="rs-src-n">${esc(s.name)}</span>
      <span class="rs-src-v"><b>${s.grams}</b>${s.cubes}</span></div>
    <div class="rs-src-bar" aria-hidden="true"><i style="width:${s.width}%;--n:${s.cells}"></i></div>
    ${s.off ? `<p class="rs-src-sw">${I.arrow}<span>${esc(s.swapTo)}</span></p>` : ''}
  </li>`;

const summaryHTML = m => `${I.check}<span>С заменами: <b>${m.points}</b>, ${m.label}${m.money ? ` <b>${m.money}</b>` : ''}</span>`;

// ——— монтирование ———

export function mountResult(root, { receipt, swaps = [], onBack, onScan, onChange } = {}) {
  const on = new Set(swaps);
  let model = resultModel(receipt, on);
  root.innerHTML = shellHTML(swapRows(receipt));

  const $ = s => root.querySelector(s);
  const num = $('.rs-num'), cap = $('.rs-cap'), src = $('.rs-src'), sum = $('.rs-sum');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // счётчик идёт вместе с кубиками
  let shown = 0;
  const onCount = n => {
    if (n === shown) return;
    shown = n;
    num.textContent = n;
    cap.textContent = capOf(n);
    num.classList.toggle('is-3', n >= 100);
    if (!reduced && num.animate) num.animate([{ transform: 'scale(1.045)' }, { transform: 'scale(1)' }], { duration: 160, easing: 'ease-out' });
  };

  const pile = attachPile({
    hero: $('.rs-hero'), head: $('.rs-head'), sheet: $('.rs-sheet'), canvas: $('.rs-pile'),
    maxCubes: model.maxCubes, onCount,
  });
  pile.set(model.analysis.cubes);

  let srcTimer = 0;
  function render() {
    const m = model;
    $('.rs-pill').dataset.tone = m.tone;
    $('.rs-pill-t').textContent = m.pill;
    $('.rs-total').textContent = m.srLabel;
    root.querySelectorAll('.rs-sw').forEach(b => b.setAttribute('aria-pressed', String(on.has(+b.dataset.i))));
    sum.hidden = !m.summary;
    if (m.summary) sum.innerHTML = summaryHTML(m.summary);

    src.innerHTML = m.sources.map(sourceHTML).join('') || '<li class="rs-empty">Добавленного сахара в чеке нет.</li>';
    // полосы вырастают только при первом показе
    if (!srcTimer) srcTimer = setTimeout(() => src.classList.add('is-ready'), 800);

    const j = m.junk;
    $('.rs-junk-sum').textContent = j.sum;
    $('.rs-junk-share').textContent = j.share;
    $('.rs-junk-share').dataset.tone = j.tone;
    $('.rs-meter i').style.width = `${j.width}%`;
    $('.rs-junk-of').textContent = j.of;
    $('.rs-days span').textContent = j.days;
  }

  const emit = () => onChange?.({ swaps: model.swaps, analysis: model.analysis });

  function toggle(i) {
    if (on.has(i)) on.delete(i); else on.add(i);
    model = resultModel(receipt, on);
    pile.set(model.analysis.cubes);
    render();
    if (navigator.userActivation?.isActive !== false) navigator.vibrate?.(8);
    emit();
  }

  // ——— поделиться ———
  const toast = $('.rs-toast');
  let toastT = 0;
  const say = t => {
    toast.textContent = t;
    toast.classList.add('is-on');
    clearTimeout(toastT);
    toastT = setTimeout(() => toast.classList.remove('is-on'), 2200);
  };
  async function share() {
    const text = model.shareText;
    if (navigator.share) {
      try { await navigator.share({ title: 'Чек-ап', text }); return; }
      catch (e) { if (e?.name === 'AbortError') return; }
    }
    try { await navigator.clipboard.writeText(text); say('Текст скопирован — вставь его в чат'); }
    catch { say('Не получилось скопировать'); }
  }

  const onClick = e => {
    const b = e.target.closest('button');
    if (!b || !root.contains(b)) return;
    if (b.classList.contains('rs-sw')) return toggle(+b.dataset.i);
    const act = b.dataset.act;
    if (act === 'back') onBack?.();
    else if (act === 'scan') onScan?.();
    else if (act === 'share') share();
  };
  root.addEventListener('click', onClick);

  render();
  emit();

  return {
    destroy() {
      root.removeEventListener('click', onClick);
      clearTimeout(toastT);
      clearTimeout(srcTimer);
      pile.destroy();
      root.innerHTML = '';
    },
  };
}

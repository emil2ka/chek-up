// Страница для разработки экрана результата: /dev-result.html?r=week|party|fit
import '@fontsource-variable/unbounded';
import '@fontsource-variable/manrope';
import './tokens.css';
import { RECEIPTS } from './data.js';
import { mountResult } from './result.js';

const id = new URLSearchParams(location.search).get('r') || 'week';
const receipt = RECEIPTS.find(r => r.id === id) || RECEIPTS[0];
const root = document.getElementById('app');

const screen = mountResult(root, {
  receipt,
  swaps: [],
  onBack: () => console.info('[dev] назад'),
  onScan: () => console.info('[dev] сканировать новый чек'),
  onChange: ({ swaps, analysis }) => {
    window.__result = { swaps, analysis };
    console.info('[dev] onChange', swaps, analysis.cubes, analysis.score);
  },
});
window.__screen = screen;

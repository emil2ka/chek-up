// Полнота казахского перевода: каждая строка из t('…') и каждая строка данных, которая показывается через t().
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { afterEach, describe, expect, it } from 'vitest';
import { dayTxt, DOW_SHORT, monthTxt, MONTHS } from './calendar';
import { CATALOG, CATS } from './catalog';
import { METRIC_IDS, METRICS, PILE_HINTS, UNITS_NOTE, capOf, pl, CUBES, verdict } from './engine';
import { setLang, t } from './i18n';
import { badges } from './insights';
import { KK } from './kk';
import { SCAN_ERRORS } from './scan/errors';

const root = join(__dirname, '..');
const files = (dir: string): string[] => readdirSync(dir).flatMap(f => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(f) && !/\.test\.ts$/.test(f) ? [p] : [];
});
const client = files(root).filter(p => !p.includes('/server/') && !p.includes('/app/'));
const server = files(root).filter(p => p.includes('/server/') || p.includes('/app/api/') || p.endsWith('/sync.ts'));
const parse = (p: string) => ts.createSourceFile(p, readFileSync(p, 'utf8'), ts.ScriptTarget.Latest, true, p.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);

/** Строки из t('…'), t(a ? '…' : '…') и типов Forms. */
function used(): Set<string> {
  const out = new Set<string>();
  for (const p of client) {
    const lit = (a: ts.Node) => { if (ts.isStringLiteralLike(a)) out.add(a.text); else if (ts.isConditionalExpression(a)) { lit(a.whenTrue); lit(a.whenFalse); } };
    const visit = (n: ts.Node) => {
      if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 't' && n.arguments[0]) lit(n.arguments[0]);
      if (ts.isVariableDeclaration(n) && n.type?.getText() === 'Forms' && n.initializer && ts.isArrayLiteralExpression(n.initializer)) n.initializer.elements.forEach(lit);
      ts.forEachChild(n, visit);
    };
    visit(parse(p));
  }
  return out;
}

/** Данные, которые идут через t(переменная). */
function data(): string[] {
  return [
    ...METRIC_IDS.flatMap(m => [METRICS[m].label, METRICS[m].short, METRICS[m].of, METRICS[m].unit, METRICS[m].norm, PILE_HINTS[m], capOf(2, m)]),
    UNITS_NOTE, ...DOW_SHORT, ...MONTHS, ...Array.from({ length: 12 }, (_, i) => dayTxt(`2026-${String(i + 1).padStart(2, '0')}-01`).slice(2)),
    ...CATS.map(c => c.label), ...CATALOG.flatMap(c => [c.name, c.portion, ...(c.swap ? [c.swap] : [])]),
    ...badges([], { adults: 1, kids: 0 }, [], 0).flatMap(b => [b.title, b.desc]),
    ...Object.values(SCAN_ERRORS).map(e => e.message),
    'Ищу сладкое, солёное и жирное', 'Разбираю сокращения кассы', 'Сверяю со справочником', 'Считаю сахар, соль и жиры', 'Ещё немного',
    'сначала самые сладкие', 'сначала самые солёные', 'сначала самые жирные', 'сначала самые калорийные', 'сначала больше углеводов', 'сначала больше белка',
    'Чек', 'Неделя', 'Продукты', 'Профиль',
  ];
}

/** Тексты ошибок, которые сервер присылает человеку. */
function serverTexts(): string[] {
  const out: string[] = [];
  for (const p of server) {
    const visit = (n: ts.Node) => {
      if ((ts.isCallExpression(n) || ts.isNewExpression(n)) && ['fail', 'AuthError', 'SyncError'].includes(n.expression.getText())) {
        for (const a of n.arguments ?? []) if (ts.isStringLiteralLike(a) && /^[А-ЯЁ]/.test(a.text)) out.push(a.text);
      }
      ts.forEachChild(n, visit);
    };
    visit(parse(p));
  }
  return out;
}

const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort().join();
afterEach(() => setLang('ru'));

describe('казахский перевод', () => {
  it('есть у всех строк интерфейса', () => { expect([...used()].filter(k => !(k in KK))).toEqual([]); });
  it('есть у данных', () => { expect([...new Set(data())].filter(k => !(k in KK))).toEqual([]); });
  it('есть у ошибок сервера', () => { const list = serverTexts(); expect(list.length).toBeGreaterThan(10); expect([...new Set(list)].filter(k => !(k in KK))).toEqual([]); });
  it('подстановки совпадают, пустых нет', () => {
    for (const [ru, kk] of Object.entries(KK)) { expect(kk.trim(), ru).not.toBe(''); expect(vars(kk), ru).toBe(vars(ru)); }
  });
  it('язык переключается', () => {
    expect(pl(21, CUBES)).toBe('кубик');
    setLang('kk');
    expect(pl(21, CUBES)).toBe('текше');
    expect(capOf(5, 'sugar')).toBe('қант текшесі');
    expect(verdict(90).label).toBe('Тамаша');
    expect(dayTxt('2026-11-16')).toBe('16 қараша');
    expect(monthTxt('2026-11')).toBe('2026 ж. қараша');
    expect(t('{n}% нормы', { n: 40 })).toBe('норманың 40%-ы');
    expect(t('нет такой строки')).toBe('нет такой строки');
  });
});

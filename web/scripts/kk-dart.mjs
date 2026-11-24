// Словарь мобильного приложения из общего web/src/lib/kk.ts: node web/scripts/kk-dart.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const at = p => fileURLToPath(new URL(p, import.meta.url));
const js = ts.transpileModule(readFileSync(at('../src/lib/kk.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { KK } = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
const q = s => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\$/g, '\\$').replace(/\n/g, '\\n')}'`;
writeFileSync(at('../../mobile/lib/core/kk.dart'),
  '// Собрано из web/src/lib/kk.ts скриптом web/scripts/kk-dart.mjs. Руками не править.\nconst kk = <String, String>{\n' +
  Object.entries(KK).map(([k, v]) => `  ${q(k)}: ${q(v)},\n`).join('') + '};\n');
console.log(Object.keys(KK).length, 'строк');

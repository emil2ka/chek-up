// Что изменилось на этом устройстве и ещё не подтверждено сервером: ключ → время правки.
// h:<id> — чек, w:<неделя> — отметка недели, p — личный профиль, f — настройки семьи.
const KEY = 'chekup.dirty';
let mem: Record<string, number> | null = null;

function load(): Record<string, number> {
  if (mem) return mem;
  try {
    const o: unknown = JSON.parse(localStorage.getItem(KEY) || '{}');
    mem = o && typeof o === 'object' ? Object.fromEntries(Object.entries(o).filter((e): e is [string, number] => typeof e[1] === 'number')) : {};
  } catch { mem = {}; }
  return mem;
}
function save(): void { try { localStorage.setItem(KEY, JSON.stringify(mem ?? {})); } catch { /* приватный режим: доживёт до перезагрузки в памяти */ } }

export const dirty = {
  all: (): Record<string, number> => ({ ...load() }),
  at: (key: string): number | undefined => load()[key],
  mark(key: string, at: number): void { load()[key] = at; save(); },
  /** Подтверждено сервером: снимаем отметку, только если с тех пор ничего не поменяли. */
  ack(sent: Record<string, number>): void {
    const d = load();
    for (const [k, at] of Object.entries(sent)) if (d[k] === at) delete d[k];
    save();
  },
  clear(): void { mem = {}; save(); },
  any: (): boolean => Object.keys(load()).length > 0,
};
if (typeof addEventListener === 'function') addEventListener('storage', e => { if (e.key === KEY) mem = null; });

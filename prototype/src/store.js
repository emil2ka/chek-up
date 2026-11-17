// История чеков в localStorage.
// Запись: { id, receiptId, store, date, cubes, score, swaps, savedAt }
// Не больше 20 записей, новые и только что обновлённые — сверху.
const KEY = 'chekup.history';
const LIMIT = 20;

function read() {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(list) ? list.filter(r => r && r.id && r.receiptId) : [];
  } catch {
    return [];
  }
}

function write(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, LIMIT)));
  } catch {
    /* приватный режим или переполнение — история просто не сохранится */
  }
}

export const history = {
  all: () => read(),

  get: id => read().find(r => r.id === id) || null,

  /** Запись для того же чека (повторное открытие обновляет её, а не плодит новую). */
  findByReceipt: receiptId => read().find(r => r.receiptId === receiptId) || null,

  newId: () => 'h' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),

  /** Сохранить или обновить запись; она поднимается наверх списка. */
  save(entry) {
    const rec = {
      id: entry.id,
      receiptId: entry.receiptId,
      store: entry.store,
      date: entry.date,
      cubes: entry.cubes,
      score: entry.score,
      swaps: [...(entry.swaps || [])],
      savedAt: Date.now(),
    };
    write([rec, ...read().filter(r => r.id !== rec.id)]);
    return rec;
  },

  remove(id) {
    write(read().filter(r => r.id !== id));
  },
};

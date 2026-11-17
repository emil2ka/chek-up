// Общие типы «Чек-апа». Файл — контракт между частями приложения.

/** Замена товара в том же магазине. */
export type SwapItem = {
  /** название */
  n: string;
  /** цена позиции, ₸ */
  p: number;
  /** добавленный сахар на всю позицию, г */
  s: number;
};

/** Позиция чека. */
export type ReceiptItem = SwapItem & {
  /** вредный товар */
  junk?: 0 | 1;
  /** чем заменить */
  swap?: SwapItem;
};

/** Чек. */
export type Receipt = {
  id: string;
  title: string;
  store: string;
  /** дата в формате YYYY-MM-DD */
  date: string;
  items: ReceiptItem[];
  /**
   * true — чек распознан по фото, сахар и замены оценены приблизительно
   * (экран результата показывает честную пометку). У демо-чеков поля нет.
   */
  approx?: boolean;
};

/** Позиция после расчёта: active — то, что реально лежит в корзине. */
export type AnalyzedItem = ReceiptItem & {
  i: number;
  swapped: boolean;
  active: SwapItem & { junk?: 0 | 1 };
};

/** Результат analyze(). */
export type Analysis = {
  items: AnalyzedItem[];
  /** сумма чека, ₸ */
  total: number;
  /** добавленный сахар, г */
  sugar: number;
  /** кубиков сахара (1 кубик = 5 г) */
  cubes: number;
  /** сумма вредных товаров, ₸ */
  junk: number;
  junkCount: number;
  /** доля вредного в сумме чека, 0..1 */
  share: number;
  /** оценка корзины, 0..100 */
  score: number;
  /** сколько дневных норм сахара */
  days: number;
};

export type Tone = 'good' | 'mid' | 'bad';
export type Verdict = { label: string; tone: Tone };

/** Пропсы экрана результата (src/components/result/Result.tsx). */
export type ResultProps = {
  receipt: Receipt;
  /** индексы уже применённых замен */
  swaps: number[];
  /** нажата «назад» */
  onBack(): void;
  /** нажата «Сканировать новый чек» */
  onScan(): void;
  /** сразу после монтирования и после каждого переключения замены */
  onChange(e: { swaps: number[]; analysis: Analysis }): void;
};

/** Запись истории в localStorage['chekup.history']. */
export type HistoryEntry = {
  id: string;
  receiptId: string;
  store: string;
  date: string;
  cubes: number;
  score: number;
  swaps: number[];
  savedAt: number;
  /** сам чек — для распознанных по фото (их нет в data.ts); у демо-чеков поля нет */
  receipt?: Receipt;
};

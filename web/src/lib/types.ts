// Общие типы «Чек-апа». Файл — контракт между частями приложения.

/** Показатели, которые считает «Чек-ап». */
export type MetricId = 'sugar' | 'salt' | 'fat' | 'kcal' | 'carbs' | 'protein';

/** Замена товара в том же магазине. Показатели — на всю позицию (с учётом количества). */
export type SwapItem = {
  /** название */
  n: string;
  /** цена позиции, ₸ */
  p: number;
  /** добавленный сахар, г */
  s: number;
  /** соль, г (у старых чеков поля нет — считаем 0) */
  t?: number;
  /** насыщенные жиры, г */
  f?: number;
  /** калории, ккал */
  k?: number;
  /** углеводы (все, вместе с сахаром), г */
  c?: number;
  /** белки, г */
  b?: number;
};

/** Позиция чека. */
export type ReceiptItem = SwapItem & {
  /** вредный товар */
  junk?: 0 | 1;
  /** чем заменить */
  swap?: SwapItem;
  /** алкоголь или энергетик: считаются отдельной строкой */
  x?: 'alcohol' | 'energy';
  /** не еда (порошок, пакет): в деньги входит, в оценку и показатели — нет */
  nf?: 1;
  /** на сколько недель хватает (сахар, масло, крупа): показатели растягиваются на это время; нет поля — съедят сразу */
  w?: number;
  /** строка сомнительная: стоит проверить */
  q?: 1;
  /** откуда показатели: справочник, модель, человек; нет поля — неизвестно (старые чеки) */
  src?: 'ref' | 'ai' | 'user';
  /** как было напечатано на чеке, если человек исправил название: по нему запоминаем исправление */
  raw?: string;
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
  /** возврат: в итогах недели вычитается */
  refund?: boolean;
  /** фискальный ключ из QR («РНМ:признак») — по нему ловим дубли */
  fiscal?: string;
  /** время покупки HH:MM, если известно */
  time?: string;
  /** сумма, напечатанная на чеке, ₸ */
  sum?: number;
  /** откуда чек */
  via?: 'photo' | 'qr' | 'manual';
  /** цены и алкоголь скрыты (так чужие чеки видит ребёнок) */
  masked?: boolean;
};

/** Причина, почему оценка ниже 100. */
export type Why = { k: 'sugar' | 'fat' | 'salt' | 'junk' | 'flagged'; pts: number; value: number };

/** Позиция после расчёта: active — то, что реально лежит в корзине. */
export type AnalyzedItem = ReceiptItem & {
  i: number;
  swapped: boolean;
  /** «не для нас»: в расчёты не входит */
  off: boolean;
  active: SwapItem & { junk?: 0 | 1; x?: 'alcohol' | 'energy' };
};

/** Результат analyze(). */
export type Analysis = {
  items: AnalyzedItem[];
  /** сумма учтённых позиций, ₸ (без «не для нас») */
  total: number;
  /** из них еда и напитки, ₸ */
  food: number;
  /** сколько позиций не учтено */
  offCount: number;
  /** добавленный сахар, г */
  sugar: number;
  /** кубиков сахара (1 кубик = 5 г) */
  cubes: number;
  /** всего по каждому показателю: сахар, соль, жиры — г, калории — ккал */
  totals: Record<MetricId, number>;
  /** кубиков по каждому показателю (размер кубика у каждого свой, см. engine.ts) */
  cubesBy: Record<MetricId, number>;
  /** алкоголь и энергетики: сколько позиций и на какую сумму, ₸ */
  flagged: { count: number; sum: number; alcohol: number; energy: number };
  /** сумма вредных товаров, ₸ */
  junk: number;
  junkCount: number;
  /** доля вредного в сумме еды, 0..1 */
  share: number;
  /** оценка корзины, 0..100; не зависит от размера корзины */
  score: number;
  /** из чего сложились потери оценки, по убыванию */
  why: Why[];
  /** сколько дневных норм сахара */
  days: number;
};

export type Tone = 'good' | 'mid' | 'bad';
export type Verdict = { label: string; tone: Tone };

/** Пропсы экрана результата (src/components/result/Result.tsx). */
export type ResultProps = {
  receipt: Receipt;
  /** план: какие замены взять в следующий раз */
  swaps: number[];
  /** позиции «не для нас» */
  off?: number[];
  tag?: 'guests';
  priv?: boolean;
  /** готовая оценка — для чеков, где цены скрыты и посчитать её здесь нельзя */
  score?: number;
  /** вид кубика сахара по стрику: 0, 4, 12, 26, 52 */
  level?: number;
  /** кто внёс, если не я */
  author?: string;
  /** демо-чек: в учёт не идёт */
  demo?: boolean;
  /** нажата «назад» */
  onBack(): void;
  /** нажата «Внести ещё чек» */
  onScan(): void;
  /** переключили замену в плане */
  onSwaps(swaps: number[]): void;
  /** как учитывать чек; нет — менять нельзя */
  onFlags?(f: { tag?: 'guests' | null; priv?: boolean }): void;
  /** нажата «Изменить чек»; нет — менять нельзя */
  onEdit?(): void;
};

/** Запись истории в localStorage['chekup.history']. */
export type HistoryEntry = {
  id: string;
  receiptId: string;
  store: string;
  date: string;
  cubes: number;
  score: number;
  /** план: какие замены человек хочет сделать в следующий раз (в факт и экономию не входит) */
  swaps: number[];
  /** позиции «не для нас» */
  off?: number[];
  /** «гости»: деньги считаем, показатели — нет */
  tag?: 'guests';
  /** личный чек: виден только автору */
  priv?: boolean;
  /** кто внёс (id участника семьи); нет поля — я */
  by?: string;
  savedAt: number;
  /** сам чек — для распознанных по фото (их нет в data.ts); у демо-чеков поля нет */
  receipt?: Receipt;
};

// Справочник «Сколько сахара в…»: типичные продукты и порция, как их покупают или едят.
// g — добавленный (свободный) сахар в порции, граммы. Значения усреднённые, по типичным товарам;
// согласованы с опорным справочником распознавания (src/lib/scan/reference.ts).
export type Cat = 'drinks' | 'dairy' | 'sweets' | 'bakery' | 'other';

export type CatalogItem = {
  id: string;
  name: string;
  /** порция словами */
  portion: string;
  g: number;
  cat: Cat;
  /** чем заменить */
  swap?: string;
};

export const CATS: { id: Cat | 'all'; label: string }[] = [
  { id: 'all', label: 'Всё' },
  { id: 'drinks', label: 'Напитки' },
  { id: 'dairy', label: 'Молочное' },
  { id: 'sweets', label: 'Сладости' },
  { id: 'bakery', label: 'Выпечка' },
  { id: 'other', label: 'Остальное' },
];

export const CATALOG: CatalogItem[] = [
  // ── напитки ──
  { id: 'cola-1', name: 'Кола', portion: 'бутылка 1 л', g: 106, cat: 'drinks', swap: 'Минералка с лимоном' },
  { id: 'juice-1', name: 'Сок яблочный', portion: 'пакет 1 л', g: 100, cat: 'drinks', swap: 'Целые яблоки и вода' },
  { id: 'cola-05', name: 'Кола', portion: 'бутылка 0,5 л', g: 53, cat: 'drinks', swap: 'Минералка с лимоном' },
  { id: 'energy', name: 'Энергетик', portion: 'банка 0,45 л', g: 50, cat: 'drinks', swap: 'Чёрный чай или вода' },
  { id: 'ice-tea', name: 'Холодный чай', portion: 'бутылка 0,5 л', g: 38, cat: 'drinks', swap: 'Зелёный чай без сахара' },
  { id: 'milkshake', name: 'Молочный коктейль', portion: 'бутылка 0,3 л', g: 27, cat: 'drinks', swap: 'Молоко 2,5%' },
  { id: 'kvass', name: 'Квас', portion: 'стакан 0,5 л', g: 25, cat: 'drinks', swap: 'Айран или тан' },
  { id: 'juice-02', name: 'Сок детский', portion: 'пакетик 0,2 л', g: 20, cat: 'drinks', swap: 'Фруктовое пюре без сахара' },
  { id: 'tea-sugar', name: 'Чай с сахаром', portion: 'кружка, 2 ложки сахара', g: 10, cat: 'drinks', swap: 'Чай с лимоном без сахара' },
  { id: 'coffee-3in1', name: 'Кофе 3 в 1', portion: 'пакетик', g: 10, cat: 'drinks', swap: 'Кофе с молоком без сахара' },
  { id: 'ayran', name: 'Айран', portion: 'бутылка 0,5 л', g: 0, cat: 'drinks' },
  { id: 'water', name: 'Вода и минералка', portion: 'любой объём', g: 0, cat: 'drinks' },

  // ── молочное ──
  { id: 'yogurt-drink', name: 'Йогурт питьевой', portion: 'бутылка 270 г', g: 30, cat: 'dairy', swap: 'Кефир 1%' },
  { id: 'ice-cream', name: 'Мороженое пломбир', portion: 'стаканчик 80 г', g: 17, cat: 'dairy', swap: 'Замороженные ягоды' },
  { id: 'curd-mass', name: 'Творожная масса с изюмом', portion: '100 г', g: 16, cat: 'dairy', swap: 'Творог 5% с ягодами' },
  { id: 'yogurt-fruit', name: 'Йогурт фруктовый', portion: 'стаканчик 115 г', g: 13, cat: 'dairy', swap: 'Натуральный йогурт с фруктами' },
  { id: 'glazed-curd', name: 'Сырок глазированный', portion: '1 штука, 45 г', g: 12, cat: 'dairy', swap: 'Творог 5%' },
  { id: 'condensed', name: 'Сгущёнка', portion: 'столовая ложка', g: 11, cat: 'dairy' },
  { id: 'kefir', name: 'Кефир и натуральный йогурт', portion: 'стакан', g: 0, cat: 'dairy' },

  // ── сладости ──
  { id: 'candy', name: 'Конфеты шоколадные', portion: '100 г, около 8 штук', g: 60, cat: 'sweets', swap: 'Орехи и сухофрукты' },
  { id: 'marmalade', name: 'Мармелад', portion: '100 г', g: 60, cat: 'sweets', swap: 'Сухофрукты' },
  { id: 'chocolate', name: 'Шоколад молочный', portion: 'плитка 100 г', g: 50, cat: 'sweets', swap: 'Горький шоколад 85%' },
  { id: 'chak-chak', name: 'Чак-чак', portion: '100 г', g: 40, cat: 'sweets', swap: 'Орехи с изюмом' },
  { id: 'halva', name: 'Халва', portion: '100 г', g: 40, cat: 'sweets' },
  { id: 'bar', name: 'Шоколадный батончик', portion: '1 штука, 50 г', g: 25, cat: 'sweets', swap: 'Банан и горсть орехов' },
  { id: 'zefir', name: 'Зефир', portion: '1 штука, 35 г', g: 21, cat: 'sweets' },
  { id: 'dark-choc', name: 'Горький шоколад 85%', portion: 'плитка 100 г', g: 14, cat: 'sweets' },
  { id: 'honey', name: 'Мёд', portion: 'столовая ложка', g: 17, cat: 'sweets' },
  { id: 'jam', name: 'Варенье', portion: 'столовая ложка', g: 11, cat: 'sweets' },
  { id: 'choc-paste', name: 'Шоколадная паста', portion: 'столовая ложка', g: 8, cat: 'sweets', swap: 'Арахисовая паста без сахара' },

  // ── выпечка ──
  { id: 'cake', name: 'Торт бисквитный', portion: 'кусок 120 г', g: 36, cat: 'bakery', swap: 'Фруктовая тарелка' },
  { id: 'gingerbread', name: 'Пряники', portion: '100 г', g: 35, cat: 'bakery' },
  { id: 'wafers', name: 'Вафли', portion: '100 г', g: 30, cat: 'bakery', swap: 'Цельнозерновые хлебцы' },
  { id: 'cookies', name: 'Печенье', portion: '100 г', g: 24, cat: 'bakery', swap: 'Цельнозерновые хлебцы' },
  { id: 'donut', name: 'Пончик в глазури', portion: '1 штука', g: 14, cat: 'bakery' },
  { id: 'bun', name: 'Булочка сладкая', portion: '1 штука, 100 г', g: 12, cat: 'bakery', swap: 'Ржаной хлеб с сыром' },
  { id: 'cereal', name: 'Шоколадные хлопья', portion: 'порция 40 г', g: 12, cat: 'bakery', swap: 'Овсянка с бананом' },
  { id: 'granola', name: 'Гранола', portion: 'порция 50 г', g: 11, cat: 'bakery', swap: 'Овсяные хлопья и орехи' },
  { id: 'baursak', name: 'Баурсаки', portion: '100 г', g: 6, cat: 'bakery' },
  { id: 'bread', name: 'Хлеб', portion: '2 куска', g: 2, cat: 'bakery' },

  // ── остальное ──
  { id: 'ketchup', name: 'Кетчуп', portion: 'столовая ложка', g: 4, cat: 'other', swap: 'Томатная паста со специями' },
  { id: 'chips', name: 'Чипсы', portion: 'пачка 150 г', g: 2, cat: 'other' },
  { id: 'sausage', name: 'Колбаса варёная', portion: '100 г', g: 1, cat: 'other' },
  { id: 'fruit', name: 'Фрукты и овощи целиком', portion: 'сколько угодно', g: 0, cat: 'other' },
];

const norm = (s: string) => s.toLowerCase().replaceAll('ё', 'е').trim();

/** Поиск по названию и замене; пустой запрос — весь раздел. Сначала самое сладкое. */
export function searchCatalog(query: string, cat: Cat | 'all'): CatalogItem[] {
  const q = norm(query);
  return CATALOG
    .filter(it => (cat === 'all' || it.cat === cat) && (!q || norm(it.name).includes(q) || norm(it.portion).includes(q)))
    .sort((a, b) => b.g - a.g);
}

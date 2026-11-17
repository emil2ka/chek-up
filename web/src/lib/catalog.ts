// Справочник «Сколько в продуктах»: типичные продукты и порция, как их покупают или едят.
// g — добавленный (свободный) сахар в порции, г; t — соль, г; f — насыщенные жиры, г; k — калории, ккал.
// Значения усреднённые, по типичным товарам; согласованы с опорным справочником распознавания (src/lib/scan/reference.ts).
import { METRICS } from './engine';
import type { MetricId } from './types';

export type Cat = 'drinks' | 'dairy' | 'sweets' | 'bakery' | 'salty' | 'other';

export type CatalogItem = {
  id: string;
  name: string;
  /** порция словами */
  portion: string;
  /** добавленный сахар, г */
  g: number;
  /** соль, г */
  t: number;
  /** насыщенные жиры, г */
  f: number;
  /** калории, ккал */
  k: number;
  cat: Cat;
  /** алкоголь — не считается «сахаром», но считается калориями и тратами */
  x?: 'alcohol' | 'energy';
  /** чем заменить */
  swap?: string;
};

export const CATS: { id: Cat | 'all'; label: string }[] = [
  { id: 'all', label: 'Всё' },
  { id: 'drinks', label: 'Напитки' },
  { id: 'dairy', label: 'Молочное' },
  { id: 'sweets', label: 'Сладости' },
  { id: 'bakery', label: 'Выпечка' },
  { id: 'salty', label: 'Солёное' },
  { id: 'other', label: 'Остальное' },
];

export const CATALOG: CatalogItem[] = [
  // ── напитки ──
  { id: 'cola-1', name: 'Кола', portion: 'бутылка 1 л', g: 106, t: 0.1, f: 0, k: 420, cat: 'drinks', swap: 'Минералка с лимоном' },
  { id: 'juice-1', name: 'Сок яблочный', portion: 'пакет 1 л', g: 100, t: 0, f: 0, k: 460, cat: 'drinks', swap: 'Целые яблоки и вода' },
  { id: 'cola-05', name: 'Кола', portion: 'бутылка 0,5 л', g: 53, t: 0.05, f: 0, k: 210, cat: 'drinks', swap: 'Минералка с лимоном' },
  { id: 'energy', name: 'Энергетик', portion: 'банка 0,45 л', g: 50, t: 0.1, f: 0, k: 205, cat: 'drinks', x: 'energy', swap: 'Чёрный чай или вода' },
  { id: 'ice-tea', name: 'Холодный чай', portion: 'бутылка 0,5 л', g: 38, t: 0, f: 0, k: 150, cat: 'drinks', swap: 'Зелёный чай без сахара' },
  { id: 'milkshake', name: 'Молочный коктейль', portion: 'бутылка 0,3 л', g: 27, t: 0.35, f: 3, k: 210, cat: 'drinks', swap: 'Молоко 2,5%' },
  { id: 'kvass', name: 'Квас', portion: 'стакан 0,5 л', g: 25, t: 0.5, f: 0, k: 135, cat: 'drinks', swap: 'Айран или тан' },
  { id: 'juice-02', name: 'Сок детский', portion: 'пакетик 0,2 л', g: 20, t: 0, f: 0, k: 90, cat: 'drinks', swap: 'Фруктовое пюре без сахара' },
  { id: 'tea-sugar', name: 'Чай с сахаром', portion: 'кружка, 2 ложки сахара', g: 10, t: 0, f: 0, k: 40, cat: 'drinks', swap: 'Чай с лимоном без сахара' },
  { id: 'coffee-3in1', name: 'Кофе 3 в 1', portion: 'пакетик', g: 10, t: 0.2, f: 1.2, k: 70, cat: 'drinks', swap: 'Кофе с молоком без сахара' },
  { id: 'ayran', name: 'Айран', portion: 'бутылка 0,5 л', g: 0, t: 1, f: 1.5, k: 140, cat: 'drinks' },
  { id: 'water', name: 'Вода и минералка', portion: 'любой объём', g: 0, t: 0, f: 0, k: 0, cat: 'drinks' },
  { id: 'beer', name: 'Пиво', portion: 'бутылка 0,5 л', g: 0, t: 0.05, f: 0, k: 215, cat: 'drinks', x: 'alcohol', swap: 'Безалкогольный напиток или вода' },
  { id: 'wine', name: 'Вино', portion: 'бокал 150 мл', g: 0, t: 0, f: 0, k: 125, cat: 'drinks', x: 'alcohol' },
  { id: 'vodka', name: 'Крепкий алкоголь', portion: 'рюмка 50 мл', g: 0, t: 0, f: 0, k: 115, cat: 'drinks', x: 'alcohol' },

  // ── молочное ──
  { id: 'yogurt-drink', name: 'Йогурт питьевой', portion: 'бутылка 270 г', g: 30, t: 0.3, f: 3, k: 230, cat: 'dairy', swap: 'Кефир 1%' },
  { id: 'ice-cream', name: 'Мороженое пломбир', portion: 'стаканчик 80 г', g: 17, t: 0.12, f: 6.4, k: 170, cat: 'dairy', swap: 'Замороженные ягоды' },
  { id: 'curd-mass', name: 'Творожная масса с изюмом', portion: '100 г', g: 16, t: 0.1, f: 5, k: 200, cat: 'dairy', swap: 'Творог 5% с ягодами' },
  { id: 'yogurt-fruit', name: 'Йогурт фруктовый', portion: 'стаканчик 115 г', g: 13, t: 0.15, f: 1.5, k: 100, cat: 'dairy', swap: 'Натуральный йогурт с фруктами' },
  { id: 'glazed-curd', name: 'Сырок глазированный', portion: '1 штука, 45 г', g: 12, t: 0.1, f: 6.3, k: 180, cat: 'dairy', swap: 'Творог 5%' },
  { id: 'condensed', name: 'Сгущёнка', portion: 'столовая ложка', g: 11, t: 0.05, f: 1.4, k: 80, cat: 'dairy' },
  { id: 'cheese', name: 'Сыр твёрдый', portion: '50 г, 2 ломтика', g: 0, t: 0.9, f: 8.5, k: 170, cat: 'dairy', swap: 'Творожный сыр или брынза' },
  { id: 'butter', name: 'Сливочное масло', portion: '10 г на бутерброд', g: 0, t: 0.01, f: 5, k: 74, cat: 'dairy' },
  { id: 'sour-cream', name: 'Сметана 20%', portion: 'столовая ложка, 25 г', g: 0, t: 0.03, f: 3, k: 50, cat: 'dairy', swap: 'Натуральный йогурт' },
  { id: 'kefir', name: 'Кефир и натуральный йогурт', portion: 'стакан', g: 0, t: 0.3, f: 1.5, k: 100, cat: 'dairy' },

  // ── сладости ──
  { id: 'candy', name: 'Конфеты шоколадные', portion: '100 г, около 8 штук', g: 60, t: 0.05, f: 5, k: 430, cat: 'sweets', swap: 'Орехи и сухофрукты' },
  { id: 'marmalade', name: 'Мармелад', portion: '100 г', g: 60, t: 0.05, f: 0, k: 300, cat: 'sweets', swap: 'Сухофрукты' },
  { id: 'chocolate', name: 'Шоколад молочный', portion: 'плитка 100 г', g: 50, t: 0.2, f: 17, k: 540, cat: 'sweets', swap: 'Горький шоколад 85%' },
  { id: 'chak-chak', name: 'Чак-чак', portion: '100 г', g: 40, t: 0.1, f: 4, k: 450, cat: 'sweets', swap: 'Орехи с изюмом' },
  { id: 'halva', name: 'Халва', portion: '100 г', g: 40, t: 0.2, f: 5, k: 520, cat: 'sweets' },
  { id: 'bar', name: 'Шоколадный батончик', portion: '1 штука, 50 г', g: 25, t: 0.15, f: 6, k: 250, cat: 'sweets', swap: 'Банан и горсть орехов' },
  { id: 'zefir', name: 'Зефир', portion: '1 штука, 35 г', g: 21, t: 0.02, f: 0, k: 110, cat: 'sweets' },
  { id: 'dark-choc', name: 'Горький шоколад 85%', portion: 'плитка 100 г', g: 14, t: 0.02, f: 20, k: 580, cat: 'sweets' },
  { id: 'honey', name: 'Мёд', portion: 'столовая ложка', g: 17, t: 0, f: 0, k: 60, cat: 'sweets' },
  { id: 'jam', name: 'Варенье', portion: 'столовая ложка', g: 11, t: 0, f: 0, k: 40, cat: 'sweets' },
  { id: 'choc-paste', name: 'Шоколадная паста', portion: 'столовая ложка', g: 8, t: 0.05, f: 1, k: 90, cat: 'sweets', swap: 'Арахисовая паста без сахара' },

  // ── выпечка ──
  { id: 'cake', name: 'Торт бисквитный', portion: 'кусок 120 г', g: 36, t: 0.5, f: 12, k: 480, cat: 'bakery', swap: 'Фруктовая тарелка' },
  { id: 'gingerbread', name: 'Пряники', portion: '100 г', g: 35, t: 0.5, f: 2, k: 340, cat: 'bakery' },
  { id: 'wafers', name: 'Вафли', portion: '100 г', g: 30, t: 0.4, f: 10, k: 520, cat: 'bakery', swap: 'Цельнозерновые хлебцы' },
  { id: 'cookies', name: 'Печенье', portion: '100 г', g: 24, t: 0.6, f: 8, k: 450, cat: 'bakery', swap: 'Цельнозерновые хлебцы' },
  { id: 'donut', name: 'Пончик в глазури', portion: '1 штука', g: 14, t: 0.3, f: 4, k: 260, cat: 'bakery' },
  { id: 'bun', name: 'Булочка сладкая', portion: '1 штука, 100 г', g: 12, t: 0.8, f: 4, k: 330, cat: 'bakery', swap: 'Ржаной хлеб с сыром' },
  { id: 'cereal', name: 'Шоколадные хлопья', portion: 'порция 40 г', g: 12, t: 0.2, f: 0.4, k: 150, cat: 'bakery', swap: 'Овсянка с бананом' },
  { id: 'granola', name: 'Гранола', portion: 'порция 50 г', g: 11, t: 0.1, f: 1.5, k: 220, cat: 'bakery', swap: 'Овсяные хлопья и орехи' },
  { id: 'baursak', name: 'Баурсаки', portion: '100 г', g: 6, t: 0.9, f: 5, k: 400, cat: 'bakery' },
  { id: 'bread', name: 'Хлеб', portion: '2 куска', g: 2, t: 1.2, f: 0.2, k: 140, cat: 'bakery' },

  // ── солёное и жирное ──
  { id: 'chips', name: 'Чипсы', portion: 'пачка 150 г', g: 2, t: 2.3, f: 6, k: 780, cat: 'salty', swap: 'Несладкий попкорн' },
  { id: 'sausage', name: 'Колбаса варёная', portion: '100 г', g: 1, t: 2.2, f: 9, k: 290, cat: 'salty', swap: 'Отварная куриная грудка' },
  { id: 'frankfurters', name: 'Сосиски', portion: '2 штуки, 100 г', g: 1, t: 2, f: 8, k: 270, cat: 'salty', swap: 'Отварная куриная грудка' },
  { id: 'kazy', name: 'Казы', portion: '100 г', g: 0, t: 2.5, f: 12, k: 400, cat: 'salty' },
  { id: 'noodles', name: 'Лапша быстрого приготовления', portion: 'пачка 70 г с приправой', g: 1, t: 3.5, f: 5, k: 330, cat: 'salty', swap: 'Макароны с овощами' },
  { id: 'pizza', name: 'Пицца', portion: 'кусок 120 г', g: 2, t: 1.6, f: 6, k: 320, cat: 'salty' },
  { id: 'shawarma', name: 'Шаурма', portion: '1 штука', g: 4, t: 3, f: 8, k: 560, cat: 'salty', swap: 'Лаваш с курицей и овощами' },
  { id: 'samsa', name: 'Самса', portion: '1 штука, 120 г', g: 1, t: 1.6, f: 7, k: 330, cat: 'salty' },
  { id: 'fries', name: 'Картофель фри', portion: 'порция 150 г', g: 0, t: 1.5, f: 3, k: 420, cat: 'salty', swap: 'Печёный картофель' },
  { id: 'pelmeni', name: 'Пельмени', portion: '8 штук, 200 г', g: 0, t: 2.2, f: 8, k: 480, cat: 'salty' },
  { id: 'plov', name: 'Плов', portion: 'порция 300 г', g: 0, t: 3, f: 9, k: 525, cat: 'salty' },
  { id: 'herring', name: 'Селёдка солёная', portion: '100 г', g: 0, t: 4, f: 2.5, k: 220, cat: 'salty' },
  { id: 'pickles', name: 'Солёные огурцы', portion: '100 г', g: 1, t: 1.8, f: 0, k: 15, cat: 'salty' },
  { id: 'mayo', name: 'Майонез', portion: 'столовая ложка, 15 г', g: 0.3, t: 0.23, f: 1, k: 90, cat: 'salty', swap: 'Натуральный йогурт с зеленью' },
  { id: 'soy', name: 'Соевый соус', portion: 'столовая ложка, 15 мл', g: 0.3, t: 2.1, f: 0, k: 9, cat: 'salty' },

  // ── остальное ──
  { id: 'ketchup', name: 'Кетчуп', portion: 'столовая ложка', g: 4, t: 0.4, f: 0, k: 15, cat: 'other', swap: 'Томатная паста со специями' },
  { id: 'fruit', name: 'Фрукты и овощи целиком', portion: 'сколько угодно', g: 0, t: 0, f: 0, k: 50, cat: 'other' },
];

const norm = (s: string) => s.toLowerCase().replaceAll('ё', 'е').trim();

/** Значение показателя в порции. */
export const catalogValue = (it: CatalogItem, m: MetricId): number => ({ sugar: it.g, salt: it.t, fat: it.f, kcal: it.k })[m];

/** Поиск по названию и порции; пустой запрос — весь раздел. Сначала то, чего больше всего по выбранному показателю. */
export function searchCatalog(query: string, cat: Cat | 'all', metric: MetricId = 'sugar'): CatalogItem[] {
  const q = norm(query);
  return CATALOG
    .filter(it => (cat === 'all' || it.cat === cat) && (!q || norm(it.name).includes(q) || norm(it.portion).includes(q)))
    .sort((a, b) => catalogValue(b, metric) / METRICS[metric].cubeG - catalogValue(a, metric) / METRICS[metric].cubeG);
}

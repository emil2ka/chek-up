// Справочник «Сколько сахара в…» (перенос web/src/lib/catalog.ts).

class CatalogItem {
  final String id, name, portion, cat;
  final int g;
  final String? swap;
  const CatalogItem({
    required this.id,
    required this.name,
    required this.portion,
    required this.g,
    required this.cat,
    this.swap,
  });
}

const cats = <(String, String)>[
  ('all', 'Всё'),
  ('drinks', 'Напитки'),
  ('dairy', 'Молочное'),
  ('sweets', 'Сладости'),
  ('bakery', 'Выпечка'),
  ('other', 'Остальное'),
];

const catalog = <CatalogItem>[
  // ── напитки ──
  CatalogItem(
    id: 'cola-1',
    name: 'Кола',
    portion: 'бутылка 1 л',
    g: 106,
    cat: 'drinks',
    swap: 'Минералка с лимоном',
  ),
  CatalogItem(
    id: 'juice-1',
    name: 'Сок яблочный',
    portion: 'пакет 1 л',
    g: 100,
    cat: 'drinks',
    swap: 'Целые яблоки и вода',
  ),
  CatalogItem(
    id: 'cola-05',
    name: 'Кола',
    portion: 'бутылка 0,5 л',
    g: 53,
    cat: 'drinks',
    swap: 'Минералка с лимоном',
  ),
  CatalogItem(
    id: 'energy',
    name: 'Энергетик',
    portion: 'банка 0,45 л',
    g: 50,
    cat: 'drinks',
    swap: 'Чёрный чай или вода',
  ),
  CatalogItem(
    id: 'ice-tea',
    name: 'Холодный чай',
    portion: 'бутылка 0,5 л',
    g: 38,
    cat: 'drinks',
    swap: 'Зелёный чай без сахара',
  ),
  CatalogItem(
    id: 'milkshake',
    name: 'Молочный коктейль',
    portion: 'бутылка 0,3 л',
    g: 27,
    cat: 'drinks',
    swap: 'Молоко 2,5%',
  ),
  CatalogItem(
    id: 'kvass',
    name: 'Квас',
    portion: 'стакан 0,5 л',
    g: 25,
    cat: 'drinks',
    swap: 'Айран или тан',
  ),
  CatalogItem(
    id: 'juice-02',
    name: 'Сок детский',
    portion: 'пакетик 0,2 л',
    g: 20,
    cat: 'drinks',
    swap: 'Фруктовое пюре без сахара',
  ),
  CatalogItem(
    id: 'tea-sugar',
    name: 'Чай с сахаром',
    portion: 'кружка, 2 ложки сахара',
    g: 10,
    cat: 'drinks',
    swap: 'Чай с лимоном без сахара',
  ),
  CatalogItem(
    id: 'coffee-3in1',
    name: 'Кофе 3 в 1',
    portion: 'пакетик',
    g: 10,
    cat: 'drinks',
    swap: 'Кофе с молоком без сахара',
  ),
  CatalogItem(
    id: 'ayran',
    name: 'Айран',
    portion: 'бутылка 0,5 л',
    g: 0,
    cat: 'drinks',
  ),
  CatalogItem(
    id: 'water',
    name: 'Вода и минералка',
    portion: 'любой объём',
    g: 0,
    cat: 'drinks',
  ),
  // ── молочное ──
  CatalogItem(
    id: 'yogurt-drink',
    name: 'Йогурт питьевой',
    portion: 'бутылка 270 г',
    g: 30,
    cat: 'dairy',
    swap: 'Кефир 1%',
  ),
  CatalogItem(
    id: 'ice-cream',
    name: 'Мороженое пломбир',
    portion: 'стаканчик 80 г',
    g: 17,
    cat: 'dairy',
    swap: 'Замороженные ягоды',
  ),
  CatalogItem(
    id: 'curd-mass',
    name: 'Творожная масса с изюмом',
    portion: '100 г',
    g: 16,
    cat: 'dairy',
    swap: 'Творог 5% с ягодами',
  ),
  CatalogItem(
    id: 'yogurt-fruit',
    name: 'Йогурт фруктовый',
    portion: 'стаканчик 115 г',
    g: 13,
    cat: 'dairy',
    swap: 'Натуральный йогурт с фруктами',
  ),
  CatalogItem(
    id: 'glazed-curd',
    name: 'Сырок глазированный',
    portion: '1 штука, 45 г',
    g: 12,
    cat: 'dairy',
    swap: 'Творог 5%',
  ),
  CatalogItem(
    id: 'condensed',
    name: 'Сгущёнка',
    portion: 'столовая ложка',
    g: 11,
    cat: 'dairy',
  ),
  CatalogItem(
    id: 'kefir',
    name: 'Кефир и натуральный йогурт',
    portion: 'стакан',
    g: 0,
    cat: 'dairy',
  ),
  // ── сладости ──
  CatalogItem(
    id: 'candy',
    name: 'Конфеты шоколадные',
    portion: '100 г, около 8 штук',
    g: 60,
    cat: 'sweets',
    swap: 'Орехи и сухофрукты',
  ),
  CatalogItem(
    id: 'marmalade',
    name: 'Мармелад',
    portion: '100 г',
    g: 60,
    cat: 'sweets',
    swap: 'Сухофрукты',
  ),
  CatalogItem(
    id: 'chocolate',
    name: 'Шоколад молочный',
    portion: 'плитка 100 г',
    g: 50,
    cat: 'sweets',
    swap: 'Горький шоколад 85%',
  ),
  CatalogItem(
    id: 'chak-chak',
    name: 'Чак-чак',
    portion: '100 г',
    g: 40,
    cat: 'sweets',
    swap: 'Орехи с изюмом',
  ),
  CatalogItem(
    id: 'halva',
    name: 'Халва',
    portion: '100 г',
    g: 40,
    cat: 'sweets',
  ),
  CatalogItem(
    id: 'bar',
    name: 'Шоколадный батончик',
    portion: '1 штука, 50 г',
    g: 25,
    cat: 'sweets',
    swap: 'Банан и горсть орехов',
  ),
  CatalogItem(
    id: 'zefir',
    name: 'Зефир',
    portion: '1 штука, 35 г',
    g: 21,
    cat: 'sweets',
  ),
  CatalogItem(
    id: 'dark-choc',
    name: 'Горький шоколад 85%',
    portion: 'плитка 100 г',
    g: 14,
    cat: 'sweets',
  ),
  CatalogItem(
    id: 'honey',
    name: 'Мёд',
    portion: 'столовая ложка',
    g: 17,
    cat: 'sweets',
  ),
  CatalogItem(
    id: 'jam',
    name: 'Варенье',
    portion: 'столовая ложка',
    g: 11,
    cat: 'sweets',
  ),
  CatalogItem(
    id: 'choc-paste',
    name: 'Шоколадная паста',
    portion: 'столовая ложка',
    g: 8,
    cat: 'sweets',
    swap: 'Арахисовая паста без сахара',
  ),
  // ── выпечка ──
  CatalogItem(
    id: 'cake',
    name: 'Торт бисквитный',
    portion: 'кусок 120 г',
    g: 36,
    cat: 'bakery',
    swap: 'Фруктовая тарелка',
  ),
  CatalogItem(
    id: 'gingerbread',
    name: 'Пряники',
    portion: '100 г',
    g: 35,
    cat: 'bakery',
  ),
  CatalogItem(
    id: 'wafers',
    name: 'Вафли',
    portion: '100 г',
    g: 30,
    cat: 'bakery',
    swap: 'Цельнозерновые хлебцы',
  ),
  CatalogItem(
    id: 'cookies',
    name: 'Печенье',
    portion: '100 г',
    g: 24,
    cat: 'bakery',
    swap: 'Цельнозерновые хлебцы',
  ),
  CatalogItem(
    id: 'donut',
    name: 'Пончик в глазури',
    portion: '1 штука',
    g: 14,
    cat: 'bakery',
  ),
  CatalogItem(
    id: 'bun',
    name: 'Булочка сладкая',
    portion: '1 штука, 100 г',
    g: 12,
    cat: 'bakery',
    swap: 'Ржаной хлеб с сыром',
  ),
  CatalogItem(
    id: 'cereal',
    name: 'Шоколадные хлопья',
    portion: 'порция 40 г',
    g: 12,
    cat: 'bakery',
    swap: 'Овсянка с бананом',
  ),
  CatalogItem(
    id: 'granola',
    name: 'Гранола',
    portion: 'порция 50 г',
    g: 11,
    cat: 'bakery',
    swap: 'Овсяные хлопья и орехи',
  ),
  CatalogItem(
    id: 'baursak',
    name: 'Баурсаки',
    portion: '100 г',
    g: 6,
    cat: 'bakery',
  ),
  CatalogItem(
    id: 'bread',
    name: 'Хлеб',
    portion: '2 куска',
    g: 2,
    cat: 'bakery',
  ),
  // ── остальное ──
  CatalogItem(
    id: 'ketchup',
    name: 'Кетчуп',
    portion: 'столовая ложка',
    g: 4,
    cat: 'other',
    swap: 'Томатная паста со специями',
  ),
  CatalogItem(
    id: 'chips',
    name: 'Чипсы',
    portion: 'пачка 150 г',
    g: 2,
    cat: 'other',
  ),
  CatalogItem(
    id: 'sausage',
    name: 'Колбаса варёная',
    portion: '100 г',
    g: 1,
    cat: 'other',
  ),
  CatalogItem(
    id: 'fruit',
    name: 'Фрукты и овощи целиком',
    portion: 'сколько угодно',
    g: 0,
    cat: 'other',
  ),
];

String _norm(String s) => s.toLowerCase().replaceAll('ё', 'е').trim();

/// Поиск по названию и порции; пустой запрос — весь раздел. Сначала самое сладкое.
List<CatalogItem> searchCatalog(String query, String cat) {
  final q = _norm(query);
  final list = catalog
      .where(
        (it) =>
            (cat == 'all' || it.cat == cat) &&
            (q.isEmpty ||
                _norm(it.name).contains(q) ||
                _norm(it.portion).contains(q)),
      )
      .toList();
  list.sort((a, b) => b.g.compareTo(a.g));
  return list;
}

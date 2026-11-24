// Общий расчёт для всех экранов (перенос web/src/lib/engine.ts: те же формулы и числа).
// Меняешь здесь — меняй там: расхождение ловят тесты на демо-чеках.
import 'dart:math';

import 'calendar.dart';
import 'i18n.dart';
import 'models.dart';

const metricIds = MetricId.values;

class MetricDef {
  final MetricId id;

  /// «Сахар»
  final String label;

  /// родительный падеж для подписей: «кубика сахара»
  final String of;
  final String unit;

  /// Масштаб визуализации.
  final double cubeG;

  /// суточная норма взрослого и ребёнка (ориентир ВОЗ)
  final double adult, kid;

  /// цвет акцента в интерфейсе (точки, полосы)
  final int color;

  /// откуда норма
  final String norm;
  const MetricDef(
    this.id,
    this.label,
    this.of,
    this.unit,
    this.cubeG,
    this.adult,
    this.kid,
    this.color,
    this.norm,
  );
}

const metrics = <MetricId, MetricDef>{
  MetricId.sugar: MetricDef(
    MetricId.sugar,
    'Сахар',
    'сахара',
    'г',
    5,
    50,
    30,
    0xFF4F73FF,
    'ВОЗ: до 50 г добавленного сахара в день',
  ),
  MetricId.salt: MetricDef(
    MetricId.salt,
    'Соль',
    'соли',
    'г',
    0.5,
    5,
    3,
    0xFFE8587F,
    'ВОЗ: до 5 г соли в день',
  ),
  MetricId.fat: MetricDef(
    MetricId.fat,
    'Жиры',
    'жиров',
    'г',
    2,
    20,
    16,
    0xFFE0A400,
    'ВОЗ: насыщенных жиров меньше 10% калорий, около 20 г в день',
  ),
  MetricId.kcal: MetricDef(
    MetricId.kcal,
    'Калории',
    'калорий',
    'ккал',
    200,
    2000,
    1500,
    0xFFF0792A,
    'ориентир: 2000 ккал в день взрослому, 1500 ребёнку',
  ),
  MetricId.carbs: MetricDef(
    MetricId.carbs,
    'Углеводы',
    'углеводов',
    'г',
    10,
    250,
    190,
    0xFF7B5CE5,
    'ориентир: около 250 г углеводов в день взрослому (половина калорий), 190 г ребёнку',
  ),
  MetricId.protein: MetricDef(
    MetricId.protein,
    'Белки',
    'белков',
    'г',
    6,
    60,
    40,
    0xFF1FA891,
    'ориентир: около 60 г белка в день взрослому, 40 г ребёнку',
  ),
};

// Сахар — исторически главный показатель, его константы используют многие экраны.
const cubeG = 5; // один кубик сахара ≈ 5 г
const dailyG =
    50; // норма ВОЗ: до 50 г добавленного сахара в день для взрослого
const adultG = dailyG;
const kidG = 30;
const maxAdults = 6;
const maxKids = 8;

int cubesOfValue(num v, MetricId m) => (v / metrics[m]!.cubeG).round();

/// Линейный штраф: до `from` — 0, от `to` — max.
double _ramp(double v, double from, double to, double max) =>
    max * ((v - from) / (to - from)).clamp(0.0, 1.0);

/// Ниже этого числа калорий плотность считать нельзя: одна бутылка воды дала бы бесконечность.
const _kcalFloor = 400.0;

/// Оценка корзины 0..100: сахар, соль и жиры — относительно калорий, вредное и алкоголь — относительно суммы на еду,
/// поэтому большая закупка и мелкая покупка той же еды получают одинаковый балл. Запасы входят недельной долей.
(int, List<Why>) _scoreOf(
  Map<MetricId, double> dense,
  double share,
  double flagShare,
) {
  final kcal = max(_kcalFloor, dense[MetricId.kcal]!);
  final sugar = dense[MetricId.sugar]! * 4 / kcal;
  final fat = dense[MetricId.fat]! * 9 / kcal;
  final salt = dense[MetricId.salt]! / kcal * 1000;
  final raw = [
    ('sugar', _ramp(sugar, .05, .2, 35), sugar),
    ('fat', _ramp(fat, .08, .2, 18), fat),
    ('salt', _ramp(salt, 2, 6, 15), salt),
    ('junk', _ramp(share, 0, .5, 25), share),
    ('flagged', _ramp(flagShare, 0, .3, 10), flagShare),
  ];
  final lost = raw.fold<double>(0, (n, w) => n + w.$2);
  final why = [
    for (final w in raw)
      if (w.$2.round() > 0) Why(w.$1, w.$2.round(), w.$3),
  ];
  // порядок равных — как в списке (в Dart сортировка неустойчивая)
  final order = {for (final (i, w) in why.indexed) w.k: i};
  why.sort(
    (x, y) => y.pts != x.pts ? y.pts - x.pts : order[x.k]! - order[y.k]!,
  );
  return ((100 - lost).round().clamp(0, 100), why);
}

/// [swaps] — включённые замены (план), [off] — позиции «не для нас».
Analysis analyze(
  Receipt receipt, [
  Iterable<int> swaps = const [],
  Iterable<int> off = const [],
]) {
  final on = swaps.toSet(), skip = off.toSet();
  num total = 0, food = 0, junk = 0, flagged = 0, alcohol = 0, energy = 0;
  var junkCount = 0, flaggedCount = 0, offCount = 0;
  final totals = {for (final m in metricIds) m: 0.0};
  final dense = {for (final m in metricIds) m: 0.0};
  final items = <AnalyzedItem>[];
  for (var i = 0; i < receipt.items.length; i++) {
    final it = receipt.items[i];
    final swapped = on.contains(i) && it.swap != null;
    final active = swapped ? it.swap! : it;
    final isOff = skip.contains(i);
    items.add(AnalyzedItem(it, i, swapped, isOff, active));
    if (isOff) {
      offCount++;
      continue;
    }
    total += active.p;
    if (it.nf) continue;
    food += active.p;
    for (final m in metricIds) {
      final v = active.valueOf(m);
      totals[m] = totals[m]! + v;
      dense[m] = dense[m]! + v / it.weeks;
    }
    if (!swapped && it.junk) {
      junk += active.p;
      junkCount++;
    }
    // у замены алкоголя нет, поэтому флаг берём только у исходной позиции
    final flag = swapped ? null : it.x;
    if (flag != null) {
      flaggedCount++;
      flagged += active.p;
      flag == 'alcohol' ? alcohol += active.p : energy += active.p;
    }
  }
  for (final m in metricIds) {
    totals[m] = (totals[m]! * 10).round() / 10;
  }
  final share = food > 0 ? junk / food : 0.0;
  final (score, why) = _scoreOf(
    dense,
    share.toDouble(),
    food > 0 ? (flagged / food).toDouble() : 0,
  );
  final cubesBy = {for (final m in metricIds) m: cubesOfValue(totals[m]!, m)};
  return Analysis(
    items: items,
    total: total,
    food: food,
    offCount: offCount,
    sugar: totals[MetricId.sugar]!,
    cubes: cubesBy[MetricId.sugar]!,
    junk: junk,
    junkCount: junkCount,
    share: share.toDouble(),
    score: score,
    why: why,
    days: totals[MetricId.sugar]! / dailyG,
    totals: totals,
    cubesBy: cubesBy,
    flaggedCount: flaggedCount,
    flaggedSum: flagged,
    alcoholSum: alcohol,
    energySum: energy,
  );
}

Verdict verdict(int score) {
  if (score >= 80) return Verdict(t('Отлично'), Tone.good);
  if (score >= 60) return Verdict(t('Неплохо'), Tone.good);
  if (score >= 40) return Verdict(t('Так себе'), Tone.mid);
  return Verdict(t('Корзина-бомба'), Tone.bad);
}

typedef Forms = (String, String, String);

/// pl(21, cubesF) → 'кубик'
String pl(num n, Forms f) {
  final a = n.abs().round() % 100, b = a % 10;
  if (a > 10 && a < 20) return t(f.$3);
  if (b == 1) return t(f.$1);
  if (b >= 2 && b <= 4) return t(f.$2);
  return t(f.$3);
}

const Forms cubesF = ('кубик', 'кубика', 'кубиков');
const Forms sugarCubesF = ('кубик сахара', 'кубика сахара', 'кубиков сахара');
const Forms weeksF = ('неделя', 'недели', 'недель');
const Forms freezesF = ('заморозка', 'заморозки', 'заморозок');
const Forms positionsF = ('позицию', 'позиции', 'позиций');
const Forms daysF = ('день', 'дня', 'дней');
const Forms pointsF = ('балл', 'балла', 'баллов');
const Forms junkF = ('вредный товар', 'вредных товара', 'вредных товаров');
const Forms receiptsF = ('чек', 'чека', 'чеков');
const Forms receiptsDatF = ('чеку', 'чекам', 'чекам');
const Forms adultsF = ('взрослый', 'взрослых', 'взрослых');
const Forms kidsF = ('ребёнок', 'ребёнка', 'детей');
const Forms productsF = ('продукт', 'продукта', 'продуктов');

/// group(3490) → '3 490'
String group(num n) {
  final s = n.round().abs().toString();
  final b = StringBuffer();
  for (var i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 == 0) b.write(' ');
    b.write(s[i]);
  }
  return (n < 0 ? '−' : '') + b.toString();
}

/// money(3490) → '3 490 ₸'
String money(num n) => '${group(n)} ₸';

/// dateRu('2026-11-16') → '16 ноября'
String dateRu(String iso) => dayTxt(iso);

int cubesOf(num g) => (g / cubeG).round();
String cubesTxt(int n) => '$n ${pl(n, cubesF)}';

/// подпись под большой цифрой: «кубика сахара»
String capOf(int n) => pl(n, sugarCubesF);

bool isCubeMetric(MetricId m) => m == MetricId.sugar;
bool hasMetricData(Item item, MetricId m) => switch (m) {
  MetricId.carbs => item.c != null,
  MetricId.protein => item.b != null,
  _ => true,
};
bool isHarmfulMetric(MetricId m) =>
    isCubeMetric(m) || m == MetricId.salt || m == MetricId.fat;

const pileHints = {
  MetricId.sugar: 'Тапни, чтобы подбросить кубики',
  MetricId.salt: 'Тапни, чтобы рассыпать крупинки',
  MetricId.kcal: 'Тапни, чтобы разлетелись угольки',
  MetricId.fat: 'Тапни, чтобы подбросить кусочки масла',
  MetricId.carbs: 'Тапни, чтобы подбросить батоны',
  MetricId.protein: 'Тапни, чтобы яйца покатились',
};

String bigNum(num value, MetricId m) => isCubeMetric(m)
    ? '${cubesOfValue(value, m)}'
    : m != MetricId.kcal && value != value.round()
    ? num1(value)
    : '${value.round()}';

String bigCap(num value, MetricId m) => switch (m) {
  MetricId.sugar => capOf(cubesOfValue(value, m)),
  MetricId.fat => t('г насыщенных жиров'),
  MetricId.salt => t('г соли'),
  MetricId.kcal => t('ккал'),
  MetricId.carbs => t('г углеводов'),
  MetricId.protein => t('г белка'),
};

String metricTxt(num value, MetricId m) =>
    '${bigNum(value, m)} ${bigCap(value, m)}';

/// Число с одним знаком после запятой, без лишнего «,0»: 2,3 · 4
String num1(num n) => ((n * 10).round() / 10)
    .toString()
    .replaceAll('.', ',')
    .replaceAll(RegExp(r',0$'), '');

/// Количество показателя с единицей: «106 г», «0,5 г», «460 ккал»
String amountTxt(num v, MetricId m) =>
    '${m == MetricId.kcal ? v.round() : num1(v)} ${t(metrics[m]!.unit)}';

String unitNote(MetricId m) => switch (m) {
  MetricId.sugar => t('1 кубик = 5 г добавленного сахара'),
  MetricId.salt => t('крупинки показывают количество соли, число — в граммах'),
  MetricId.fat => t('1 фигурка масла = 2 г насыщенных жиров'),
  MetricId.kcal => t('1 уголёк = 200 ккал'),
  MetricId.carbs => t('1 фигурка батона = 10 г углеводов'),
  MetricId.protein => t('1 яйцо = 6 г белка'),
};

const unitsNote =
    'Только сахар показываем кубиками по 5 г. Для соли — крупинки, для жиров — кусочки масла по 2 г, для калорий — угольки по 200 ккал, для углеводов — батоны по 10 г, для белка — яйца по 6 г.';

int saltGrainCount(num grams) {
  if (!grams.isFinite || grams <= 0) return 0;
  final estimate = grams <= 14
      ? grams * 12
      : 168 + 74 * log(1 + (grams - 14) / 9);
  return estimate.round().clamp(1, 248);
}

int pileCount(num value, MetricId metric, {int? limit}) =>
    metric == MetricId.salt
    ? min(saltGrainCount(value), limit ?? 248)
    : min(limit ?? 220, cubesOfValue(value, metric));

double metricPileSize(MetricId metric, double width, double space, int count) {
  if (metric == MetricId.salt) return (width * .045).clamp(10.0, 18.0);
  final fitted = cubeSize(width, space, count);
  return metric == MetricId.carbs ? min(56.0, fitted * 1.22) : fitted;
}

int familyDaily(Profile p, MetricId m) =>
    (p.adults * metrics[m]!.adult + p.kids * metrics[m]!.kid).round();
int familyDailyCubesOf(Profile p, MetricId m) =>
    (familyDaily(p, m) / metrics[m]!.cubeG).round();
int familyDailyG(Profile p) => familyDaily(p, MetricId.sugar);
int familyDailyCubes(Profile p) => familyDailyCubesOf(p, MetricId.sugar);

/// Сторона кубика: чтобы куча поместилась под цифрой, а маленькая куча была крупной.
double cubeSize(double width, double avail, int count) {
  final s = sqrt(0.64 * width * max(80.0, avail) / max(1, count));
  return (max(12.0, min(s, min(width / 7.4, 56.0))) * 2).round() / 2;
}

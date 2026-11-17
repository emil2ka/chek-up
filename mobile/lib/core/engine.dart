// Общий расчёт для всех экранов (перенос web/src/lib/engine.ts: те же формулы и числа).
// Меняешь здесь — меняй там: расхождение ловят тесты на демо-чеках.
import 'dart:math';

import 'models.dart';

const metricIds = MetricId.values;

class MetricDef {
  final MetricId id;

  /// «Сахар»
  final String label;

  /// родительный падеж для подписей: «кубика сахара»
  final String of;
  final String unit;

  /// сколько в одном кубике; у каждого показателя так, чтобы норма взрослого была около 10 кубиков в день
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

Analysis analyze(Receipt receipt, [Iterable<int> swaps = const []]) {
  final on = swaps.toSet();
  num total = 0, junk = 0, flagged = 0, alcohol = 0, energy = 0;
  var junkCount = 0, flaggedCount = 0;
  final totals = {for (final m in metricIds) m: 0.0};
  final items = <AnalyzedItem>[];
  for (var i = 0; i < receipt.items.length; i++) {
    final it = receipt.items[i];
    final swapped = on.contains(i) && it.swap != null;
    final active = swapped ? it.swap! : it;
    final activeJunk = !swapped && it.junk;
    // у замены алкоголя нет, поэтому флаг берём только у исходной позиции
    final flag = swapped ? null : it.x;
    total += active.p;
    for (final m in metricIds) {
      totals[m] = totals[m]! + active.valueOf(m);
    }
    if (activeJunk) {
      junk += active.p;
      junkCount++;
    }
    if (flag != null) {
      flaggedCount++;
      flagged += active.p;
      flag == 'alcohol' ? alcohol += active.p : energy += active.p;
    }
    items.add(AnalyzedItem(it, i, swapped, active, activeJunk));
  }
  for (final m in metricIds) {
    totals[m] = (totals[m]! * 10).round() / 10;
  }
  final share = total > 0 ? junk / total : 0.0;
  final flagShare = total > 0 ? flagged / total : 0.0;
  // Оценка корзины 0..100: доля вредного в чеке, сахар, соль, насыщенные жиры, алкоголь и энергетики.
  // Калории в оценку не входят: еда должна быть калорийной, важно, откуда они.
  final penalty =
      share * 40 +
      min(20.0, totals[MetricId.sugar]! / 17.5) +
      min(10.0, totals[MetricId.salt]! / 3.5) +
      min(10.0, totals[MetricId.fat]! / 15) +
      min(10.0, flagShare * 30);
  final score = (100 - penalty).round().clamp(0, 100);
  final cubesBy = {for (final m in metricIds) m: cubesOfValue(totals[m]!, m)};
  return Analysis(
    items: items,
    total: total,
    sugar: totals[MetricId.sugar]!,
    cubes: cubesBy[MetricId.sugar]!,
    junk: junk,
    junkCount: junkCount,
    share: share.toDouble(),
    score: score,
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
  if (score >= 80) return const Verdict('Отлично', Tone.good);
  if (score >= 60) return const Verdict('Неплохо', Tone.good);
  if (score >= 40) return const Verdict('Так себе', Tone.mid);
  return const Verdict('Корзина-бомба', Tone.bad);
}

typedef Forms = (String, String, String);

/// pl(21, cubesF) → 'кубик'
String pl(num n, Forms f) {
  final a = n.abs().round() % 100, b = a % 10;
  if (a > 10 && a < 20) return f.$3;
  if (b == 1) return f.$1;
  if (b >= 2 && b <= 4) return f.$2;
  return f.$3;
}

const Forms cubesF = ('кубик', 'кубика', 'кубиков');
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

const _months = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
];

/// dateRu('2026-11-16') → '16 ноября'
String dateRu(String iso) {
  final d = DateTime.tryParse(iso);
  return d == null ? iso : '${d.day} ${_months[d.month - 1]}';
}

String isoOf(DateTime d) =>
    '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

int cubesOf(num g) => (g / cubeG).round();
String cubesTxt(int n) => '$n ${pl(n, cubesF)}';

/// подпись под большой цифрой: «кубика сахара»
String capOf(int n, [MetricId m = MetricId.sugar]) =>
    '${pl(n, cubesF)} ${metrics[m]!.of}';

/// Число с одним знаком после запятой, без лишнего «,0»: 2,3 · 4
String num1(num n) => ((n * 10).round() / 10)
    .toString()
    .replaceAll('.', ',')
    .replaceAll(RegExp(r',0$'), '');

/// Количество показателя с единицей: «106 г», «0,5 г», «460 ккал»
String amountTxt(num v, MetricId m) =>
    '${m == MetricId.kcal ? v.round() : num1(v)} ${metrics[m]!.unit}';

/// Что в одном кубике: «5 г сахара», «0,5 г соли», «2 г жиров», «200 ккал»
String cubeLabel(MetricId m) => m == MetricId.kcal
    ? '${metrics[m]!.cubeG.round()} ккал'
    : '${num1(metrics[m]!.cubeG)} г ${metrics[m]!.of}';

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

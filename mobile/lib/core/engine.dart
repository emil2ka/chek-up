// Общий расчёт для всех экранов (перенос web/src/lib/engine.ts: те же формулы и числа).
import 'dart:math';

import 'models.dart';

const cubeG = 5; // один кубик сахара ≈ 5 г
const dailyG =
    50; // норма ВОЗ: до 50 г добавленного сахара в день для взрослого
const adultG = dailyG;
const kidG = 30;
const maxAdults = 6;
const maxKids = 8;

Analysis analyze(Receipt receipt, [Iterable<int> swaps = const []]) {
  final on = swaps.toSet();
  num total = 0, sugar = 0, junk = 0;
  var junkCount = 0;
  final items = <AnalyzedItem>[];
  for (var i = 0; i < receipt.items.length; i++) {
    final it = receipt.items[i];
    final swapped = on.contains(i) && it.swap != null;
    final active = swapped ? it.swap! : it;
    final activeJunk = !swapped && it.junk;
    total += active.p;
    sugar += active.s;
    if (activeJunk) {
      junk += active.p;
      junkCount++;
    }
    items.add(AnalyzedItem(it, i, swapped, active, activeJunk));
  }
  final share = total > 0 ? junk / total : 0.0;
  final score = (100 - share * 60 - min(40, sugar / 12.5)).round().clamp(
    0,
    100,
  );
  return Analysis(
    items: items,
    total: total,
    sugar: sugar,
    cubes: (sugar / cubeG).round(),
    junk: junk,
    junkCount: junkCount,
    share: share.toDouble(),
    score: score,
    days: sugar / dailyG,
  );
}

Verdict verdict(int score) {
  if (score >= 80) return const Verdict('Отлично', Tone.good);
  if (score >= 60) return const Verdict('Неплохо', Tone.good);
  if (score >= 40) return const Verdict('Так себе', Tone.mid);
  return const Verdict('Сахарная бомба', Tone.bad);
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
String capOf(int n) => '${pl(n, cubesF)} сахара';

int familyDailyG(Profile p) => p.adults * adultG + p.kids * kidG;
int familyDailyCubes(Profile p) => (familyDailyG(p) / cubeG).round();

/// Сторона кубика: чтобы куча поместилась под цифрой, а маленькая куча была крупной.
double cubeSize(double width, double avail, int count) {
  final s = sqrt(0.64 * width * max(80.0, avail) / max(1, count));
  return (max(12.0, min(s, min(width / 7.4, 56.0))) * 2).round() / 2;
}

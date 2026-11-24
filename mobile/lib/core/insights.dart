// Учёт: неделя, месяц, цель, достижения и экран результата (перенос web/src/lib/insights.ts и result/model.ts).
// Везде считаем ФАКТ: что куплено. Замены — план, они попадают в экономию, когда их подтвердил следующий чек (plan.dart).
import 'dart:math';

import 'calendar.dart';
import 'data.dart';
import 'engine.dart';
import 'i18n.dart';
import 'models.dart';
import 'plan.dart';
import 'streak.dart';

Receipt? demoById(String id) {
  for (final r in demoReceipts) {
    if (r.id == id) return r;
  }
  return null;
}

Receipt? receiptOf(HistoryEntry e) => e.receipt ?? demoById(e.receiptId);

/// Демо-чеки учим показывать, но в стрик, цель и достижения они не идут.
bool isDemo(HistoryEntry e) =>
    e.receipt == null && demoById(e.receiptId) != null;

Map<MetricId, double> _zero() => {for (final m in metricIds) m: 0.0};
double _round1(num v) => (v * 10).round() / 10;

class DayStat {
  final String iso, label;
  final int day;
  final Map<MetricId, double> amounts = _zero();
  final bool today, future;
  DayStat(this.iso, this.label, this.day, this.today, this.future);
}

class WeekReceipt {
  final HistoryEntry entry;
  final Receipt receipt;
  final Analysis analysis;
  const WeekReceipt(this.entry, this.receipt, this.analysis);
}

/// Неделя по одному показателю.
class MetricWeek {
  /// всего за неделю: г или ккал
  final double total, ratio, fromStock;
  final int cubes, normCubes, norm;

  /// главные источники: название и количество
  final List<(String, double)> sources;
  const MetricWeek({
    required this.total,
    required this.cubes,
    required this.normCubes,
    required this.norm,
    required this.ratio,
    required this.sources,
    required this.fromStock,
  });
}

class WeekStats {
  final String week;
  final List<DayStat> days;
  final List<WeekReceipt> receipts, refunds;
  final int total, food, junk, flagged, saved, cubesSaved, guests;
  final List<ConfirmedSwap> confirmed;
  final Map<MetricId, MetricWeek> metrics;
  const WeekStats({
    required this.week,
    required this.days,
    required this.receipts,
    required this.refunds,
    required this.total,
    required this.food,
    required this.junk,
    required this.flagged,
    required this.saved,
    required this.cubesSaved,
    required this.guests,
    required this.confirmed,
    required this.metrics,
  });

  int get cubes => metrics[MetricId.sugar]!.cubes;
  int get normCubes => metrics[MetricId.sugar]!.normCubes;
  double get ratio => metrics[MetricId.sugar]!.ratio;
}

/// Доля позиции, приходящаяся на день, отстоящий от покупки на `age` дней.
double _dayShare(int weeks, int age) => weeks <= 1
    ? (age == 0 ? 1 : 0)
    : (age >= 0 && age < weeks * 7 ? 1 / (weeks * 7) : 0);

/// Календарная неделя (понедельник–воскресенье) по факту.
WeekStats weekStats(
  List<HistoryEntry> entries,
  Profile p, {
  String? week,
  int? now,
}) {
  final today = todayIso(now);
  final from = week ?? weekOf(today);
  final isos = weekDays(from), to = isos.last;
  final days = [
    for (final (i, iso) in isos.indexed)
      DayStat(
        iso,
        dowShort[i],
        int.parse(iso.substring(8, 10)),
        iso == today,
        iso.compareTo(today) > 0,
      ),
  ];
  final receipts = <WeekReceipt>[], refunds = <WeekReceipt>[];
  final bySource = {for (final m in metricIds) m: <String, double>{}};
  final amount = _zero(), stock = _zero();
  num total = 0, food = 0, junk = 0, flagged = 0;
  var guests = 0;

  for (final entry in entries) {
    if (!isIso(entry.date) || entry.date.compareTo(to) > 0) continue;
    final receipt = receiptOf(entry);
    if (receipt == null) continue;
    final inWeek = entry.date.compareTo(from) >= 0;
    if (!inWeek && !receipt.items.any((it) => it.weeks > 1)) continue;
    final a = factOf(entry, receipt);
    final sign = receipt.refund ? -1 : 1;
    if (inWeek) {
      (receipt.refund ? refunds : receipts).add(WeekReceipt(entry, receipt, a));
      total += sign * a.total;
      food += sign * a.food;
      junk += sign * a.junk;
      flagged += sign * a.flaggedSum;
      if (entry.guests) guests++;
    }
    if (entry.guests) continue; // деньги посчитали, показатели — нет
    for (final it in a.items) {
      if (!it.counted) continue;
      final weeks = it.item.weeks;
      for (var d = 0; d < 7; d++) {
        final share = _dayShare(weeks, daysBetween(entry.date, isos[d])) * sign;
        if (share == 0) continue;
        for (final m in metricIds) {
          final v = it.item.valueOf(m) * share;
          if (v == 0) continue;
          amount[m] = amount[m]! + v;
          days[d].amounts[m] = days[d].amounts[m]! + v;
          if (!inWeek) stock[m] = stock[m]! + v;
          bySource[m]![it.item.n] = (bySource[m]![it.item.n] ?? 0) + v;
        }
      }
    }
  }
  for (final d in days) {
    for (final m in metricIds) {
      d.amounts[m] = max(0, _round1(d.amounts[m]!));
    }
  }

  final result = <MetricId, MetricWeek>{};
  for (final m in metricIds) {
    final norm = familyDaily(p, m) * 7;
    final sum = max(0.0, amount[m]!);
    final src = [
      for (final e in bySource[m]!.entries)
        if (_round1(e.value) > 0) (e.key, _round1(e.value)),
    ]..sort((a, b) => b.$2.compareTo(a.$2));
    result[m] = MetricWeek(
      total: _round1(sum),
      cubes: cubesOfValue(sum, m),
      normCubes: cubesOfValue(norm, m),
      norm: norm,
      ratio: norm > 0 ? sum / norm : 0,
      sources: src.take(4).toList(),
      fromStock: max(0, _round1(stock[m]!)),
    );
  }
  final confirmed = [
    for (final c in confirmedSwaps([
      for (final e in entries)
        if (!isDemo(e)) e,
    ], receiptOf))
      if (c.date.compareTo(from) >= 0 && c.date.compareTo(to) <= 0) c,
  ];
  int byDate(WeekReceipt a, WeekReceipt b) {
    final d = b.entry.date.compareTo(a.entry.date);
    return d != 0 ? d : b.entry.savedAt.compareTo(a.entry.savedAt);
  }

  return WeekStats(
    week: from,
    days: days,
    receipts: receipts..sort(byDate),
    refunds: refunds..sort(byDate),
    total: total.round(),
    food: food.round(),
    junk: max(0, junk.round()),
    flagged: max(0, flagged.round()),
    confirmed: confirmed,
    saved: confirmed.fold<num>(0, (n, c) => n + c.money).round(),
    cubesSaved: cubesOfValue(
      confirmed.fold<double>(0, (n, c) => n + c.saved[MetricId.sugar]!),
      MetricId.sugar,
    ),
    guests: guests,
    metrics: result,
  );
}

/// Что стрику нужно знать о каждой неделе: сколько чеков и какая доля нормы сахара. Демо-чеки не считаются.
Map<String, WeekFact> weekFacts(List<HistoryEntry> entries, Profile p) {
  final sugar = <String, double>{}, count = <String, int>{};
  void add(String w, double v) => sugar[w] = (sugar[w] ?? 0) + v;
  for (final e in entries) {
    if (!isIso(e.date) || isDemo(e)) continue;
    final r = receiptOf(e);
    if (r == null) continue;
    final first = weekOf(e.date), sign = r.refund ? -1 : 1;
    if (!r.refund) count[first] = (count[first] ?? 0) + 1;
    if (e.guests) continue;
    for (final (i, it) in r.items.indexed) {
      if (e.off.contains(i) || it.nf || it.s == 0) continue;
      final weeks = it.weeks;
      if (weeks <= 1) {
        add(first, (sign * it.s).toDouble());
        continue;
      }
      for (var d = 0; d < weeks * 7;) {
        final day = addDays(e.date, d), w = weekOf(day);
        // сколько дней запаса приходится на эту неделю
        final n = min(weeks * 7 - d, 7 - daysBetween(w, day));
        add(w, sign * it.s * n / (weeks * 7));
        d += n;
      }
    }
  }
  final norm = familyDaily(p, MetricId.sugar) * 7;
  return {
    for (final e in count.entries)
      e.key: (
        receipts: e.value,
        ratio: norm > 0 ? max(0.0, sugar[e.key] ?? 0) / norm : 0.0,
      ),
  };
}

// ── личная цель ──
const goals = [5, 10, 20];
typedef GoalState = ({int base, int average, int target, int now});

List<String> _closedBefore(List<WeekMark> marks, String week) {
  final l = [
    for (final m in marks)
      if (m.state != 'open' && m.week.compareTo(week) < 0) m.week,
  ]..sort();
  return l.length > 4 ? l.sublist(l.length - 4) : l;
}

/// Цель: столько-то процентов от среднего за последние 4 ЗАКРЫТЫЕ недели до текущей.
GoalState goalState(
  List<HistoryEntry> entries,
  Profile p,
  List<WeekMark> marks,
  int pct, {
  String? week,
  int? now,
}) {
  final w = week ?? weekOf(todayIso(now));
  final real = [
    for (final e in entries)
      if (!isDemo(e)) e,
  ];
  final base = _closedBefore(marks, w);
  final sum = base.fold<double>(
    0,
    (n, x) => n + weekStats(real, p, week: x).metrics[MetricId.sugar]!.total,
  );
  final average = base.isEmpty
      ? 0
      : cubesOfValue(sum / base.length, MetricId.sugar);
  return (
    base: base.length,
    average: average,
    target: (average * (1 - pct / 100)).round(),
    now: weekStats(real, p, week: w).cubes,
  );
}

/// Полнота: сколько чеков внесено и сколько бывает обычно (среднее за последние 4 закрытые недели).
({int now, int usual}) completeness(
  List<HistoryEntry> entries,
  List<WeekMark> marks,
  String week,
) {
  final weeks = [
    for (final e in entries)
      if (!isDemo(e) &&
          isIso(e.date) &&
          receiptOf(e) != null &&
          !receiptOf(e)!.refund)
        weekOf(e.date),
  ];
  int count(String w) => weeks.where((x) => x == w).length;
  final base = _closedBefore(marks, week);
  return (
    now: count(week),
    usual: base.isEmpty
        ? 0
        : (base.fold<int>(0, (n, w) => n + count(w)) / base.length).round(),
  );
}

// ── месяц ──
class PeriodStats {
  int receipts = 0, total = 0, food = 0, junk = 0, saved = 0;
  Map<MetricId, double> totals = _zero();
  int get cubes => cubesOfValue(totals[MetricId.sugar]!, MetricId.sugar);
  List<({String name, int total, int n})> stores = const [];
}

PeriodStats monthStats(List<HistoryEntry> entries, String ym) {
  final out = PeriodStats();
  final stores = <String, (num, int)>{};
  num total = 0, food = 0, junk = 0;
  for (final e in entries) {
    if (!isIso(e.date) || monthOf(e.date) != ym) continue;
    final r = receiptOf(e);
    if (r == null) continue;
    final a = factOf(e, r);
    final sign = r.refund ? -1 : 1;
    if (!r.refund) out.receipts++;
    total += sign * a.total;
    food += sign * a.food;
    junk += sign * a.junk;
    if (!e.guests) {
      for (final m in metricIds) {
        out.totals[m] = out.totals[m]! + sign * a.totals[m]!;
      }
    }
    final s = stores[r.store] ?? (0, 0);
    stores[r.store] = (s.$1 + sign * a.total, s.$2 + (r.refund ? 0 : 1));
  }
  out
    ..total = total.round()
    ..food = food.round()
    ..junk = max(0, junk.round())
    ..totals = {for (final m in metricIds) m: max(0, _round1(out.totals[m]!))}
    ..saved =
        confirmedSwaps([
              for (final e in entries)
                if (!isDemo(e)) e,
            ], receiptOf)
            .where((c) => monthOf(c.date) == ym)
            .fold<num>(0, (n, c) => n + c.money)
            .round()
    ..stores = ([
      for (final s in stores.entries)
        (name: s.key, total: s.value.$1.round(), n: s.value.$2),
    ]..sort((a, b) => b.total.compareTo(a.total))).take(5).toList();
  return out;
}

/// Журнал по дням для календаря месяца: сколько чеков и средняя оценка.
Map<String, ({int n, int score})> monthDays(
  List<HistoryEntry> entries,
  String ym,
) {
  final sums = <String, (int, int)>{};
  for (final e in entries) {
    if (!isIso(e.date) || monthOf(e.date) != ym) continue;
    final r = receiptOf(e);
    if (r == null || r.refund) continue;
    final d = sums[e.date] ?? (0, 0);
    sums[e.date] = (d.$1 + 1, d.$2 + (r.masked ? e.score : factOf(e, r).score));
  }
  return {
    for (final d in sums.entries)
      d.key: (n: d.value.$1, score: (d.value.$2 / d.value.$1).round()),
  };
}

// ── достижения ──
class Badge {
  final String id, icon, title, desc;
  final bool done;
  final (int, int)? progress;
  const Badge(
    this.id,
    this.icon,
    this.title,
    this.desc,
    this.done, [
    this.progress,
  ]);
}

/// Достижения только за подтверждённое: не за нажатия и не за демо-чеки.
List<Badge> badges(
  List<HistoryEntry> entries,
  Profile p,
  List<WeekMark> marks,
  int bestStreak, {
  int shopDone = 0,
  int barcodes = 0,
}) {
  final real = [
    for (final e in entries)
      if (!isDemo(e) && receiptOf(e) != null) e,
  ];
  final done = confirmedSwaps(real, receiptOf);
  final saved = done.fold<num>(0, (n, c) => n + c.money);
  final cubes = cubesOfValue(
    done.fold<double>(0, (n, c) => n + c.saved[MetricId.sugar]!),
    MetricId.sugar,
  );
  final clean = real.any((e) {
    final a = factOf(e, receiptOf(e)!);
    return a.food > 0 && a.score >= 80;
  });
  final facts = weekFacts(real, p);
  final inNorm = marks.any(
    (m) =>
        m.state != 'open' &&
        (facts[m.week]?.receipts ?? 0) >= 2 &&
        facts[m.week]!.ratio <= 1,
  );
  final n = real.length;
  (int, int) cap(num v, int goal) => (v.round().clamp(0, goal), goal);
  return [
    Badge(
      'first',
      'receipt',
      'Первый чек',
      'Внеси первый настоящий чек',
      n >= 1,
    ),
    Badge(
      'swap',
      'swap',
      'Замена сработала',
      'Следующий чек подтвердил замену',
      done.isNotEmpty,
    ),
    Badge('clean', 'leaf', 'Чистая корзина', 'Чек с оценкой 80 и выше', clean),
    Badge(
      'norm',
      'shield',
      'Неделя в норме',
      'Закрытая неделя с двумя чеками и сахаром не выше нормы семьи',
      inNorm,
    ),
    Badge(
      'minus50',
      'minus',
      'Минус 50 кубиков',
      'Подтверждённые замены убрали 50 кубиков сахара',
      cubes >= 50,
      cap(cubes, 50),
    ),
    Badge(
      'saver',
      'coin',
      'Экономист',
      'Подтверждённые замены сэкономили 1 000 ₸',
      saved >= 1000,
      cap(saved, 1000),
    ),
    Badge(
      'streak4',
      'flame',
      'Месяц учёта',
      'Четыре недели подряд',
      bestStreak >= 4,
      cap(bestStreak, 4),
    ),
    Badge(
      'streak12',
      'crown',
      'Три месяца учёта',
      'Двенадцать недель подряд',
      bestStreak >= 12,
      cap(bestStreak, 12),
    ),
    Badge(
      'ten',
      'stack',
      'Десять чеков',
      'Десять настоящих чеков в журнале',
      n >= 10,
      cap(n, 10),
    ),
    // эти два — только в приложении: штрихкод и список покупок
    Badge(
      'shelf',
      'barcode',
      'Разведчик полок',
      'Проверь 3 товара по штрихкоду до кассы',
      barcodes >= 3,
      cap(barcodes, 3),
    ),
    Badge(
      'list',
      'list',
      'По списку',
      'Купи 3 замены из списка',
      shopDone >= 3,
      cap(shopDone, 3),
    ),
  ];
}

// ── Экран результата ──
String _signed(num n, String Function(num) f) =>
    (n > 0
        ? '−'
        : n < 0
        ? '+'
        : '') +
    f(n.abs());

/// «2 л» не разрывать переносом.
String nb(String s) =>
    s.replaceAllMapped(RegExp(r'(\d) (?=\S)'), (m) => '${m[1]}\u00A0');

/// «Торт бисквитный, 1 кг» → «Торт бисквитный»
String shortName(String n) {
  final s = n
      .replaceFirst(
        RegExp(
          r',?\s+\d[\d.,]*\s*(?:кг|г|л|мл|шт|уп|пач\S*|бут\S*|бан\S*)\.?(?:\s*[x×х]\s*\d+)?\s*$',
          caseSensitive: false,
        ),
        '',
      )
      .trim();
  return s.isEmpty ? n : s;
}

class SwapRow {
  final int i;
  final String from, to, cubes, price;
  final num delta;
  const SwapRow(this.i, this.from, this.to, this.cubes, this.price, this.delta);
}

/// Позиции с заменой, которые меняют выбранный показатель: сначала самые полезные.
List<SwapRow> swapRows(
  Receipt r, [
  MetricId m = MetricId.sugar,
  List<int> off = const [],
]) {
  final rows = <SwapRow>[];
  for (var i = 0; i < r.items.length; i++) {
    final it = r.items[i], sw = it.swap;
    if (sw == null ||
        it.nf ||
        off.contains(i) ||
        !hasMetricData(it, m) ||
        !hasMetricData(sw, m)) {
      continue;
    }
    final before = it.valueOf(m), after = sw.valueOf(m);
    final delta = isCubeMetric(m)
        ? cubesOfValue(before, m) - cubesOfValue(after, m)
        : ((before - after) * 10).round() / 10;
    if (delta == 0) continue;
    rows.add(
      SwapRow(
        i,
        nb(it.n),
        nb(sw.n),
        _signed(
          delta,
          (n) => isCubeMetric(m) ? cubesTxt(n.round()) : amountTxt(n, m),
        ),
        r.masked || it.p == 0 ? '' : _signed(it.p - sw.p, money),
        delta,
      ),
    );
  }
  final order = {for (final (k, x) in rows.indexed) x.i: k};
  return rows..sort((a, b) {
    final d = b.delta.compareTo(a.delta);
    return d != 0 ? d : order[a.i]! - order[b.i]!;
  });
}

class SourceRow {
  final int i, cells, weeks;
  final String name, amount, cubes, swapTo;
  final double width;
  final bool swapped;
  const SourceRow(
    this.i,
    this.name,
    this.amount,
    this.cubes,
    this.width,
    this.cells,
    this.weeks,
    this.swapped,
    this.swapTo,
  );
}

/// «Цена вреда»: сколько денег ушло на продукты с этим показателем и во сколько обошёлся кубик.
class HarmPrice {
  final num spend, total;
  final double perUnit;
  final List<({String name, num price, num value})> top;
  const HarmPrice(this.spend, this.total, this.perUnit, this.top);
}

HarmPrice harmPrice(Analysis a, MetricId m) {
  final rows =
      [
            for (final it in a.items)
              if (it.counted)
                (
                  name: it.active.n,
                  price: it.active.p,
                  value: it.active.valueOf(m),
                ),
          ]
          .where(
            (r) => isCubeMetric(m) ? cubesOfValue(r.value, m) > 0 : r.value > 0,
          )
          .toList();
  final spend = rows.fold<num>(0, (s, r) => s + r.price);
  final total = rows.fold<num>(
    0,
    (s, r) =>
        s +
        (isCubeMetric(m)
            ? cubesOfValue(r.value, m) * metrics[m]!.cubeG
            : r.value),
  );
  final units = isCubeMetric(m) ? cubesOfValue(total, m) : total;
  rows.sort((x, y) => y.price.compareTo(x.price));
  return HarmPrice(
    spend,
    total,
    units > 0 ? spend / units * (m == MetricId.kcal ? 100 : 1) : 0,
    rows.take(3).toList(),
  );
}

/// «Это как…»: понятные сравнения для количества выбранного показателя.
class Equivalent {
  final String icon, value, label;
  const Equivalent(this.icon, this.value, this.label);
}

String _fix1(double v) => v >= 10
    ? v.round().toString()
    : v.toStringAsFixed(1).replaceAll('.', ',').replaceAll(RegExp(r',0$'), '');

List<Equivalent> equivalents(double v, MetricId m) {
  if (cubesOfValue(v, m) < 1) return const [];
  switch (m) {
    case MetricId.sugar:
      return [
        Equivalent(
          'can',
          _fix1(v / 35),
          t('банок колы по 0,33 л'),
        ), // банка колы ≈ 35 г сахара
        Equivalent(
          'walk',
          v * 4 / 4.5 >= 90
              ? '${_fix1(v * 4 / 4.5 / 60)} ${t('ч')}'
              : '${(v * 4 / 4.5).round()} ${t('мин')}',
          t('быстрой ходьбы, чтобы сжечь'),
        ), // 4 ккал/г, ходьба ≈ 4,5 ккал/мин
        Equivalent('spoon', _fix1(v / 25), t('столовых ложек сахара с горкой')),
      ];
    case MetricId.salt:
      return [
        Equivalent(
          'spoon',
          _fix1(v / 6),
          t('чайных ложек соли'),
        ), // чайная ложка ≈ 6 г
        Equivalent(
          'day',
          _fix1(v / metrics[m]!.adult),
          t('дневных норм соли для взрослого'),
        ),
        Equivalent('chips', _fix1(v / 2.3), t('пачек чипсов по 150 г')),
      ];
    case MetricId.fat:
      return [
        Equivalent(
          'butter',
          _fix1(v / 90),
          t('пачек сливочного масла по 180 г'),
        ), // сливочное масло: 50 г насыщенных жиров на 100 г
        Equivalent(
          'day',
          _fix1(v / metrics[m]!.adult),
          t('дневных норм жиров для взрослого'),
        ),
        Equivalent('burger', _fix1(v / 6), t('чизбургеров по сумме жиров')),
      ];
    case MetricId.carbs:
    case MetricId.protein:
      return const [];
    case MetricId.kcal:
      return [
        Equivalent(
          'day',
          _fix1(v / metrics[m]!.adult),
          t('дней питания для взрослого'),
        ),
        Equivalent(
          'run',
          v / 600 >= 1
              ? '${_fix1(v / 600)} ${t('ч')}'
              : '${(v / 10).round()} ${t('мин')}',
          t('бега, чтобы сжечь'),
        ), // бег ≈ 600 ккал/ч
        Equivalent(
          'choc',
          _fix1(v / 540),
          t('плиток молочного шоколада по 100 г'),
        ),
      ];
  }
}

/// Главная мысль о чеке — одной фразой. Считается по тому, что лежит в корзине на самом деле.
String conclusion(Receipt r, Analysis a, {bool guests = false}) {
  if (r.refund) return t('Это возврат: вычтем его из недели.');
  if (guests) {
    return t('Чек для гостей: деньги считаем, норму семьи не трогаем.');
  }
  final food = [
    for (final it in a.items)
      if (it.counted) it.item,
  ];
  if (food.isEmpty) return t('Здесь нет еды, оценивать нечего.');
  final why = a.why.firstOrNull;
  if (why == null) {
    return t('Хорошая корзина: сахара, соли и жиров немного.');
  }
  Item top(MetricId m) => food.reduce(
    (x, y) => y.valueOf(m) / y.weeks > x.valueOf(m) / x.weeks ? y : x,
  );
  switch (why.k) {
    case 'sugar':
      final it = top(MetricId.sugar), c = cubesOfValue(it.s, MetricId.sugar);
      if (it.weeks > 1) {
        return t(
          'Больше всего сахара в запасе: {n}. Хватит на {w} нед., так и посчитаем.',
          {'n': shortName(it.n), 'w': it.weeks},
        );
      }
      final v = {
        'n': shortName(it.n),
        'c': c,
        'w': pl(c, cubesF),
        'total': a.cubes,
      };
      if (c >= a.cubes) return t('Весь сахар из одной позиции: {n}.', v);
      if (c >= a.cubes * .5) {
        return t(
          'Больше половины сахара даёт одна позиция: {n}, {c} из {total}.',
          v,
        );
      }
      if (c >= a.cubes * .25) {
        return t('Главный источник сахара: {n}, {c} {w} из {total}.', v);
      }
      return t(
        'Сахар набрался понемногу, больше всего здесь: {n}, {c} {w}.',
        v,
      );
    case 'fat':
      return t(
        'Больше всего оценку снизили насыщенные жиры, главный источник: {n}.',
        {'n': shortName(top(MetricId.fat).n)},
      );
    case 'salt':
      return t('Больше всего оценку снизила соль, главный источник: {n}.', {
        'n': shortName(top(MetricId.salt).n),
      });
    case 'junk':
      final junk = [
        for (final it in food)
          if (it.junk) it,
      ];
      if (r.masked) {
        return t('Сладостей и снеков здесь {n}.', {'n': junk.length});
      }
      return t('{p}% денег на еду ушло на вредное. Дороже всего: {n}.', {
        'p': (a.share * 100).round(),
        'n': junk.isEmpty
            ? ''
            : shortName(junk.reduce((x, y) => y.p > x.p ? y : x).n),
      });
    default:
      return r.masked
          ? t('Оценку снизили энергетики.')
          : t('Оценку снизили алкоголь и энергетики: {m}.', {
              'm': money(a.flaggedSum),
            });
  }
}

/// Мысль о выбранном показателе. Сахар — главная, с него начинает conclusion.
String metricPhrase(Analysis a, MetricId m) {
  final rows = [
    for (final it in a.items)
      if (it.counted && it.item.valueOf(m) > 0) it.item,
  ];
  if (rows.isEmpty) return t('Нет данных об этом показателе');
  final top = rows.reduce((x, y) => y.valueOf(m) > x.valueOf(m) ? y : x);
  final v = {
    'x': metricTxt(a.totals[m]!, m),
    'n': shortName(top.n),
    'p': (top.valueOf(m) / a.totals[m]! * 100).round(),
  };
  return rows.length == 1
      ? t('Всего {x}, и всё из одной позиции: {n}.', v)
      : t('Всего {x}. Больше всего: {n}, {p}%.', v);
}

class FlaggedLine {
  final String name;
  final num price;
  const FlaggedLine(this.name, this.price);
}

class ResultModel {
  /// analysis — с планом замен, base — как есть (факт)
  final Analysis analysis, base;
  final List<int> swaps;
  final MetricId metric;
  final Set<MetricId> available;
  final int maxCubes, score;
  final Tone tone, junkTone;
  final String pill, junkSum, junkShare, junkOf, junkDays, shareText;
  final ({String points, String label, String money})? summary;
  final List<SourceRow> sources;
  final HarmPrice harm;
  final List<FlaggedLine> flagged;
  const ResultModel({
    required this.analysis,
    required this.base,
    required this.swaps,
    required this.metric,
    required this.available,
    required this.maxCubes,
    required this.score,
    required this.tone,
    required this.pill,
    required this.summary,
    required this.sources,
    required this.harm,
    required this.flagged,
    required this.junkTone,
    required this.junkSum,
    required this.junkShare,
    required this.junkOf,
    required this.junkDays,
    required this.shareText,
  });
}

ResultModel resultModel(
  Receipt receipt,
  Iterable<int> swaps, {
  MetricId metric = MetricId.sugar,
  List<int> off = const [],
  int? score,
}) {
  final on = swaps.toSet();
  final base = analyze(receipt, const [], off), a = analyze(receipt, on, off);
  final shown = receipt.masked && score != null ? score : base.score;
  final v = verdict(shown);
  final low = v.label.toLowerCase();
  final save = base.total - a.total;
  final counted = [
    for (final it in base.items)
      if (it.counted) it,
  ];
  final available = {
    for (final m in metricIds)
      if (counted.isEmpty || counted.any((it) => hasMetricData(it.item, m))) m,
  };

  final src =
      [
        for (final it in counted)
          if (it.item.valueOf(metric) > 0) it,
      ]..sort((x, y) {
        final d = y.item.valueOf(metric).compareTo(x.item.valueOf(metric));
        return d != 0 ? d : x.i - y.i;
      });
  final top = src.take(8).toList();
  final maxV = top.isEmpty ? 1 : top.first.item.valueOf(metric);
  final sources = [
    for (final it in top)
      () {
        final val = it.item.valueOf(metric), c = cubesOfValue(val, metric);
        final sw = it.item.swap;
        return SourceRow(
          it.i,
          nb(it.item.n),
          amountTxt(val, metric),
          !isCubeMetric(metric)
              ? ''
              : (c > 0 ? cubesTxt(c) : t('меньше кубика')),
          max(4.0, val / maxV * 100),
          isCubeMetric(metric) ? max(1, c) : 1,
          it.item.weeks,
          on.contains(it.i) && sw != null,
          sw != null ? '${sw.n}: ${amountTxt(sw.valueOf(metric), metric)}' : '',
        );
      }(),
  ];

  final d = (base.totals[metric]! / metrics[metric]!.adult).round();
  final parts = [
    for (final k in {MetricId.sugar, MetricId.salt, MetricId.fat, metric})
      if (available.contains(k)) metricTxt(base.totals[k]!, k),
  ];
  return ResultModel(
    analysis: a,
    base: base,
    swaps: on.toList()..sort(),
    metric: metric,
    available: available,
    maxCubes: max(1, max(base.cubesBy[metric]!, a.cubesBy[metric]!)),
    score: shown,
    tone: v.tone,
    pill: t('{n} из 100 · {v}', {'n': shown, 'v': low}),
    summary: on.isEmpty
        ? null
        : (
            points: '${a.score} ${pl(a.score, pointsF)}',
            label: receipt.masked
                ? ''
                : save > 0
                ? t('экономия')
                : save < 0
                ? t('доплата')
                : t('по той же цене'),
            money: save != 0 && !receipt.masked ? money(save.abs()) : '',
          ),
    sources: sources,
    harm: harmPrice(base, metric),
    flagged: receipt.masked
        ? const []
        : [
            for (final it in counted)
              if (it.item.x != null) FlaggedLine(it.item.n, it.item.p),
          ],
    junkTone: base.share > 0.3
        ? Tone.bad
        : base.share > 0.1
        ? Tone.mid
        : Tone.good,
    junkSum: money(base.junk),
    junkShare: t('{n}% еды', {'n': (base.share * 100).round()}),
    junkOf: base.junkCount > 0
        ? t('{n} {w} из {m} на еду', {
            'n': base.junkCount,
            'w': pl(base.junkCount, junkF),
            'm': money(base.food),
          })
        : t('Вредных товаров нет: все {m} на нормальную еду', {
            'm': money(base.food),
          }),
    junkDays: d >= 1
        ? t('Здесь {what} на {d} {w} для одного взрослого', {
            'what': t(metrics[metric]!.of),
            'd': d,
            'w': pl(d, daysF),
          })
        : t('Здесь {what} меньше дневной нормы взрослого', {
            'what': t(metrics[metric]!.of),
          }),
    shareText: t(
      'Мой чек в «Чек-ап»: {list}, оценка {n} из 100. А что в твоей корзине?',
      {'list': parts.join(', '), 'n': shown},
    ),
  );
}

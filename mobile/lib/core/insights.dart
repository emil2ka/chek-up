// Неделя, достижения, экран результата: чистые расчёты поверх чеков (перенос web insights.ts и result/model.ts).
// Все списки считаются для выбранного показателя: сахар, соль, жиры или калории.
import 'dart:math';

import 'data.dart';
import 'engine.dart';
import 'models.dart';

Receipt? demoById(String id) {
  for (final r in demoReceipts) {
    if (r.id == id) return r;
  }
  return null;
}

Receipt? receiptOf(HistoryEntry e) => e.receipt ?? demoById(e.receiptId);

const _dow = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];

class DayStat {
  final String iso, label;
  final int day;

  /// кубиков по каждому показателю за день
  final Map<MetricId, int> by = {for (final m in metricIds) m: 0};
  final bool today;
  DayStat(this.iso, this.label, this.day, this.today);
  int get cubes => by[MetricId.sugar]!;
}

class WeekReceipt {
  final HistoryEntry entry;
  final Receipt receipt;
  final Analysis analysis, base;
  const WeekReceipt(this.entry, this.receipt, this.analysis, this.base);
}

/// Неделя по одному показателю.
class MetricWeek {
  /// всего за неделю: г (сахар, соль, жиры) или ккал
  final double total;
  final int cubes, normCubes, cubesSaved;
  final double ratio;

  /// главные источники: название и количество
  final List<(String, num)> sources;
  const MetricWeek({
    required this.total,
    required this.cubes,
    required this.normCubes,
    required this.ratio,
    required this.sources,
    required this.cubesSaved,
  });
}

class WeekStats {
  final List<DayStat> days;
  final List<WeekReceipt> receipts;
  final num junk, total, saved, flagged;
  final Map<MetricId, MetricWeek> metrics;
  const WeekStats({
    required this.days,
    required this.receipts,
    required this.junk,
    required this.total,
    required this.saved,
    required this.flagged,
    required this.metrics,
  });

  // как раньше: сахар
  int get cubes => metrics[MetricId.sugar]!.cubes;
  num get sugar => metrics[MetricId.sugar]!.total;
  int get normCubes => metrics[MetricId.sugar]!.normCubes;
  double get ratio => metrics[MetricId.sugar]!.ratio;
  int get cubesSaved => metrics[MetricId.sugar]!.cubesSaved;
}

/// Последние 7 дней, включая сегодня; чек относится к дню своей даты.
WeekStats weekStats(List<HistoryEntry> entries, Profile p, [DateTime? now]) {
  now ??= DateTime.now();
  final days = <DayStat>[];
  for (var i = 6; i >= 0; i--) {
    final d = DateTime(now.year, now.month, now.day - i);
    days.add(DayStat(isoOf(d), _dow[d.weekday - 1], d.day, i == 0));
  }
  final byIso = {for (final d in days) d.iso: d};
  final receipts = <WeekReceipt>[];
  final bySource = {for (final m in metricIds) m: <String, num>{}};
  final amount = {for (final m in metricIds) m: 0.0};
  final saved = {for (final m in metricIds) m: 0};
  num junk = 0, total = 0, money = 0, flagged = 0;

  for (final entry in entries) {
    final day = byIso[entry.date];
    final receipt = receiptOf(entry);
    if (day == null || receipt == null) continue;
    final a = analyze(receipt, entry.swaps), base = analyze(receipt);
    receipts.add(WeekReceipt(entry, receipt, a, base));
    junk += a.junk;
    total += a.total;
    flagged += a.flaggedSum;
    money += base.total - a.total;
    for (final m in metricIds) {
      amount[m] = amount[m]! + a.totals[m]!;
      day.by[m] = day.by[m]! + a.cubesBy[m]!;
      saved[m] = saved[m]! + base.cubesBy[m]! - a.cubesBy[m]!;
      for (final it in a.items) {
        final v = it.active.valueOf(m);
        if (v > 0)
          bySource[m]![it.active.n] = (bySource[m]![it.active.n] ?? 0) + v;
      }
    }
  }

  final result = <MetricId, MetricWeek>{};
  for (final m in metricIds) {
    final normCubes = (familyDaily(p, m) * 7 / metrics[m]!.cubeG).round();
    final cubes = cubesOfValue(amount[m]!, m);
    final src = [for (final e in bySource[m]!.entries) (e.key, e.value)]
      ..sort((a, b) => b.$2.compareTo(a.$2));
    result[m] = MetricWeek(
      total: (amount[m]! * 10).round() / 10,
      cubes: cubes,
      normCubes: normCubes,
      ratio: normCubes > 0 ? cubes / normCubes : 0,
      sources: src.take(4).toList(),
      cubesSaved: saved[m]!,
    );
  }
  return WeekStats(
    days: days,
    receipts: receipts,
    junk: junk,
    total: total,
    saved: money,
    flagged: flagged,
    metrics: result,
  );
}

// ── Достижения ──
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

List<Badge> badges(
  List<HistoryEntry> entries,
  Profile p, {
  int shopDone = 0,
  int barcodes = 0,
}) {
  num saved = 0;
  var cubesSaved = 0, swapped = false, clean = false, bomb = false;
  for (final e in entries) {
    final r = receiptOf(e);
    if (r == null) continue;
    final a = analyze(r, e.swaps), b = analyze(r);
    saved += b.total - a.total;
    cubesSaved += b.cubes - a.cubes;
    if (e.swaps.isNotEmpty) swapped = true;
    if (a.score >= 80) clean = true;
    if (b.score < 40) bomb = true;
  }
  final w = weekStats(entries, p);
  final n = entries.length;
  (int, int) cap(num v, int goal) => (v.round().clamp(0, goal), goal);

  return [
    Badge(
      'first',
      'receipt',
      'Первый чек',
      'Посмотри сахар в первом чеке',
      n >= 1,
    ),
    Badge(
      'swap',
      'swap',
      'Первая замена',
      'Включи замену в любом чеке',
      swapped,
    ),
    Badge(
      'three',
      'stack',
      'Три чека',
      'Собери три чека в истории',
      n >= 3,
      cap(n, 3),
    ),
    Badge('clean', 'leaf', 'Чистая корзина', 'Чек с оценкой 80 и выше', clean),
    Badge('bomb', 'bomb', 'Корзина-бомба', 'Найди чек с оценкой ниже 40', bomb),
    Badge(
      'minus50',
      'minus',
      'Минус 50 кубиков',
      'Убери заменами 50 кубиков сахара',
      cubesSaved >= 50,
      cap(cubesSaved, 50),
    ),
    Badge(
      'saver',
      'coin',
      'Экономист',
      'Сэкономь заменами 1 000 ₸',
      saved >= 1000,
      cap(saved, 1000),
    ),
    Badge(
      'norm',
      'shield',
      'Неделя в норме',
      'Два чека за неделю и сахар не выше нормы семьи',
      w.receipts.length >= 2 && w.ratio <= 1,
    ),
    Badge(
      'ten',
      'crown',
      'Десять чеков',
      'Десять чеков в истории',
      n >= 10,
      cap(n, 10),
    ),
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
      'Купи 3 замены из списка на следующий поход',
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
String _of(MetricId m) =>
    metrics[m]!.of[0].toUpperCase() + metrics[m]!.of.substring(1);

class SwapRow {
  final int i;
  final String from, to, cubes, price;
  const SwapRow(this.i, this.from, this.to, this.cubes, this.price);
}

/// Позиции с заменой, которые меняют выбранный показатель.
List<SwapRow> swapRows(Receipt r, [MetricId m = MetricId.sugar]) {
  final rows = <SwapRow>[];
  for (var i = 0; i < r.items.length; i++) {
    final it = r.items[i];
    if (it.swap == null) continue;
    final delta =
        cubesOfValue(it.valueOf(m), m) - cubesOfValue(it.swap!.valueOf(m), m);
    if (delta == 0) continue;
    rows.add(
      SwapRow(
        i,
        it.n,
        it.swap!.n,
        _signed(delta, (n) => cubesTxt(n.round())),
        _signed(it.p - it.swap!.p, money),
      ),
    );
  }
  return rows;
}

class SourceRow {
  final int i, cells;
  final String name, amount, cubes, swapTo;
  final double width;
  final bool off;
  const SourceRow(
    this.i,
    this.name,
    this.amount,
    this.cubes,
    this.width,
    this.cells,
    this.off,
    this.swapTo,
  );
}

/// «Цена вреда»: сколько денег ушло на продукты с этим показателем и во сколько обошёлся кубик.
class HarmPrice {
  final num spend;
  final int cubes;
  final double perCube;
  final List<({String name, num price, int cubes})> top;
  const HarmPrice(this.spend, this.cubes, this.perCube, this.top);
}

HarmPrice harmPrice(Analysis a, MetricId m) {
  final rows = [
    for (final it in a.items)
      (
        name: it.active.n,
        price: it.active.p,
        cubes: cubesOfValue(it.active.valueOf(m), m),
      ),
  ].where((r) => r.cubes >= 1).toList();
  final spend = rows.fold<num>(0, (s, r) => s + r.price);
  final cubes = rows.fold<int>(0, (s, r) => s + r.cubes);
  rows.sort((x, y) => y.price.compareTo(x.price));
  return HarmPrice(
    spend,
    cubes,
    cubes > 0 ? spend / cubes : 0,
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
          'банок колы по 0,33 л',
        ), // банка колы ≈ 35 г сахара
        Equivalent(
          'walk',
          v * 4 / 4.5 >= 90
              ? '${_fix1(v * 4 / 4.5 / 60)} ч'
              : '${(v * 4 / 4.5).round()} мин',
          'быстрой ходьбы, чтобы сжечь',
        ), // 4 ккал/г, ходьба ≈ 4,5 ккал/мин
        Equivalent('spoon', _fix1(v / 25), 'столовых ложек сахара с горкой'),
      ];
    case MetricId.salt:
      return [
        Equivalent(
          'spoon',
          _fix1(v / 6),
          'чайных ложек соли',
        ), // чайная ложка ≈ 6 г
        Equivalent(
          'day',
          _fix1(v / metrics[m]!.adult),
          'дневных норм соли для взрослого',
        ),
        Equivalent('chips', _fix1(v / 2.3), 'пачек чипсов по 150 г'),
      ];
    case MetricId.fat:
      return [
        Equivalent(
          'butter',
          _fix1(v / 90),
          'пачек сливочного масла по 180 г',
        ), // сливочное масло: 50 г насыщенных жиров на 100 г
        Equivalent(
          'day',
          _fix1(v / metrics[m]!.adult),
          'дневных норм жиров для взрослого',
        ),
        Equivalent('burger', _fix1(v / 6), 'чизбургеров по сумме жиров'),
      ];
    case MetricId.kcal:
      return [
        Equivalent(
          'day',
          _fix1(v / metrics[m]!.adult),
          'дней питания для взрослого',
        ),
        Equivalent(
          'run',
          v / 600 >= 1 ? '${_fix1(v / 600)} ч' : '${(v / 10).round()} мин',
          'бега, чтобы сжечь',
        ), // бег ≈ 600 ккал/ч
        Equivalent(
          'choc',
          _fix1(v / 540),
          'плиток молочного шоколада по 100 г',
        ),
      ];
  }
}

class FlaggedLine {
  final String name;
  final num price;
  final String kind;
  const FlaggedLine(this.name, this.price, this.kind);
}

class ResultModel {
  final Analysis analysis, base;
  final List<int> swaps;
  final MetricId metric;
  final int maxCubes;
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
    required this.maxCubes,
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
  Iterable<int> swaps, [
  MetricId metric = MetricId.sugar,
]) {
  final on = swaps.toSet();
  final base = analyze(receipt), a = analyze(receipt, on);
  final v = verdict(a.score);
  final low = v.label.toLowerCase();
  final save = base.total - a.total;

  final src =
      [
        for (var i = 0; i < receipt.items.length; i++)
          if (receipt.items[i].valueOf(metric) > 0) i,
      ]..sort(
        (x, y) => receipt.items[y]
            .valueOf(metric)
            .compareTo(receipt.items[x].valueOf(metric)),
      );
  final top = src.take(8).toList();
  final maxV = top.isEmpty ? 1 : receipt.items[top.first].valueOf(metric);
  final sources = [
    for (final i in top)
      () {
        final it = receipt.items[i];
        final val = it.valueOf(metric), c = cubesOfValue(val, metric);
        return SourceRow(
          i,
          it.n,
          amountTxt(val, metric),
          c > 0 ? cubesTxt(c) : 'меньше кубика',
          max(4.0, val / maxV * 100),
          max(1, c),
          a.items[i].swapped,
          it.swap != null
              ? '${it.swap!.n} — ${amountTxt(it.swap!.valueOf(metric), metric)}'
              : '',
        );
      }(),
  ];

  final d = (a.totals[metric]! / metrics[metric]!.adult).round();
  final parts = [
    for (final k in [MetricId.sugar, MetricId.salt, MetricId.fat])
      '${a.cubesBy[k]} ${pl(a.cubesBy[k]!, cubesF)} ${metrics[k]!.of}',
  ];
  var share =
      'Мой чек в «Чек-ап»: ${parts.join(', ')}, оценка ${a.score} из 100 — $low.';
  if (on.isNotEmpty && base.score < a.score) {
    share +=
        ' С заменами оценка ${a.score}${save > 0 ? ' и ${money(save)} экономии' : ''}.';
  }
  share += ' А что в твоей корзине?';

  return ResultModel(
    analysis: a,
    base: base,
    swaps: on.toList()..sort(),
    metric: metric,
    maxCubes: max(1, max(base.cubesBy[metric]!, a.cubesBy[metric]!)),
    tone: v.tone,
    pill: '${a.score} из 100 · $low',
    summary: on.isEmpty
        ? null
        : (
            points: '${a.score} ${pl(a.score, pointsF)}',
            label: save > 0
                ? 'экономия'
                : save < 0
                ? 'доплата'
                : 'по той же цене',
            money: save != 0 ? money(save.abs()) : '',
          ),
    sources: sources,
    harm: harmPrice(a, metric),
    flagged: [
      for (final it in a.items)
        if (!it.swapped && it.item.x != null)
          FlaggedLine(it.item.n, it.item.p, it.item.x!),
    ],
    junkTone: a.share > 0.3
        ? Tone.bad
        : a.share > 0.1
        ? Tone.mid
        : Tone.good,
    junkSum: money(a.junk),
    junkShare: '${(a.share * 100).round()}% чека',
    junkOf: a.junkCount > 0
        ? '${a.junkCount} ${pl(a.junkCount, junkF)} из ${money(a.total)} всего'
        : 'Вредных товаров нет — весь чек ${money(a.total)} на нормальную еду',
    junkDays: d >= 1
        ? '${_of(metric)} в чеке — на $d ${pl(d, daysF)} для одного взрослого'
        : '${_of(metric)} в чеке меньше дневной нормы взрослого',
    shareText: share,
  );
}

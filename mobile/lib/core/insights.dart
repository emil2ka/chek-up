// Неделя, достижения, экран результата: чистые расчёты поверх чеков (перенос web insights.ts и result/model.ts).
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
  int cubes = 0;
  final bool today;
  DayStat(this.iso, this.label, this.day, this.today);
}

class WeekReceipt {
  final HistoryEntry entry;
  final Receipt receipt;
  final Analysis analysis, base;
  const WeekReceipt(this.entry, this.receipt, this.analysis, this.base);
}

class WeekStats {
  final List<DayStat> days;
  final List<WeekReceipt> receipts;
  final num sugar, junk, total, saved;
  final int cubes, cubesSaved, normCubes;
  final double ratio;
  final List<(String, num)> sources;
  const WeekStats({
    required this.days,
    required this.receipts,
    required this.sugar,
    required this.cubes,
    required this.junk,
    required this.total,
    required this.saved,
    required this.cubesSaved,
    required this.normCubes,
    required this.ratio,
    required this.sources,
  });
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
  final bySource = <String, num>{};
  num sugar = 0, junk = 0, total = 0, saved = 0;
  var cubesSaved = 0;

  for (final entry in entries) {
    final day = byIso[entry.date];
    final receipt = receiptOf(entry);
    if (day == null || receipt == null) continue;
    final a = analyze(receipt, entry.swaps), base = analyze(receipt);
    receipts.add(WeekReceipt(entry, receipt, a, base));
    day.cubes += a.cubes;
    sugar += a.sugar;
    junk += a.junk;
    total += a.total;
    saved += base.total - a.total;
    cubesSaved += base.cubes - a.cubes;
    for (final it in a.items) {
      if (it.active.s > 0)
        bySource[it.active.n] = (bySource[it.active.n] ?? 0) + it.active.s;
    }
  }

  final normCubes = (familyDailyG(p) * 7 / cubeG).round();
  final cubes = (sugar / cubeG).round();
  final sources = [for (final e in bySource.entries) (e.key, e.value)]
    ..sort((a, b) => b.$2.compareTo(a.$2));
  return WeekStats(
    days: days,
    receipts: receipts,
    sugar: sugar,
    cubes: cubes,
    junk: junk,
    total: total,
    saved: saved,
    cubesSaved: cubesSaved,
    normCubes: normCubes,
    ratio: normCubes > 0 ? cubes / normCubes : 0,
    sources: sources.take(4).toList(),
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
    Badge(
      'bomb',
      'bomb',
      'Сахарная бомба',
      'Найди чек с оценкой ниже 40',
      bomb,
    ),
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

class SwapRow {
  final int i;
  final String from, to, cubes, price;
  const SwapRow(this.i, this.from, this.to, this.cubes, this.price);
}

List<SwapRow> swapRows(Receipt r) => [
  for (var i = 0; i < r.items.length; i++)
    if (r.items[i].swap != null)
      SwapRow(
        i,
        r.items[i].n,
        r.items[i].swap!.n,
        _signed(
          cubesOf(r.items[i].s) - cubesOf(r.items[i].swap!.s),
          (n) => cubesTxt(n.round()),
        ),
        _signed(r.items[i].p - r.items[i].swap!.p, money),
      ),
];

class SourceRow {
  final int i, cells;
  final String name, grams, cubes, swapTo;
  final double width;
  final bool off;
  const SourceRow(
    this.i,
    this.name,
    this.grams,
    this.cubes,
    this.width,
    this.cells,
    this.off,
    this.swapTo,
  );
}

/// «Это как…»: понятные сравнения для количества сахара.
class Equivalent {
  final String icon, value, label;
  const Equivalent(this.icon, this.value, this.label);
}

String _fix1(double v) => v >= 10
    ? v.round().toString()
    : v.toStringAsFixed(1).replaceAll('.', ',').replaceAll(',0', '');

List<Equivalent> equivalents(num sugarG) {
  if (sugarG < 5) return const [];
  final cans = sugarG / 35; // банка колы 0,33 л ≈ 35 г сахара
  final walkMin =
      sugarG *
      4 /
      4.5; // 4 ккал в грамме сахара, быстрая ходьба ≈ 4,5 ккал в минуту
  final spoons = sugarG / 25; // столовая ложка с горкой ≈ 25 г
  return [
    Equivalent('can', _fix1(cans), 'банок колы по 0,33 л'),
    Equivalent(
      'walk',
      walkMin >= 90 ? '${_fix1(walkMin / 60)} ч' : '${walkMin.round()} мин',
      'быстрой ходьбы, чтобы сжечь',
    ),
    Equivalent('spoon', _fix1(spoons), 'столовых ложек сахара с горкой'),
  ];
}

class ResultModel {
  final Analysis analysis, base;
  final List<int> swaps;
  final int maxCubes;
  final Tone tone, junkTone;
  final String pill, junkSum, junkShare, junkOf, junkDays, shareText;
  final ({String points, String label, String money})? summary;
  final List<SourceRow> sources;
  const ResultModel({
    required this.analysis,
    required this.base,
    required this.swaps,
    required this.maxCubes,
    required this.tone,
    required this.pill,
    required this.summary,
    required this.sources,
    required this.junkTone,
    required this.junkSum,
    required this.junkShare,
    required this.junkOf,
    required this.junkDays,
    required this.shareText,
  });
}

ResultModel resultModel(Receipt receipt, Iterable<int> swaps) {
  final on = swaps.toSet();
  final base = analyze(receipt), a = analyze(receipt, on);
  final v = verdict(a.score);
  final low = v.label.toLowerCase();
  final save = base.total - a.total;

  final src = [
    for (var i = 0; i < receipt.items.length; i++)
      if (receipt.items[i].s > 0) i,
  ]..sort((x, y) => receipt.items[y].s.compareTo(receipt.items[x].s));
  final maxS = src.isEmpty ? 1 : receipt.items[src.first].s;
  final sources = [
    for (final i in src)
      () {
        final it = receipt.items[i];
        final c = cubesOf(it.s);
        return SourceRow(
          i,
          it.n,
          '${it.s} г',
          c > 0 ? cubesTxt(c) : 'меньше кубика',
          max(4.0, it.s / maxS * 100),
          max(1, c),
          a.items[i].swapped,
          it.swap != null ? '${it.swap!.n} — ${it.swap!.s} г' : '',
        );
      }(),
  ];

  final d = a.days.round();
  var share =
      'Мой чек в «Чек-ап»: ${a.cubes} ${pl(a.cubes, cubesF)} сахара, оценка ${a.score} из 100 — $low.';
  if (on.isNotEmpty && base.cubes > a.cubes) {
    share +=
        ' С заменами минус ${cubesTxt(base.cubes - a.cubes)}${save > 0 ? ' и ${money(save)} экономии' : ''}.';
  }
  share += ' А сколько сахара в твоей корзине?';

  return ResultModel(
    analysis: a,
    base: base,
    swaps: on.toList()..sort(),
    maxCubes: max(1, max(base.cubes, a.cubes)),
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
        ? 'Сахара в чеке — на $d ${pl(d, daysF)} для одного взрослого'
        : 'Сахара в чеке меньше дневной нормы взрослого',
    shareText: share,
  );
}

// Стрик «недели подряд» (перенос web/src/lib/streak.ts: те же правила, их сверяют тесты).
// Неделя засчитана, если семья закрыла её. Количество сахара на стрик не влияет — только на вид кубика недели.
import 'calendar.dart';

/// Закрытие недели: closed — «внёс все чеки», none — «покупок не было», open — закрытие отменили.
class WeekMark {
  final String week, state;
  final int updatedAt;
  const WeekMark(this.week, this.state, this.updatedAt);
  Map<String, dynamic> toJson() => {
    'week': week,
    'state': state,
    'updatedAt': updatedAt,
  };
  static WeekMark? tryJson(Object? j) =>
      j is Map &&
          j['week'] is String &&
          isIso(j['week']) &&
          const ['closed', 'none', 'open'].contains(j['state'])
      ? WeekMark(j['week'], j['state'], (j['updatedAt'] as num?)?.toInt() ?? 0)
      : null;
}

typedef WeekFact = ({int receipts, double ratio});

const freezeEvery = 4, freezeMax = 2;
const milestones = [4, 12, 26, 52];

/// До конца понедельника можно закрыть прошлую неделю.
int closeDeadline(String week) => endOfDay(addDays(week, 7));

/// full — в норме, outline — выше нормы, none — без покупок, frozen — на заморозке, miss — сгорела, now — идёт, late — ещё можно закрыть
class WeekCell {
  final String week, kind;
  const WeekCell(this.week, this.kind);
}

class Streak {
  final int current, best, freezes, total, level;
  final int? next;
  final List<WeekCell> cells;
  const Streak({
    this.current = 0,
    this.best = 0,
    this.freezes = 0,
    this.total = 0,
    this.level = 0,
    this.next = 4,
    this.cells = const [],
  });

  static Streak? tryJson(Object? j) {
    if (j is! Map || j['cells'] is! List) return null;
    int n(String k) => (j[k] as num?)?.toInt() ?? 0;
    return Streak(
      current: n('current'),
      best: n('best'),
      freezes: n('freezes'),
      total: n('total'),
      level: n('level'),
      next: (j['next'] as num?)?.toInt(),
      cells: [
        for (final c in j['cells'] as List)
          if (c is Map && c['week'] is String && c['kind'] is String)
            WeekCell(c['week'], c['kind']),
      ],
    );
  }

  Map<String, dynamic> toJson() => {
    'current': current,
    'best': best,
    'freezes': freezes,
    'total': total,
    'level': level,
    'next': next,
    'cells': [
      for (final c in cells) {'week': c.week, 'kind': c.kind},
    ],
  };
}

String? weekKind(WeekMark? mark, WeekFact? fact) {
  final has = (fact?.receipts ?? 0) > 0;
  if (mark?.state == 'none' && !has) return 'none';
  if ((mark?.state == 'closed' || mark?.state == 'none') && has) {
    return fact!.ratio <= 1 ? 'full' : 'outline';
  }
  return null;
}

Streak computeStreak(
  List<WeekMark> marks,
  Map<String, WeekFact> facts, {
  int? now,
  int show = 12,
}) {
  final ms = now ?? nowMs();
  final byWeek = {for (final m in marks) m.week: m};
  final thisWeek = weekOf(todayIso(ms));
  final counted = [
    for (final m in marks)
      if (m.week.compareTo(thisWeek) <= 0 && weekKind(m, facts[m.week]) != null)
        m.week,
  ]..sort();
  var current = 0, best = 0, freezes = 0, total = 0;
  final cells = <WeekCell>[];
  if (counted.isEmpty) {
    cells.add(WeekCell(thisWeek, 'now'));
  } else {
    for (var w = counted.first; w.compareTo(thisWeek) <= 0; w = nextWeek(w)) {
      final kind = weekKind(byWeek[w], facts[w]);
      if (kind != null) {
        current++;
        total++;
        if (current % freezeEvery == 0 && freezes < freezeMax) freezes++;
        if (current > best) best = current;
        cells.add(WeekCell(w, kind));
      } else if (w == thisWeek) {
        cells.add(WeekCell(w, 'now'));
      } else if (ms <= closeDeadline(w)) {
        cells.add(WeekCell(w, 'late'));
      } else if (freezes > 0 && current > 0) {
        freezes--;
        cells.add(WeekCell(w, 'frozen'));
      } else {
        current = 0;
        freezes = 0;
        cells.add(WeekCell(w, 'miss'));
      }
    }
  }
  return Streak(
    current: current,
    best: best,
    freezes: freezes,
    total: total,
    level: milestones.lastWhere((m) => best >= m, orElse: () => 0),
    next: milestones.where((m) => m > current).firstOrNull,
    cells: cells.length > show ? cells.sublist(cells.length - show) : cells,
  );
}

/// Какую неделю сейчас предлагаем закрыть: в понедельник — прошлую, если она открыта, иначе текущую.
String weekToClose(
  List<WeekMark> marks,
  Map<String, WeekFact> facts, {
  int? now,
}) {
  final ms = now ?? nowMs();
  final thisWeek = weekOf(todayIso(ms));
  final prev = addDays(thisWeek, -7);
  final mark = marks.where((m) => m.week == prev).firstOrNull;
  final open = weekKind(mark, facts[prev]) == null;
  final started =
      marks.any((m) => m.week.compareTo(thisWeek) < 0 && m.state != 'open') ||
      (facts[prev]?.receipts ?? 0) > 0;
  return open && started && ms <= closeDeadline(prev) ? prev : thisWeek;
}

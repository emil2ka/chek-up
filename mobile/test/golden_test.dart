// Сверка с сайтом: те же данные, что в web/src/lib/golden.test.ts, дают те же числа.
import 'dart:convert';
import 'dart:io';

import 'package:chek_up/core/calendar.dart';
import 'package:chek_up/core/cart.dart';
import 'package:chek_up/core/engine.dart';
import 'package:chek_up/core/insights.dart';
import 'package:chek_up/core/models.dart';
import 'package:chek_up/core/plan.dart';
import 'package:chek_up/core/streak.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  final g =
      jsonDecode(File('test/golden.json').readAsStringSync())
          as Map<String, dynamic>;
  final entries = [
    for (final j in g['entries'] as List) HistoryEntry.tryJson(j)!,
  ];
  final p = Profile(adults: g['profile']['adults'], kids: g['profile']['kids']);
  final marks = [for (final j in g['marks'] as List) WeekMark.tryJson(j)!];
  final facts = weekFacts(entries, p);
  final now = g['now'] as int;

  test('чек туда и обратно', () {
    for (final e in entries) {
      expect(
        HistoryEntry.tryJson(jsonDecode(jsonEncode(e.toJson())))!.toJson(),
        e.toJson(),
      );
    }
  });

  test('analyze', () {
    for (final (i, e) in entries.indexed) {
      final a = analyze(e.receipt!, e.swaps, e.off);
      final w = g['analyze'][i] as Map;
      expect(a.score, w['score'], reason: e.id);
      expect(
        (a.total, a.food, a.junk, a.offCount, a.flaggedSum),
        (w['total'], w['food'], w['junk'], w['off'], w['flagged']),
        reason: e.id,
      );
      for (final m in metricIds) {
        expect(a.totals[m], closeTo(w['totals'][m.name], 1e-9), reason: e.id);
        expect(a.cubesBy[m], w['cubes'][m.name], reason: e.id);
      }
      expect(
        [
          for (final x in a.why) [x.k, x.pts],
        ],
        w['why'],
        reason: e.id,
      );
    }
  });

  test('недели', () {
    final want = g['facts'] as Map;
    expect(facts.keys.toSet(), want.keys.toSet());
    for (final f in facts.entries) {
      expect(f.value.receipts, want[f.key][0]);
      expect(f.value.ratio, closeTo(want[f.key][1], 2e-6));
    }
    for (final w in g['weeks'] as List) {
      final s = weekStats(entries, p, week: w['week'], now: now);
      expect(
        [
          s.total,
          s.food,
          s.junk,
          s.flagged,
          s.saved,
          s.cubesSaved,
          s.guests,
          s.receipts.length,
          s.refunds.length,
        ],
        [
          for (final k in [
            'total',
            'food',
            'junk',
            'flagged',
            'saved',
            'cubesSaved',
            'guests',
            'n',
            'refunds',
          ])
            w[k],
        ],
        reason: w['week'],
      );
      final m = s.metrics[MetricId.sugar]!;
      expect(m.total, closeTo(w['sugar'], 1e-9));
      expect(s.metrics[MetricId.salt]!.total, closeTo(w['salt'], 1e-9));
      expect(m.fromStock, closeTo(w['stock'], 1e-9));
      expect(
        [for (final x in m.sources) x.$2],
        [for (final x in w['sources'] as List) closeTo(x[1], 1e-9)],
      );
      expect(
        [for (final d in s.days) d.amounts[MetricId.sugar]],
        [for (final x in w['days'] as List) closeTo(x, 1e-9)],
      );
    }
  });

  test('месяц', () {
    final m = monthStats(entries, '2026-10'), w = g['month'] as Map;
    expect(
      [m.receipts, m.total, m.food, m.junk, m.cubes, m.saved],
      [
        for (final k in ['receipts', 'total', 'food', 'junk', 'cubes', 'saved'])
          w[k],
      ],
    );
    expect([
      for (final s in m.stores) [s.name, s.total, s.n],
    ], w['stores']);
  });

  test('подтверждённые замены', () {
    expect([
      for (final c in confirmedSwaps(entries, receiptOf))
        [c.planId, c.i, c.factId, c.money, c.saved[MetricId.sugar]],
    ], g['confirmed']);
  });

  test('стрик', () {
    final s = computeStreak(marks, facts, now: now), w = g['streak'] as Map;
    expect(
      [s.current, s.best, s.freezes, s.total, s.level, s.next],
      [
        for (final k in [
          'current',
          'best',
          'freezes',
          'total',
          'level',
          'next',
        ])
          w[k],
      ],
    );
    expect([
      for (final c in s.cells) [c.week, c.kind],
    ], w['cells']);
    for (final e in g['streakEdges'] as List) {
      final x = computeStreak(marks, facts, now: e[0]);
      expect([
        x.current,
        x.freezes,
        x.cells.map((c) => c.kind).join(','),
        weekToClose(marks, facts, now: e[0]),
      ], e.sublist(1));
    }
  });

  test('цель, полнота, дубли, похожесть', () {
    final goal = goalState(entries, p, marks, 10, week: '2026-11-23', now: now);
    expect({
      'base': goal.base,
      'average': goal.average,
      'target': goal.target,
      'now': goal.now,
    }, g['goal']);
    final c = completeness(entries, marks, '2026-11-16');
    expect({'now': c.now, 'usual': c.usual}, g['completeness']);
    expect([
      for (final r in g['dup'] as List)
        findDuplicate(Receipt.fromJson(r), entries, receiptOf)?.id,
    ], g['duplicates']);
    expect([
      for (final (k, e) in entries.take(24).indexed)
        () {
          final items = [
            for (final it in e.receipt!.items)
              k.isOdd ? it.copyWith(p: 0, swap: it.swap?.copyWith(p: 0)) : it,
          ];
          final c = Cart(
            id: e.id,
            kind: 'basket',
            store: '',
            date: e.date,
            createdAt: 0,
            items: items,
          );
          final list = cartMoves(items), d = decide(list), a = advise(c);
          final done = c.copyWith(out: d.out, swaps: d.swaps);
          return {
            'moves': [
              for (final m in list) [m.i, m.kind, m.metric.name, m.gain],
            ],
            'enough': a.enough,
            'metric': a.metric.name,
            'cubes': [a.before.cubes, a.after.cubes],
            'score': [cartAnalysis(c).score, cartAnalysis(done).score],
            'money': cartMoney(done),
            'week':
                (weekAdd(done, d.out, d.swaps, MetricId.sugar) * 1000).round() /
                1000,
          };
        }(),
    ], g['cart']);
    const foods = [
      'Кола 1 л',
      'Минералка с лимоном, 1 л',
      'Хлеб ржаной 400 г',
      'Чипсы 150 г',
      'Сахар-песок 1 кг',
      'Йогурт питьевой 270 г',
      'Кефир 1%, 900 мл',
      'Пиво светлое 0,5 л',
      'Порошок стиральный',
      'Яблоки весовые 1,2 кг',
      'Шоколад молочный 90 г',
      'Орехи и сухофрукты, 90 г',
    ];
    expect([
      for (final a in foods)
        for (final b in foods) sameFood(a, b) ? 1 : 0,
    ], g['same']);
  });

  test('даты Казахстана', () {
    expect(
      todayIso(DateTime.utc(2026, 11, 15, 20).millisecondsSinceEpoch),
      '2026-11-16',
    );
    expect(weekOf('2026-11-22'), '2026-11-16');
    expect(addDays('2026-02-28', 1), '2026-03-01');
    expect(weekTxt('2026-11-30'), '30 ноября – 6 декабря');
    expect(daysInMonth('2028-02'), 29);
    expect(addMonths('2026-01', -1), '2025-12');
    expect(isIso('2026-02-30'), isFalse);
  });
}

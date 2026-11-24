// Полнота казахского перевода: каждая строка из t('…') и каждая строка данных.
import 'dart:io';

import 'package:chek_up/core/calendar.dart';
import 'package:chek_up/core/catalog.dart';
import 'package:chek_up/core/engine.dart';
import 'package:chek_up/core/i18n.dart';
import 'package:chek_up/core/insights.dart';
import 'package:chek_up/core/kk.dart';
import 'package:chek_up/core/models.dart';
import 'package:chek_up/core/scan.dart';
import 'package:flutter_test/flutter_test.dart';

final _call = RegExp(r"(?<![\w.])t\(\s*'((?:[^'\\]|\\.)*)'");
// 'литерал', соседствующий с ? или : внутри t(…)
final _cyr = RegExp(r"'((?:[^'\\$]|\\.)*[а-яё](?:[^'\\$]|\\.)*)'");
String _unescape(String s) => s.replaceAll(r"\'", "'").replaceAll(r'\n', '\n');

void main() {
  tearDown(() => lang = Lang.ru);
  final files = Directory('lib')
      .listSync(recursive: true)
      .whereType<File>()
      .where((f) => f.path.endsWith('.dart') && !f.path.endsWith('kk.dart'))
      .toList();

  test('перевод есть у всех строк t(…)', () {
    final missing = <String>{};
    for (final f in files) {
      for (final m in _call.allMatches(f.readAsStringSync())) {
        final key = _unescape(m[1]!);
        if (!kk.containsKey(key)) missing.add(key);
      }
    }
    expect(missing, isEmpty);
  });

  test('перевод есть у данных', () {
    final data = <String>{
      for (final m in metricIds) ...[
        metrics[m]!.label,
        metrics[m]!.of,
        metrics[m]!.unit,
        metrics[m]!.norm,
        pileHints[m]!,
        unitNote(m),
      ],
      unitsNote,
      ...dowShort,
      ...monthsGen,
      ...monthNames,
      ...scanErrors.values,
      for (final f in [
        cubesF,
        sugarCubesF,
        weeksF,
        freezesF,
        positionsF,
        daysF,
        pointsF,
        junkF,
        receiptsF,
        receiptsDatF,
        adultsF,
        kidsF,
        productsF,
      ]) ...[f.$1, f.$2, f.$3],
      for (final c in catalog) ...[
        c.name,
        c.portion,
        if (c.swap != null) c.swap!,
      ],
      for (final (_, label) in cats) label,
      for (final b in badges(const [], const Profile(), const [], 0)) ...[
        b.title,
        b.desc,
      ],
    };
    expect(data.where((k) => !kk.containsKey(k)), isEmpty);
  });

  test('на экранах нет русских строк мимо перевода', () {
    final bad = <String>[];
    for (final f in files.where(
      (f) => f.path.contains('/screens/') || f.path.contains('/ui/'),
    )) {
      for (final (i, l) in f.readAsLinesSync().indexed) {
        final code = l.trimLeft();
        if (code.startsWith('//')) continue;
        for (final m in _cyr.allMatches(code)) {
          if (!kk.containsKey(_unescape(m[1]!).trim()) &&
              !const [
                'Русский',
                'Қазақша',
                'чек-ап',
                'ё',
                'е',
                'Мой чек',
              ].contains(m[1]) &&
              !m[1]!.startsWith('^(')) {
            bad.add('${f.path}:${i + 1} ${m[1]}');
          }
        }
      }
    }
    expect(bad, isEmpty);
  });

  test('язык переключается', () {
    expect(t('{n}% нормы', {'n': 40}), '40% нормы');
    lang = Lang.kk;
    expect(pl(21, cubesF), 'текше');
    expect(verdict(90).label, 'Тамаша');
    expect(dayTxt('2026-11-16'), '16 қараша');
    expect(monthTxt('2026-11'), '2026 ж. қараша');
    expect(t('{n}% нормы', {'n': 40}), 'норманың 40%-ы');
    expect(t('нет такой строки'), 'нет такой строки');
  });
}

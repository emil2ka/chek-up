// Каждый экран строится на размере телефона без ошибок вёрстки; расчёты совпадают с веб-версией.
import 'dart:io';

import 'package:chek_up/core/data.dart';
import 'package:chek_up/core/calendar.dart';
import 'package:chek_up/core/cart.dart';
import 'package:chek_up/core/engine.dart';
import 'package:chek_up/core/i18n.dart';
import 'package:chek_up/core/insights.dart';
import 'package:chek_up/core/models.dart';
import 'package:chek_up/core/store.dart';
import 'package:chek_up/screens/cart.dart';
import 'package:chek_up/screens/catalog.dart';
import 'package:chek_up/screens/edit.dart';
import 'package:chek_up/screens/home.dart';
import 'package:chek_up/screens/onboarding.dart';
import 'package:chek_up/screens/profile.dart';
import 'package:chek_up/screens/result.dart';
import 'package:chek_up/screens/shop_list.dart';
import 'package:chek_up/screens/week.dart';
import 'package:chek_up/ui/kit.dart';
import 'package:chek_up/ui/pile.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

Future<void> _font(String family, String path) async {
  final loader = FontLoader(family)
    ..addFont(Future.value(ByteData.sublistView(File(path).readAsBytesSync())));
  await loader.load();
}

void main() {
  setUpAll(() async {
    TestWidgetsFlutterBinding.ensureInitialized();
    await _font('Unbounded', 'assets/fonts/Unbounded.ttf');
    await _font('Manrope', 'assets/fonts/Manrope.ttf');
    await _font('Montserrat', 'assets/fonts/Montserrat-800.ttf');
    await _font('GolosText', 'assets/fonts/GolosText-600.ttf');
    SharedPreferences.setMockInitialValues({});
    await store.load();
    final today = todayIso();
    for (final (i, r) in demoReceipts.indexed) {
      final a = analyze(r, i == 0 ? [1] : []);
      store.saveEntry(
        HistoryEntry(
          id: 'h$i',
          receiptId: 'x${r.id}',
          store: r.store,
          date: today,
          cubes: a.cubes,
          score: a.score,
          swaps: i == 0 ? [1] : [],
          savedAt: i,
          receipt: Receipt(
            id: 'x${r.id}',
            title: r.title,
            store: r.store,
            date: today,
            items: r.items,
            approx: true,
          ),
        ),
      );
    }
    store.addToShop(const [
      ShopItem(name: 'Минералка без сахара, 1 л', instead: 'Кола, 1 л'),
    ]);
  });

  test('расчёты совпадают с веб-версией', () {
    final a = analyze(demoReceipts[0]);
    expect((a.cubes, a.score, a.total, a.junk), (73, 51, 12590, 6210));
    expect(verdict(a.score).label, 'Так себе');
    expect(metricIds.where(isCubeMetric), [MetricId.sugar]);
    expect(bigCap(a.totals[MetricId.fat]!, MetricId.fat), 'г насыщенных жиров');
    expect(
      [saltGrainCount(1.1), saltGrainCount(8), saltGrainCount(1e6)],
      [13, 96, 248],
    );
    expect(a.totals[MetricId.carbs], 1363);
    expect(a.totals[MetricId.protein], 545);
    expect(
      (a.flaggedCount, a.flaggedSum, a.alcoholSum, a.energySum),
      (2, 1240, 650, 590),
    );
    expect([for (final r in demoReceipts) analyze(r).score], [51, 29, 100]);
    expect(verdict(29).label, 'Корзина-бомба');
    expect(money(3490), '3\u00A0490\u00A0₸');
    expect(dateRu('2026-11-16'), '16 ноября');
    expect(
      [pl(1, cubesF), pl(3, cubesF), pl(11, cubesF), pl(21, cubesF)],
      ['кубик', 'кубика', 'кубиков', 'кубик'],
    );
    // пилюля показывает факт, план — отдельной строкой
    final m = resultModel(demoReceipts[0], [1]);
    expect(m.pill, '51 из 100 · так себе');
    expect(m.summary, isNotNull);
    final h = harmPrice(analyze(demoReceipts[0]), MetricId.salt);
    expect((h.spend, h.perUnit.round()), (10030, 494));
    expect(
      Receipt.fromJson(demoReceipts[1].toJson()).toJson(),
      demoReceipts[1].toJson(),
    );
    final old = Item.fromJson({'n': 'Кола', 'p': 620, 's': 106});
    expect(old.valueOf(MetricId.protein), 0);
    expect(old.toJson().containsKey('b'), isFalse);
    expect(swapRows(demoReceipts[0], MetricId.carbs).first.cubes, '−106 г');
  });

  for (final size in const [Size(375, 812), Size(320, 568), Size(430, 932)]) {
    final screens = <String, Widget Function()>{
      'главная': () => HomeScreen(onWeek: () {}),
      'неделя': () => WeekScreen(onProfile: () {}),
      'продукты': () => const CatalogScreen(),
      'профиль': () => ProfileScreen(onReplayIntro: () {}),
      'знакомство': () => Onboarding(onDone: () {}),
      'результат': () => const ResultPage(entryId: 'h1'),
      'правка': () =>
          EditSheet(receipt: demoReceipts[0], off: const [1], onDelete: () {}),
      'список': () => const ShopListPage(),
      'корзина': () => CartPage(id: carts.demo().id),
    };
    for (final (e, kk) in [
      for (final e in screens.entries) ...[(e, false), (e, true)],
    ]) {
      testWidgets(
        '${e.key} ${kk ? 'қаз ' : ''}${size.width.round()}×${size.height.round()}',
        (t) async {
          lang = kk ? Lang.kk : Lang.ru;
          addTearDown(() => lang = Lang.ru);
          t.view.physicalSize = size;
          t.view.devicePixelRatio = 1;
          addTearDown(t.view.reset);
          await t.pumpWidget(
            MaterialApp(
              theme: ThemeData(fontFamily: 'Manrope'),
              home: Scaffold(
                body: DecoratedBox(
                  decoration: const BoxDecoration(gradient: sky),
                  child: ToastHost(child: e.value()),
                ),
              ),
            ),
          );
          for (var i = 0; i < 40; i++) {
            await t.pump(const Duration(milliseconds: 100));
          }
          expect(t.takeException(), isNull);
          if (!kk && ['неделя', 'результат', 'продукты'].contains(e.key)) {
            for (final label in [
              'Белки',
              'Углеводы',
              'Соль',
              'Калории',
              'Жиры',
              'Сахар',
            ]) {
              final tab = find.text(label).first;
              await t.ensureVisible(tab);
              await t.tap(tab);
              await t.pump(const Duration(milliseconds: 100));
              if (e.key == 'результат') {
                final pile = find.byType(SugarPile);
                expect(pile, findsOneWidget);
                for (var frame = 0; frame < 27; frame++) {
                  await t.pump(const Duration(milliseconds: 100));
                }
                await t.tapAt(
                  t.getRect(pile).bottomCenter - const Offset(0, 30),
                );
                await t.pump(const Duration(milliseconds: 100));
              }
              expect(t.takeException(), isNull, reason: label);
            }
          }
          await t.pumpWidget(const SizedBox());
          await t.pump(const Duration(seconds: 6));
        },
      );
    }
  }
}

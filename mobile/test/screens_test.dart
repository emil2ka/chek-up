// Каждый экран строится на размере телефона без ошибок вёрстки; расчёты совпадают с веб-версией.
import 'dart:io';

import 'package:chek_up/core/data.dart';
import 'package:chek_up/core/engine.dart';
import 'package:chek_up/core/insights.dart';
import 'package:chek_up/core/models.dart';
import 'package:chek_up/core/store.dart';
import 'package:chek_up/screens/catalog.dart';
import 'package:chek_up/screens/home.dart';
import 'package:chek_up/screens/onboarding.dart';
import 'package:chek_up/screens/profile.dart';
import 'package:chek_up/screens/result.dart';
import 'package:chek_up/screens/shop_list.dart';
import 'package:chek_up/screens/week.dart';
import 'package:chek_up/ui/kit.dart';
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
    SharedPreferences.setMockInitialValues({});
    await store.load();
    final today = isoOf(DateTime.now());
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
      ShopItem(name: 'Минералка с лимоном, 1 л', instead: 'Кола, 1 л'),
    ]);
  });

  test('расчёты совпадают с веб-версией', () {
    final a = analyze(demoReceipts[0]);
    expect((a.cubes, a.score, a.total, a.junk), (73, 45, 12590, 6210));
    expect(verdict(a.score).label, 'Так себе');
    expect(a.cubesBy, {
      MetricId.sugar: 73,
      MetricId.salt: 41,
      MetricId.fat: 50,
      MetricId.kcal: 54,
    });
    expect(
      (a.flaggedCount, a.flaggedSum, a.alcoholSum, a.energySum),
      (2, 1240, 650, 590),
    );
    expect([for (final r in demoReceipts) analyze(r).score], [45, 34, 92]);
    expect(verdict(34).label, 'Корзина-бомба');
    expect(money(3490), '3 490 ₸');
    expect(dateRu('2026-11-16'), '16 ноября');
    expect(
      [pl(1, cubesF), pl(3, cubesF), pl(11, cubesF), pl(21, cubesF)],
      ['кубик', 'кубика', 'кубиков', 'кубик'],
    );
    expect(resultModel(demoReceipts[0], [1]).pill, '51 из 100 · так себе');
    // сверка с веб-версией (web/src/lib/engine.test.ts): те же чеки — те же числа
    const sheet = {
      'week': (
        45,
        {
          MetricId.sugar: 73,
          MetricId.salt: 41,
          MetricId.fat: 50,
          MetricId.kcal: 54,
        },
      ),
      'party': (
        34,
        {
          MetricId.sugar: 192,
          MetricId.salt: 53,
          MetricId.fat: 129,
          MetricId.kcal: 76,
        },
      ),
      'fit': (
        92,
        {
          MetricId.sugar: 8,
          MetricId.salt: 8,
          MetricId.fat: 35,
          MetricId.kcal: 48,
        },
      ),
    };
    for (final r in demoReceipts) {
      final a = analyze(r);
      expect(a.score, sheet[r.id]!.$1, reason: r.id);
      expect(a.cubesBy, sheet[r.id]!.$2, reason: r.id);
    }
    final h = harmPrice(analyze(demoReceipts[0]), MetricId.salt);
    expect((h.spend, h.cubes, h.perCube.round()), (6980, 39, 179));
    expect(
      [for (final t in h.top) t.name],
      ['Филе куриное, 1 кг', 'Колбаса варёная, 400 г', 'Чипсы, 150 г'],
    );
    expect(
      Receipt.fromJson(demoReceipts[1].toJson()).items.length,
      demoReceipts[1].items.length,
    );
  });

  for (final size in const [Size(375, 812), Size(320, 568), Size(430, 932)]) {
    final screens = <String, Widget Function()>{
      'главная': () => const HomeScreen(),
      'неделя': () => WeekScreen(onProfile: () {}),
      'продукты': () => const CatalogScreen(),
      'профиль': () => ProfileScreen(onReplayIntro: () {}),
      'знакомство': () => Onboarding(onDone: () {}),
      'результат': () => ResultPage(
        receipt: demoReceipts[1],
        entryId: 'h1',
        swaps: const [0, 1],
      ),
      'список': () => const ShopListPage(),
    };
    for (final e in screens.entries) {
      testWidgets('${e.key} ${size.width.round()}×${size.height.round()}', (
        t,
      ) async {
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
        await t.pumpWidget(const SizedBox());
        await t.pump(const Duration(seconds: 6));
      });
    }
  }
}

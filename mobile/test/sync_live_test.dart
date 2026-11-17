// Живая проверка общего сервера и БД: «телефон» и «второе устройство» (веб или другой телефон) видят одни данные.
// Запуск при работающем сервере:
//   flutter test test/sync_live_test.dart --dart-define=API_URL=http://localhost:5197
// Без API_URL тест пропускается.
import 'package:chek_up/core/api.dart';
import 'package:chek_up/core/data.dart';
import 'package:chek_up/core/engine.dart';
import 'package:chek_up/core/models.dart';
import 'package:chek_up/core/store.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  test(
    'два устройства через код связывания',
    () async {
      SharedPreferences.setMockInitialValues({});
      final phone = AppStore();
      await phone.load();
      final r = demoReceipts[0];
      final a = analyze(r, [1]);
      final now = DateTime.now().millisecondsSinceEpoch;
      phone.saveEntry(
        HistoryEntry(
          id: 'live-${phone.newId()}',
          receiptId: r.id,
          store: r.store,
          date: isoOf(DateTime.now()),
          cubes: a.cubes,
          score: a.score,
          swaps: [1],
          savedAt: now,
        ),
      );
      phone.addToShop([
        const ShopItem(name: 'Минералка (live-тест)', instead: 'Кола, 1 л'),
      ]);
      phone.updateProfile(
        phone.profile.copyWith(adults: 2, kids: 1, onboarded: true),
      );
      await phone.sync();
      expect(phone.syncStatus.value, SyncStatus.idle, reason: phone.syncError);

      final code = await phone.linkCode();
      expect(code, matches(RegExp(r'^[A-Z2-9]{4}-[A-Z2-9]{4}$')));

      // «второе устройство»: чистая память, входит по коду
      SharedPreferences.setMockInitialValues({});
      final other = AppStore();
      await other.load();
      await other.redeemLinkCode(code);
      expect(other.syncStatus.value, SyncStatus.idle, reason: other.syncError);
      expect(other.history.map((e) => e.id), contains(phone.history.first.id));
      expect(other.history.first.cubes, a.cubes);
      expect(other.shop.map((s) => s.name), contains('Минералка (live-тест)'));
      expect(other.profile.adults, 2);
      expect(other.profile.kids, 1);

      // второе устройство удаляет чек и отмечает покупку → телефон это видит
      other.removeEntry(other.history.first.id);
      other.toggleShop(0);
      await other.sync();
      SharedPreferences.setMockInitialValues({});
      await phone.sync();
      expect(phone.history.where((e) => e.id.startsWith('live-')), isEmpty);
      expect(
        phone.shop.firstWhere((s) => s.name.contains('live-тест')).done,
        isTrue,
      );
      expect(phone.shopDone, greaterThanOrEqualTo(1));

      // код одноразовый
      final third = AppStore();
      await expectLater(
        third.redeemLinkCode(code),
        throwsA(isA<ApiException>()),
      );
    },
    skip: apiUrl.isEmpty ? 'нужен API_URL' : false,
    timeout: const Timeout(Duration(seconds: 60)),
  );

  test(
    'цены между магазинами: чек одного человека помогает другому',
    () async {
      SharedPreferences.setMockInitialValues({});
      final a = AppStore();
      await a.load();
      final today = isoOf(DateTime.now());
      // отсканированный чек из «Small»: с солью, жирами, калориями и алкоголем
      final scanned = Receipt(
        id: 'scan-live-${a.newId()}',
        title: 'Чек из Small',
        store: 'Small',
        date: today,
        approx: true,
        items: const [
          Item(
            n: 'Колбаса докторская 400 г',
            p: 1200,
            s: 0,
            t: 8.8,
            f: 36,
            k: 1160,
            junk: true,
          ),
          Item(
            n: 'Пиво светлое 0,5 л',
            p: 500,
            s: 0,
            t: 0.1,
            k: 215,
            junk: true,
            x: 'alcohol',
          ),
        ],
      );
      a.saveEntry(
        HistoryEntry(
          id: 'live-${a.newId()}',
          receiptId: scanned.id,
          store: 'Small',
          date: today,
          cubes: 0,
          score: 50,
          swaps: const [],
          savedAt: DateTime.now().millisecondsSinceEpoch,
          receipt: scanned,
        ),
      );
      await a.sync();
      expect(a.syncStatus.value, SyncStatus.idle, reason: a.syncError);

      // другой человек, другой магазин, дороже
      SharedPreferences.setMockInitialValues({});
      final b = AppStore();
      await b.load();
      final res = await b.priceOffers(
        const Receipt(
          id: 'x',
          title: '',
          store: 'Magnum',
          date: '2026-11-17',
          items: [Item(n: 'Колбаса докторская 400 г', p: 1480, s: 0)],
        ),
      );
      expect(res, isNotNull);
      expect(res!.offers, isNotEmpty);
      expect(res.offers.first.store, 'Small');
      expect(res.offers.first.saving, greaterThan(100));

      // новые поля чека доехали на сервер и вернулись
      final c = AppStore();
      await c.load();
      final code = await a.linkCode();
      await c.redeemLinkCode(code);
      final back = c.history
          .firstWhere((e) => e.receipt?.id == scanned.id)
          .receipt!;
      expect(back.items[0].t, 8.8);
      expect(back.items[1].x, 'alcohol');
      expect(analyze(back).flaggedSum, 500);
    },
    skip: apiUrl.isEmpty ? 'нужен API_URL' : false,
    timeout: const Timeout(Duration(seconds: 60)),
  );
}

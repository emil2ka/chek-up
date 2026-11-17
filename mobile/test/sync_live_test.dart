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
}

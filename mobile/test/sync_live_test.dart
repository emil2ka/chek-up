// Живая проверка общего сервера и БД: «телефон» и «второе устройство» (веб или другой телефон) видят одни данные.
// Запуск при работающем сервере:
//   flutter test test/sync_live_test.dart --dart-define=API_URL=http://localhost:5197
// Без API_URL тест пропускается.
import 'package:chek_up/core/api.dart';
import 'package:chek_up/core/calendar.dart';
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
          date: todayIso(),
          cubes: a.cubes,
          score: a.score,
          swaps: [1],
          savedAt: now,
          receipt: r,
        ),
      );
      phone.addToShop([
        const ShopItem(name: 'Минералка (live-тест)', instead: 'Кола, 1 л'),
      ]);
      phone.updateFamily(adults: 2, kids: 1);
      phone.updateMe(onboarded: true);
      phone.setMark(weekOf(todayIso()), 'closed');
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
      expect(other.history.first.receipt?.items[1].c, 106);
      expect(other.history.first.receipt?.items[1].swap?.b, 0);
      expect(other.shop.map((s) => s.name), contains('Минералка (live-тест)'));
      expect(other.profile.adults, 2);
      expect(other.profile.kids, 1);
      expect(other.streak.current, 1);
      expect(other.family.streak?.current, 1);

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
    'семья: приглашение, личный чек, ребёнок, выход',
    () async {
      SharedPreferences.setMockInitialValues({});
      final mum = AppStore();
      await mum.load();
      await mum.sync();
      await mum.rename('Айгуль');
      Receipt r(String id, num price) => Receipt(
        id: id,
        title: 'Чек',
        store: 'Magnum',
        date: todayIso(),
        items: [
          Item(n: 'Кола 1 л', p: price, s: 106, k: 420, junk: true),
          const Item(n: 'Вино', p: 3000, s: 0, k: 400, x: 'alcohol'),
        ],
      );
      mum.saveReceipt(r('live-a-${mum.newId()}', 600));
      final own = mum.saveReceipt(r('live-b-${mum.newId()}', 1700));
      mum.saveEntry(mum.entry(own.id)!.copyWith(priv: true));
      await mum.sync();
      final code = await mum.createInvite('child');

      SharedPreferences.setMockInitialValues({});
      final kid = AppStore();
      await kid.load();
      await kid.sync();
      final info = await kid.previewInvite(code);
      expect((info.role, info.invitedBy, info.members), ('child', 'Айгуль', 1));
      await kid.joinFamily(code, share: true);
      expect(kid.isChild, isTrue);
      expect(kid.history, hasLength(1), reason: 'личный чек не виден');
      final seen = kid.history.single;
      expect(seen.receipt!.masked, isTrue);
      expect(seen.receipt!.items.every((it) => it.p == 0), isTrue);
      expect(seen.receipt!.items.any((it) => it.n.contains('Вино')), isFalse);
      expect(kid.authorOf(seen), 'Айгуль');
      expect(kid.bestStreak, mum.bestStreak);

      // чек ребёнка виден маме
      kid.saveReceipt(r('live-c-${kid.newId()}', 450));
      await kid.sync();
      await mum.sync();
      expect(mum.history, hasLength(3));
      expect(mum.history.where((e) => !mum.isMine(e)), hasLength(1));

      // вышел: свои чеки с ним, чужих нет
      await kid.leaveFamily();
      expect(kid.isChild, isFalse);
      expect(kid.history.every(kid.isMine), isTrue);
      expect(kid.history, hasLength(1));
      await mum.deleteAccount();
      expect(mum.history, isEmpty);
      await kid.deleteAccount();
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
      final today = todayIso();
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

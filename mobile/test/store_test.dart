// Журнал, синхронизация и очередь чеков без телефона: сервер — заглушка, которая помнит присланное.
import 'dart:convert';
import 'dart:typed_data';

import 'package:chek_up/core/api.dart';
import 'package:chek_up/core/calendar.dart';
import 'package:chek_up/core/models.dart';
import 'package:chek_up/core/outbox.dart';
import 'package:chek_up/core/reminder.dart';
import 'package:chek_up/core/store.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';

Receipt rec(String id, {num price = 600, String date = '2026-11-23'}) =>
    Receipt(
      id: id,
      title: 'Чек',
      store: 'Magnum',
      date: date,
      items: [Item(n: 'Кола 1 л', p: price, s: 106, k: 420)],
    );
HistoryEntry draft(String id, {num price = 600}) => HistoryEntry(
  id: id,
  receiptId: 'r$id',
  store: 'Magnum',
  date: '2026-11-23',
  cubes: 21,
  score: 40,
  swaps: const [],
  savedAt: 1,
  receipt: rec('r$id', price: price),
);

class FakeServer {
  final saved = <String, Map<String, dynamic>>{};
  final calls = <({String path, Map<String, dynamic>? body, String? token})>[];
  Map<String, dynamic> extra = {};
  bool offline = false;
  Set<String> dead = {};
  int guests = 0;
  void Function(Map<String, dynamic>? body)? during;
  http.Response Function(http.BaseRequest)? scan;

  Map<String, dynamic> state() => {
    'cursor': 1,
    'full': false,
    'me': {'id': 'me', 'name': '', 'email': '', 'role': 'owner'},
    'family': {
      'id': 'f1',
      'name': '',
      'adults': 2,
      'kids': 1,
      'goal': 0,
      'updatedAt': 5,
      'members': <Object>[],
    },
    'profile': {
      'onboarded': true,
      'seen': <String>[],
      'lang': 'ru',
      'updatedAt': 1,
    },
    'history': saved.values.toList(),
    'shop': <Object>[],
    'weeks': <Object>[],
    'stats': {'barcodes': 0, 'shopDone': 0, 'bestWeeks': 0},
    'streak': {
      'current': 0,
      'best': 0,
      'freezes': 0,
      'total': 0,
      'level': 0,
      'next': 4,
      'cells': <Object>[],
    },
    ...extra,
  };

  Future<http.StreamedResponse> handle(
    http.BaseRequest r,
    http.ByteStream stream,
  ) async {
    if (offline) throw http.ClientException('нет сети');
    final token = r.headers['authorization']?.substring(7);
    final raw = await stream.toBytes();
    Map<String, dynamic>? body;
    if (r.headers['content-type']?.startsWith('application/json') ?? false) {
      body = raw.isEmpty ? null : jsonDecode(utf8.decode(raw));
    }
    calls.add((path: r.url.path, body: body, token: token));
    http.Response res;
    if (r.url.path == '/api/auth/anonymous') {
      guests++;
      res = _json({'token': 'cu_$guests', 'userId': 'u$guests'}, 201);
    } else if (dead.contains(token)) {
      res = _json({
        'error': {'code': 'unauthorized', 'message': 'Нужен вход'},
      }, 401);
    } else if (r.url.path == '/api/scan') {
      res = scan!(r);
    } else if (r.url.path == '/api/sync') {
      during?.call(body);
      for (final h in (body?['history'] as List? ?? const [])) {
        saved[h['id']] = h;
      }
      res = _json(state());
    } else {
      res = _json({});
    }
    return http.StreamedResponse(
      Stream.value(res.bodyBytes),
      res.statusCode,
      headers: res.headers,
    );
  }
}

http.Response _json(Object o, [int status = 200]) => http.Response.bytes(
  utf8.encode(jsonEncode(o)),
  status,
  headers: {'content-type': 'application/json'},
);

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late FakeServer server;
  setUp(() {
    apiUrlOverride = 'http://test.local';
    server = FakeServer();
    SharedPreferences.setMockInitialValues({});
  });
  tearDown(() => apiUrlOverride = null);

  Future<void> run(Future<void> Function() body) => http.runWithClient(
    body,
    () => MockClient.streaming((r, s) => server.handle(r, s)),
  );
  Iterable<({String path, Map<String, dynamic>? body, String? token})>
  syncs() => server.calls.where((c) => c.path == '/api/sync');

  test(
    'отправляет только изменённое, потом снимает отметки',
    () => run(() async {
      final s = AppStore();
      await s.load();
      s.saveEntry(draft('a'));
      await s.sync();
      expect((syncs().first.body!['history'] as List).length, 1);
      expect(s.dirty, isEmpty);
      server.calls.clear();
      await s.sync();
      expect(syncs().first.body!.containsKey('history'), isFalse);
      expect(syncs().first.body!['since'], 1);
      expect(s.profile.adults, 2);
    }),
  );

  test(
    'правка во время запроса не теряется',
    () => run(() async {
      final s = AppStore();
      await s.load();
      s.saveEntry(draft('a'));
      server.during = (body) {
        if ((body?['history'] as List?)?.first['score'] == 40) {
          s.saveEntry(s.entry('a')!.copyWith(score: 77));
        }
      };
      await s.sync();
      expect(s.entry('a')!.score, 77);
      expect(s.dirty, contains('h:a'));
      server.during = null;
      await s.sync();
      expect(server.saved['a']!['score'], 77);
      expect(s.dirty, isEmpty);
    }),
  );

  test(
    'без сети ничего не пропадает',
    () => run(() async {
      final s = AppStore();
      await s.load();
      server.offline = true;
      s.saveEntry(draft('a'));
      s.setMark('2026-11-23', 'closed');
      await s.sync();
      expect(s.syncStatus.value, SyncStatus.error);
      expect(s.dirty.keys, containsAll(['h:a', 'w:2026-11-23']));
      server.offline = false;
      await s.sync();
      expect(s.dirty, isEmpty);
      expect(syncs().last.body!['weeks'], hasLength(1));
    }),
  );

  test(
    'сервер забыл гостя: новому гостю отдаём всё',
    () => run(() async {
      final s = AppStore();
      await s.load();
      s.saveEntry(draft('a'));
      await s.sync();
      server
        ..saved.clear()
        ..dead = {'cu_1'};
      await s.sync();
      await s.sync();
      expect(server.guests, 2);
      expect(s.history.map((e) => e.id), ['a']);
      expect(server.saved.keys, ['a']);
    }),
  );

  test(
    'устройство отключили от аккаунта: чужое убираем, неотправленное держим',
    () => run(() async {
      final s = AppStore();
      await s.load();
      server.extra = {
        'me': {
          'id': 'me',
          'name': '',
          'email': 'x@example.com',
          'role': 'owner',
        },
      };
      s.saveEntry(draft('a'));
      await s.sync();
      s.saveEntry(draft('b', price: 900));
      server
        ..saved.clear()
        ..extra = {}
        ..dead = {'cu_1'};
      await s.sync();
      expect(s.history.map((e) => e.id), ['b']);
    }),
  );

  test(
    'другая семья: прежние чеки уходят, удалённое исчезает',
    () => run(() async {
      final s = AppStore();
      await s.load();
      s.saveEntry(draft('a'));
      await s.sync();
      server
        ..saved.clear()
        ..saved['z'] = {...draft('z').toJson(), 'updatedAt': 3, 'by': 'other'}
        ..extra = {
          'full': true,
          'family': {...server.state()['family'] as Map, 'id': 'f2'},
        };
      await s.sync();
      expect(s.history.map((e) => e.id), ['z']);
      expect(s.isMine(s.history.first), isFalse);
    }),
  );

  test(
    'журнал без потолка и переживает перезапуск',
    () => run(() async {
      final s = AppStore();
      await s.load();
      for (var i = 0; i < 60; i++) {
        s.saveEntry(draft('h$i', price: 100 + i));
      }
      final again = AppStore();
      await again.load();
      expect(again.history, hasLength(60));
      expect(again.dirty.length, greaterThanOrEqualTo(60));
    }),
  );

  test(
    'дубль не сохраняется второй раз',
    () => run(() async {
      final s = AppStore();
      await s.load();
      final a = s.saveReceipt(rec('x'));
      final b = s.saveReceipt(rec('y'));
      expect((a.duplicate, b.duplicate, b.id), (false, true, a.id));
      expect(s.history, hasLength(1));
    }),
  );

  test(
    'план замен переживает правку строк',
    () => run(() async {
      final s = AppStore();
      await s.load();
      const cola = Item(
        n: 'Кола 1 л',
        p: 600,
        s: 106,
        swap: Item(n: 'Вода', p: 200, s: 0),
      );
      const bread = Item(n: 'Хлеб', p: 200, s: 2);
      final r = rec('x').copyWith(items: const [bread, cola]);
      final id = s.saveReceipt(r).id;
      s.saveEntry(s.entry(id)!.copyWith(swaps: [1]));
      s.editReceipt(
        s.entry(id)!,
        r.copyWith(items: const [cola, bread]),
        const [],
      );
      expect(s.entry(id)!.swaps, [0]);
    }),
  );

  test(
    'выход не стирает неотправленное',
    () => run(() async {
      final s = AppStore();
      await s.load();
      await s.sync();
      s.saveEntry(draft('a'));
      server.offline = true;
      await expectLater(
        s.signOut('this'),
        throwsA(isA<ApiException>().having((e) => e.code, 'code', 'unsaved')),
      );
      expect(s.history, hasLength(1));
    }),
  );

  test(
    'сервер пережил миллисекундные правки профиля',
    () => run(() async {
      final s = AppStore();
      await s.load();
      await s.sync();
      server.during = (_) => s.updateFamily(kids: 4);
      s.updateFamily(kids: 3);
      await s.sync();
      expect(s.profile.kids, 4);
    }),
  );

  group('очередь', () {
    http.Response ok(String id) => _json({
      'receipt': rec(id).toJson(),
      'notice': null,
      'pending': <int>[],
    });

    test(
      'прочитал, сохранил, сообщил тому, кто ждёт',
      () => run(() async {
        await store.load();
        store.clearMine();
        server.scan = (_) => ok('q1');
        final box = Outbox();
        ScanOutcome? got;
        box.waitFor('j1', (o) => got = o);
        await box.enqueue(const [], [Uint8List(3)], id: 'j1');
        await pumpEventQueue();
        expect(got?.kind, 'saved');
        expect(store.entry(got!.entryId!)!.receiptId, 'q1');
        expect(box.jobs, isEmpty);
        // тот же чек второй раз
        box.waitFor('j2', (o) => got = o);
        await box.enqueue(const [], [Uint8List(3)], id: 'j2');
        await pumpEventQueue();
        expect(got?.kind, 'duplicate');
        store.clearMine();
      }),
    );

    test(
      'без сети ждёт и читается по «повторить»',
      () => run(() async {
        await store.load();
        store.clearMine();
        server.offline = true;
        final box = Outbox();
        final done = <String>[];
        box.onBackground = (o) => done.add(o.kind);
        await box.enqueue(const [], [Uint8List(3)]);
        await pumpEventQueue();
        expect(box.jobs.single.status, 'wait');
        expect(box.jobs.single.error, 'unavailable');
        server
          ..offline = false
          ..scan = (_) => ok('q2');
        box.retry(box.jobs.single.id);
        await pumpEventQueue();
        expect(done, ['saved']);
        store.clearMine();
      }),
    );

    test(
      'плохое фото не повторяем, отмена убирает чек',
      () => run(() async {
        await store.load();
        server.scan = (_) => _json({
          'error': {'code': 'not_receipt', 'message': 'не чек'},
        }, 422);
        final box = Outbox();
        final done = <String?>[];
        box.onBackground = (o) => done.add(o.code);
        await box.enqueue(const [], [Uint8List(3)]);
        await pumpEventQueue();
        expect(done, ['not_receipt']);
        expect(box.jobs.single.status, 'error');
        await box.remove(box.jobs.single.id);
        // отменили раньше, чем фото подготовилось
        await box.remove('early');
        await box.enqueue(const [], [Uint8List(3)], id: 'early');
        expect(box.jobs, isEmpty);
      }),
    );
  });

  test(
    'напоминание: воскресенье 18:00 по Казахстану, закрытую неделю пропускаем',
    () {
      final tue = DateTime.utc(2026, 11, 24, 7).millisecondsSinceEpoch;
      expect(
        nextReminder(tue, (_) => false),
        DateTime.utc(2026, 11, 29, 13).millisecondsSinceEpoch,
      );
      expect(
        nextReminder(tue, (w) => w == '2026-11-23'),
        DateTime.utc(2026, 12, 6, 13).millisecondsSinceEpoch,
      );
      final late = DateTime.utc(2026, 11, 29, 14).millisecondsSinceEpoch;
      expect(todayIso(late), '2026-11-29');
      expect(
        nextReminder(late, (_) => false),
        DateTime.utc(2026, 12, 6, 13).millisecondsSinceEpoch,
      );
    },
  );
}

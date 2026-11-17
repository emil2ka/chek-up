// Состояние приложения: история чеков, профиль семьи, список на следующий поход.
// Всё хранится на устройстве (shared_preferences). Если задан API_URL, то ещё и синхронизируется с общим
// сервером и БД «Чек-апа» — тот же аккаунт открывается в веб-версии (через код связывания).
//
// Синхронизация: каждый запрос шлёт на сервер полное локальное состояние, сервер сливает его со своим
// по «последний записал — прав» и отвечает итогом. Удаления передаются «надгробиями» (id + время).
import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'api.dart';
import 'insights.dart';
import 'models.dart';

const _kHistory = 'chekup.history',
    _kProfile = 'chekup.profile',
    _kShop = 'chekup.shop',
    _kStats = 'chekup.stats';
const _kAuth = 'chekup.auth', _kTomb = 'chekup.tomb';
const _limit = 20;

enum SyncStatus { off, idle, syncing, error }

int _now() => DateTime.now().millisecondsSinceEpoch;

class AppStore extends ChangeNotifier {
  SharedPreferences? _sp;
  List<HistoryEntry> history = const [];
  Profile profile = const Profile();
  List<ShopItem> shop = const [];

  /// сколько пунктов списка куплено и сколько штрихкодов проверено — для достижений
  int shopDone = 0, barcodes = 0;

  /// сюда оболочка подписывается, чтобы показать уведомление
  void Function(String text)? onToast;

  // ── синхронизация ──
  final syncStatus = ValueNotifier<SyncStatus>(
    apiUrl.isEmpty ? SyncStatus.off : SyncStatus.idle,
  );
  DateTime? lastSync;
  String? syncError;
  ({String userId, String token})? _auth;
  Map<String, int> _tombHistory = {}, _tombShop = {};
  int _rev = 0; // растёт при каждой локальной правке
  bool _again = false;
  Future<void>? _inFlight;
  Timer? _debounce;

  Future<void> load() async {
    try {
      _sp = await SharedPreferences.getInstance();
      final h = jsonDecode(_sp!.getString(_kHistory) ?? '[]');
      history = [
        for (final j in (h as List)) HistoryEntry.tryJson(j),
      ].whereType<HistoryEntry>().toList();
      profile = Profile.fromJson(
        jsonDecode(_sp!.getString(_kProfile) ?? 'null'),
      );
      shop = [
        for (final j in (jsonDecode(_sp!.getString(_kShop) ?? '[]') as List))
          ShopItem.tryJson(j),
      ].whereType<ShopItem>().toList();
      final st = jsonDecode(_sp!.getString(_kStats) ?? '{}') as Map;
      shopDone = (st['shopDone'] as num?)?.toInt() ?? 0;
      barcodes = (st['barcodes'] as num?)?.toInt() ?? 0;
      final a = jsonDecode(_sp!.getString(_kAuth) ?? 'null');
      if (a is Map && a['token'] is String && a['userId'] is String)
        _auth = (userId: a['userId'], token: a['token']);
      final t = jsonDecode(_sp!.getString(_kTomb) ?? '{}') as Map;
      Map<String, int> ints(Object? m) => {
        for (final e in (m is Map ? m.entries : const <MapEntry>[]))
          if (e.key is String && e.value is num)
            e.key as String: (e.value as num).toInt(),
      };
      _tombHistory = ints(t['history']);
      _tombShop = ints(t['shop']);
    } catch (e) {
      debugPrint('Не удалось прочитать сохранённые данные: $e');
    }
    notifyListeners();
    syncSoon(immediately: true);
  }

  void _save(String key, Object value) {
    try {
      _sp?.setString(key, jsonEncode(value));
    } catch (_) {
      /* не сохранилось — живём до перезапуска в памяти */
    }
  }

  void _saveAll() {
    _save(_kHistory, [for (final x in history) x.toJson()]);
    _save(_kProfile, profile.toJson());
    _saveShop();
    _save(_kTomb, {'history': _tombHistory, 'shop': _tombShop});
  }

  /// Локальная правка: помечаем и запускаем синхронизацию.
  void _touch() {
    _rev++;
    syncSoon();
  }

  void _changed() {
    notifyListeners();
    _checkBadges();
  }

  // ── история ──
  HistoryEntry? entry(String id) =>
      history.where((e) => e.id == id).firstOrNull;
  HistoryEntry? findByReceipt(String receiptId) =>
      history.where((e) => e.receiptId == receiptId).firstOrNull;
  String newId() =>
      'h${_now().toRadixString(36)}${Random().nextInt(1 << 20).toRadixString(36)}';

  /// Сохранить или обновить запись; она поднимается наверх списка.
  void saveEntry(HistoryEntry e) {
    history = [e, ...history.where((x) => x.id != e.id)].take(_limit).toList();
    _tombHistory.remove(e.id);
    _save(_kHistory, [for (final x in history) x.toJson()]);
    _save(_kTomb, {'history': _tombHistory, 'shop': _tombShop});
    _touch();
    _changed();
  }

  void removeEntry(String id) {
    history = history.where((x) => x.id != id).toList();
    _tombHistory[id] = _now();
    _save(_kHistory, [for (final x in history) x.toJson()]);
    _save(_kTomb, {'history': _tombHistory, 'shop': _tombShop});
    _touch();
    notifyListeners();
  }

  void clearHistory() {
    final t = _now();
    for (final e in history) {
      _tombHistory[e.id] = t;
    }
    history = const [];
    _save(_kHistory, const []);
    _save(_kTomb, {'history': _tombHistory, 'shop': _tombShop});
    _touch();
    notifyListeners();
  }

  // ── профиль ──
  void updateProfile(Profile p) {
    profile = p.copyWith(updatedAt: _now());
    _save(_kProfile, profile.toJson());
    _touch();
    notifyListeners();
  }

  // ── список покупок ──
  void _saveShop() {
    _save(_kShop, [for (final s in shop) s.toJson()]);
    _save(_kStats, {'shopDone': shopDone, 'barcodes': barcodes});
    _save(_kTomb, {'history': _tombHistory, 'shop': _tombShop});
  }

  /// Добавляет пункты, которых ещё нет; возвращает, сколько добавилось.
  int addToShop(Iterable<ShopItem> items) {
    final have = {for (final s in shop) s.name.toLowerCase()};
    final t = _now();
    final fresh = [
      for (final i in items)
        if (have.add(i.name.toLowerCase()))
          ShopItem(
            name: i.name,
            instead: i.instead,
            done: i.done,
            updatedAt: t,
          ),
    ];
    if (fresh.isEmpty) return 0;
    for (final s in fresh) {
      _tombShop.remove(s.name);
    }
    shop = [...fresh, ...shop];
    _saveShop();
    _touch();
    notifyListeners();
    return fresh.length;
  }

  void toggleShop(int i) {
    final was = shop[i];
    shop = [...shop]..[i] = was.toggled();
    if (!was.done && was.instead.isNotEmpty) shopDone++;
    _saveShop();
    _touch();
    _changed();
  }

  void removeShop(int i) {
    _tombShop[shop[i].name] = _now();
    shop = [...shop]..removeAt(i);
    _saveShop();
    _touch();
    notifyListeners();
  }

  void clearDoneShop() {
    final t = _now();
    for (final s in shop.where((s) => s.done)) {
      _tombShop[s.name] = t;
    }
    shop = shop.where((s) => !s.done).toList();
    _saveShop();
    _touch();
    notifyListeners();
  }

  void countBarcode() {
    barcodes++;
    _saveShop();
    _touch();
    _changed();
  }

  // ── достижения: сообщаем о новых один раз ──
  List<Badge> get badgeList =>
      badges(history, profile, shopDone: shopDone, barcodes: barcodes);

  void _checkBadges() {
    final fresh = badgeList
        .where((b) => b.done && !profile.seen.contains(b.id))
        .toList();
    if (fresh.isEmpty) return;
    // updatedAt не трогаем: «увиденные» достижения объединяются при слиянии, перебивать чужой профиль незачем
    profile = profile.copyWith(
      seen: [...profile.seen, for (final b in fresh) b.id],
    );
    _save(_kProfile, profile.toJson());
    final names = fresh.map((b) => '«${b.title}»').join(', ');
    onToast?.call(
      fresh.length == 1
          ? 'Новое достижение: $names'
          : 'Новые достижения: $names',
    );
    _touch();
    notifyListeners();
  }

  // ════════════ синхронизация ════════════
  bool get syncEnabled => apiUrl.isNotEmpty;

  void syncSoon({bool immediately = false}) {
    if (!syncEnabled) return;
    _debounce?.cancel();
    _debounce = Timer(
      immediately ? Duration.zero : const Duration(milliseconds: 1500),
      sync,
    );
  }

  Map<String, dynamic> _snapshot() => {
    'profile': {
      'adults': profile.adults,
      'kids': profile.kids,
      'onboarded': profile.onboarded,
      'seen': profile.seen,
      'updatedAt': profile.updatedAt,
    },
    'history': [
      for (final e in history)
        {
          'id': e.id,
          'receiptId': e.receiptId,
          'store': e.store,
          'date': e.date,
          'cubes': e.cubes,
          'score': e.score,
          'swaps': e.swaps,
          'receipt': e.receipt?.toJson(),
          'updatedAt': e.savedAt,
        },
      for (final t in _tombHistory.entries)
        {
          'id': t.key,
          'receiptId': 'deleted',
          'store': '',
          'date': '',
          'cubes': 0,
          'score': 0,
          'swaps': const <int>[],
          'updatedAt': t.value,
          'deleted': true,
        },
    ],
    'shop': [
      for (final s in shop)
        {
          'name': s.name,
          'instead': s.instead,
          'done': s.done,
          'updatedAt': s.updatedAt,
        },
      for (final t in _tombShop.entries)
        {
          'name': t.key,
          'instead': '',
          'done': false,
          'updatedAt': t.value,
          'deleted': true,
        },
    ],
    'stats': {'barcodes': barcodes, 'shopDone': shopDone},
  };

  Future<({String userId, String token})> _register() async {
    final r = await Api.post(
      '/api/auth/anonymous',
      body: {'label': defaultTargetPlatform.name},
    );
    return _setAuth(r);
  }

  ({String userId, String token}) _setAuth(Map<String, dynamic> r) {
    final a = (userId: r['userId'] as String, token: r['token'] as String);
    _auth = a;
    _save(_kAuth, {'userId': a.userId, 'token': a.token});
    return a;
  }

  /// Один проход «отдать и забрать». Пока он идёт, новые вызовы не плодят запросы, а ждут тот же проход:
  /// когда Future завершился, все правки, сделанные до вызова, уже на сервере (или показана ошибка).
  Future<void> sync() {
    if (!syncEnabled) return Future.value();
    final running = _inFlight;
    if (running != null) {
      _again = true;
      return running;
    }
    return _inFlight = () async {
      try {
        do {
          _again = false;
          await _cycle();
        } while (_again);
      } finally {
        _inFlight = null;
      }
    }();
  }

  Future<void> _cycle() async {
    syncStatus.value = SyncStatus.syncing;
    try {
      var auth = _auth ?? await _register();
      final rev = _rev;
      Map<String, dynamic> res;
      try {
        res = await Api.post('/api/sync', token: auth.token, body: _snapshot());
      } on ApiException catch (e) {
        if (e.status != 401) rethrow;
        // сервер не знает этот токен (например, БД пересоздали): заводим новый аккаунт, локальные данные при нас
        auth = await _register();
        res = await Api.post('/api/sync', token: auth.token, body: _snapshot());
      }
      if (rev == _rev) {
        _apply(res);
      } else {
        _again =
            true; // пока шёл запрос, данные поменялись — ответ устарел, повторим
      }
      lastSync = DateTime.now();
      syncError = null;
      syncStatus.value = SyncStatus.idle;
    } catch (e) {
      syncError = e is ApiException
          ? e.message
          : 'Не получилось синхронизировать';
      syncStatus.value = SyncStatus.error;
      _again = false; // не крутимся в цикле без сети; повторим позже
      _debounce?.cancel();
      _debounce = Timer(const Duration(seconds: 30), sync);
    }
  }

  /// Принять итог слияния от сервера как новую правду.
  void _apply(Map<String, dynamic> j) {
    final p = j['profile'];
    if (p is Map) profile = Profile.fromJson(p);

    final entries = <HistoryEntry>[];
    final tombH = <String, int>{};
    for (final h in (j['history'] as List? ?? const [])) {
      if (h is! Map || h['id'] is! String) continue;
      final at = (h['updatedAt'] as num?)?.toInt() ?? 0;
      if (h['deleted'] == true) {
        tombH[h['id']] = at;
        continue;
      }
      final e = HistoryEntry.tryJson({...h, 'savedAt': at});
      if (e != null) entries.add(e);
    }
    entries.sort((a, b) => b.savedAt.compareTo(a.savedAt));
    history = entries.take(_limit).toList();
    _tombHistory = tombH;

    final items = <ShopItem>[];
    final tombS = <String, int>{};
    for (final s in (j['shop'] as List? ?? const [])) {
      if (s is! Map || s['name'] is! String) continue;
      if (s['deleted'] == true) {
        tombS[s['name']] = (s['updatedAt'] as num?)?.toInt() ?? 0;
      } else {
        final it = ShopItem.tryJson(s);
        if (it != null) items.add(it);
      }
    }
    items.sort((a, b) => b.updatedAt.compareTo(a.updatedAt));
    shop = items;
    _tombShop = tombS;

    final st = j['stats'];
    if (st is Map) {
      barcodes = max(barcodes, (st['barcodes'] as num?)?.toInt() ?? 0);
      shopDone = max(shopDone, (st['shopDone'] as num?)?.toInt() ?? 0);
    }
    _saveAll();
    notifyListeners();
    _checkBadges();
  }

  // ── связывание устройств ──
  /// Короткий код для входа в этот аккаунт с другого устройства (живёт 10 минут).
  Future<String> linkCode() async {
    final auth = _auth ?? await _register();
    final r = await Api.post('/api/auth/link', token: auth.token);
    return r['code'] as String;
  }

  /// Войти в аккаунт другого устройства по его коду: локальные данные сольются с общими.
  Future<void> redeemLinkCode(String code) async {
    final r = await Api.post(
      '/api/auth/link/redeem',
      body: {'code': code, 'label': defaultTargetPlatform.name},
    );
    _setAuth(r);
    _rev++;
    await sync();
  }
}

final store = AppStore();

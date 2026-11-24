// Состояние приложения: журнал чеков, профиль, семья, отметки недель, список на следующий поход.
// Всё хранится на устройстве (shared_preferences). Если задан API_URL, то ещё и синхронизируется с общим
// сервером и БД «Чек-апа». Контракт — web/src/lib/syncSchema.ts.
//
// Синхронизация: отправляем только изменённое (_dirty), получаем изменения семьи после последнего номера (cursor).
// Пришедшее с сервера не затирает то, что здесь поменяли и ещё не отправили.
import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'api.dart';
import 'calendar.dart';
import 'cart.dart';
import 'engine.dart';
import 'i18n.dart';
import 'insights.dart';
import 'models.dart';
import 'plan.dart';
import 'streak.dart';

const _kHistory = 'chekup.history',
    _kProfile = 'chekup.profile',
    _kShop = 'chekup.shop',
    _kStats = 'chekup.stats',
    _kAuth = 'chekup.auth',
    _kTomb = 'chekup.tomb',
    _kDirty = 'chekup.dirty',
    _kCursor = 'chekup.sync',
    _kFamily = 'chekup.family',
    _kWeeks = 'chekup.weeks';
const _chunk = 150;

enum SyncStatus { off, idle, syncing, error }

typedef Me = ({String id, String name, String email, String role});

class FamilyState {
  final String id;
  final List<Member> members;
  final Me me;
  final Streak? streak;
  final int bestWeeks;
  const FamilyState({
    this.id = '',
    this.members = const [],
    this.me = (id: '', name: '', email: '', role: 'owner'),
    this.streak,
    this.bestWeeks = 0,
  });

  Map<String, dynamic> toJson() => {
    'id': id,
    'members': [for (final m in members) m.toJson()],
    'me': {'id': me.id, 'name': me.name, 'email': me.email, 'role': me.role},
    'streak': streak?.toJson(),
    'bestWeeks': bestWeeks,
  };

  static FamilyState fromJson(Object? j) {
    if (j is! Map) return const FamilyState();
    final me = j['me'] is Map ? j['me'] as Map : const {};
    String s(Object? v, [String fb = '']) => v is String ? v : fb;
    return FamilyState(
      id: s(j['id']),
      members: [
        for (final m in (j['members'] as List? ?? const [])) Member.tryJson(m),
      ].whereType<Member>().toList(),
      me: (
        id: s(me['id']),
        name: s(me['name']),
        email: s(me['email']),
        role: s(me['role'], 'owner'),
      ),
      streak: Streak.tryJson(j['streak']),
      bestWeeks: (j['bestWeeks'] as num?)?.toInt() ?? 0,
    );
  }
}

class AppStore extends ChangeNotifier {
  SharedPreferences? _sp;
  List<HistoryEntry> history = const [];
  Profile profile = const Profile();
  List<ShopItem> shop = const [];
  List<WeekMark> marks = const [];
  FamilyState family = const FamilyState();

  /// сколько пунктов списка куплено и сколько штрихкодов проверено — для достижений
  int shopDone = 0, barcodes = 0;

  /// сюда оболочка подписывается, чтобы показать уведомление
  void Function(String text)? onToast;

  // ── синхронизация ──
  final syncStatus = ValueNotifier<SyncStatus>(SyncStatus.off);
  DateTime? lastSync;
  String? syncError;
  ({String userId, String token})? _auth;
  ({int cursor, String familyId})? _cursor;
  Map<String, int> _dirty = {}, _tombHistory = {}, _tombShop = {};
  bool _again = false;
  Future<void>? _inFlight;
  Future<({String userId, String token})>? _registering;
  Timer? _debounce;
  int _fails = 0, _lastAt = 0;

  Map<String, int> get dirty => Map.unmodifiable(_dirty);

  Object? _read(String key) {
    try {
      return jsonDecode(_sp?.getString(key) ?? 'null');
    } catch (_) {
      return null;
    }
  }

  static Map<String, int> _ints(Object? m) => {
    for (final e in (m is Map ? m.entries : const <MapEntry>[]))
      if (e.key is String && e.value is num)
        e.key as String: (e.value as num).toInt(),
  };

  Future<void> load() async {
    syncStatus.value = syncEnabled ? SyncStatus.idle : SyncStatus.off;
    try {
      _sp = await SharedPreferences.getInstance();
      List<Object?> list(String k) =>
          _read(k) is List ? _read(k) as List : const [];
      history = [
        for (final j in list(_kHistory)) HistoryEntry.tryJson(j),
      ].whereType<HistoryEntry>().toList();
      profile = Profile.fromJson(_read(_kProfile));
      shop = [
        for (final j in list(_kShop)) ShopItem.tryJson(j),
      ].whereType<ShopItem>().toList();
      marks = [
        for (final j in list(_kWeeks)) WeekMark.tryJson(j),
      ].whereType<WeekMark>().toList();
      family = FamilyState.fromJson(_read(_kFamily));
      final st = _read(_kStats);
      if (st is Map) {
        shopDone = (st['shopDone'] as num?)?.toInt() ?? 0;
        barcodes = (st['barcodes'] as num?)?.toInt() ?? 0;
      }
      final a = _read(_kAuth);
      _auth = a is Map && a['token'] is String && a['userId'] is String
          ? (userId: a['userId'], token: a['token'])
          : null;
      final c = _read(_kCursor);
      _cursor = c is Map && c['cursor'] is num && c['familyId'] is String
          ? (cursor: (c['cursor'] as num).toInt(), familyId: c['familyId'])
          : null;
      _dirty = _ints(_read(_kDirty));
      final tomb = _read(_kTomb);
      _tombHistory = _ints(tomb is Map ? tomb['history'] : null);
      _tombShop = _ints(tomb is Map ? tomb['shop'] : null);
    } catch (e) {
      debugPrint('Не удалось прочитать сохранённые данные: $e');
    }
    lang = profile.lang == 'kk' ? Lang.kk : Lang.ru;
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

  void _saveHistory() {
    _save(_kHistory, [for (final x in history) x.toJson()]);
    _saveTomb();
  }

  void _saveTomb() =>
      _save(_kTomb, {'history': _tombHistory, 'shop': _tombShop});
  void _saveProfile() => _save(_kProfile, profile.toJson());
  void _saveWeeks() => _save(_kWeeks, [for (final m in marks) m.toJson()]);
  void _saveFamily() => _save(_kFamily, family.toJson());
  void _saveShop() {
    _save(_kShop, [for (final s in shop) s.toJson()]);
    _save(_kStats, {'shopDone': shopDone, 'barcodes': barcodes});
    _saveTomb();
  }

  /// Время правки строго растёт, даже если две правки попали в одну миллисекунду.
  int _stamp() => _lastAt = max(nowMs(), _lastAt + 1);

  /// Локальная правка: помечаем и запускаем синхронизацию.
  void _mark(String key, int at) {
    _dirty[key] = max(at, (_dirty[key] ?? 0) + 1);
    _save(_kDirty, _dirty);
    syncSoon();
  }

  void _changed() {
    notifyListeners();
    _checkBadges();
  }

  // ── что показываем ──
  List<HistoryEntry> get real => [
    for (final e in history)
      if (!isDemo(e)) e,
  ];

  /// Примеры видны, только пока нет своих чеков.
  List<HistoryEntry> get shown => real.isEmpty ? history : real;
  bool get isChild => family.me.role == 'child';
  bool isMine(HistoryEntry e) => e.by == null || e.by == family.me.id;
  String authorOf(HistoryEntry e) => isMine(e)
      ? ''
      : (family.members.where((m) => m.id == e.by).firstOrNull?.name ?? '')
            .ifEmpty(t('участник'));

  Map<String, WeekFact> get facts => weekFacts(real, profile);
  Streak get streak {
    final s = family.streak;
    final fresh =
        s != null &&
        _dirty.isEmpty &&
        s.cells.isNotEmpty &&
        s.cells.last.week == weekOf(todayIso());
    return fresh ? s : computeStreak(marks, facts);
  }

  int get bestStreak => max(family.bestWeeks, streak.best);
  String get closingWeek => weekToClose(marks, facts);

  // ── журнал ──
  HistoryEntry? entry(String id) =>
      history.where((e) => e.id == id).firstOrNull;
  HistoryEntry? findByReceipt(String receiptId) =>
      history.where((e) => e.receiptId == receiptId).firstOrNull;
  String newId() =>
      'h${nowMs().toRadixString(36)}${Random().nextInt(1 << 20).toRadixString(36)}';

  /// Сохранить или обновить запись; она поднимается наверх списка.
  HistoryEntry saveEntry(HistoryEntry e) {
    final rec = e.copyWith(savedAt: _stamp());
    history = [rec, ...history.where((x) => x.id != e.id)];
    _tombHistory.remove(e.id);
    _saveHistory();
    _mark('h:${e.id}', rec.savedAt);
    _changed();
    return rec;
  }

  /// Сохранить внесённый чек. Если он уже есть — вернуть тот, что есть.
  ({String id, bool duplicate}) saveReceipt(
    Receipt r, {
    List<int> off = const [],
  }) {
    final dup = findDuplicate(r, real, receiptOf);
    if (dup != null) return (id: dup.id, duplicate: true);
    final a = analyze(r, const [], off);
    final demo = demoById(r.id) != null;
    final e = saveEntry(
      HistoryEntry(
        id: newId(),
        receiptId: r.id,
        store: r.store,
        date: r.date,
        cubes: a.cubes,
        score: a.score,
        swaps: const [],
        savedAt: 0,
        off: off,
        receipt: demo ? null : r,
      ),
    );
    if (!demo) unawaited(carts.settle(r, e.id));
    return (id: e.id, duplicate: false);
  }

  /// Исправленный чек: план замен держится за название позиции.
  void editReceipt(HistoryEntry e, Receipt r, List<int> off) {
    final old = receiptOf(e)?.items ?? const <Item>[];
    final swaps = <int>{
      for (final i in e.swaps)
        if (i < old.length)
          ...[
            r.items.indexWhere(
              (it) =>
                  it.swap != null && (it.n == old[i].n || it.raw == old[i].n),
            ),
          ].where((k) => k >= 0),
    };
    final a = analyze(r, const [], off);
    saveEntry(
      e.copyWith(
        receipt: r,
        store: r.store,
        date: r.date,
        off: off,
        swaps: swaps.toList()..sort(),
        cubes: a.cubes,
        score: a.score,
      ),
    );
  }

  void removeEntry(String id) {
    history = history.where((x) => x.id != id).toList();
    final at = _stamp();
    _tombHistory[id] = at;
    _saveHistory();
    _mark('h:$id', at);
    notifyListeners();
  }

  /// Удалить все свои чеки (чужие семейные не трогаем).
  void clearMine() {
    for (final e in [...history]) {
      if (isMine(e) || isDemo(e)) removeEntry(e.id);
    }
  }

  // ── профиль ──
  void updateMe({bool? onboarded, String? lang}) {
    final at = _stamp();
    profile = profile.copyWith(onboarded: onboarded, lang: lang, updatedAt: at);
    if (lang != null) setLang(lang);
    _saveProfile();
    _mark('p', at);
    notifyListeners();
  }

  void setLang(String code) => lang = code == 'kk' ? Lang.kk : Lang.ru;

  void updateFamily({int? adults, int? kids, int? goal}) {
    final at = _stamp();
    profile = profile.copyWith(
      adults: adults,
      kids: kids,
      goal: goal,
      familyAt: at,
    );
    _saveProfile();
    _mark('f', at);
    notifyListeners();
  }

  void setMark(String week, String state) {
    final prev = marks.where((m) => m.week == week).firstOrNull;
    final at = max(_stamp(), (prev?.updatedAt ?? 0) + 1);
    marks = [...marks.where((m) => m.week != week), WeekMark(week, state, at)]
      ..sort((a, b) => a.week.compareTo(b.week));
    _saveWeeks();
    _mark('w:$week', at);
    _changed();
  }

  // ── список покупок ──
  /// Добавляет пункты, которых ещё нет; возвращает, сколько добавилось.
  int addToShop(Iterable<ShopItem> items) {
    final have = {for (final s in shop) s.name.toLowerCase()};
    final fresh = [
      for (final i in items)
        if (have.add(i.name.toLowerCase()))
          ShopItem(
            name: i.name,
            instead: i.instead,
            done: i.done,
            updatedAt: _stamp(),
          ),
    ];
    if (fresh.isEmpty) return 0;
    for (final s in fresh) {
      _tombShop.remove(s.name);
      _mark('s:${s.name}', s.updatedAt);
    }
    shop = [...fresh, ...shop];
    _saveShop();
    notifyListeners();
    return fresh.length;
  }

  void toggleShop(int i) {
    final was = shop[i];
    final next = ShopItem(
      name: was.name,
      instead: was.instead,
      done: !was.done,
      updatedAt: _stamp(),
    );
    shop = [...shop]..[i] = next;
    if (!was.done && was.instead.isNotEmpty) {
      shopDone++;
      _mark('st', nowMs());
    }
    _saveShop();
    _mark('s:${was.name}', next.updatedAt);
    _changed();
  }

  void _dropShop(Iterable<ShopItem> items) {
    for (final s in items) {
      final at = _stamp();
      _tombShop[s.name] = at;
      _mark('s:${s.name}', at);
    }
    final names = {for (final s in items) s.name};
    shop = shop.where((s) => !names.contains(s.name)).toList();
    _saveShop();
    notifyListeners();
  }

  void removeShop(int i) => _dropShop([shop[i]]);
  void clearDoneShop() => _dropShop(shop.where((s) => s.done).toList());

  void countBarcode() {
    barcodes++;
    _saveShop();
    _mark('st', nowMs());
    _changed();
  }

  // ── достижения: сообщаем о новых один раз ──
  List<Badge> get badgeList => badges(
    real,
    profile,
    marks,
    bestStreak,
    shopDone: shopDone,
    barcodes: barcodes,
  );

  void _checkBadges() {
    final fresh = badgeList
        .where((b) => b.done && !profile.seen.contains(b.id))
        .toList();
    if (fresh.isEmpty) return;
    // updatedAt не трогаем: «увиденные» достижения объединяются при слиянии
    profile = profile.copyWith(
      seen: [...profile.seen, for (final b in fresh) b.id],
    );
    _saveProfile();
    _mark('p', nowMs());
    final names = fresh.map((b) => '«${t(b.title)}»').join(', ');
    onToast?.call(
      fresh.length == 1
          ? t('Новое достижение: {n}', {'n': names})
          : t('Новые достижения: {n}', {'n': names}),
    );
    notifyListeners();
  }

  // ════════════ сервер ════════════
  bool get syncEnabled => apiUrl.isNotEmpty;

  void syncSoon({bool immediately = false}) {
    if (!syncEnabled) return;
    _debounce?.cancel();
    _debounce = Timer(
      immediately ? Duration.zero : const Duration(milliseconds: 1500),
      sync,
    );
  }

  String get deviceLabel => switch (defaultTargetPlatform) {
    TargetPlatform.iOS => 'iPhone',
    TargetPlatform.android => 'Android',
    _ => 'Чек-ап',
  };

  Future<({String userId, String token})> _register() =>
      _registering ??= Api.send(
        'POST',
        '/api/auth/anonymous',
        body: {'label': deviceLabel},
      ).then(_setAuth).whenComplete(() => _registering = null);

  ({String userId, String token}) _setAuth(Map<String, dynamic> r) {
    final a = (userId: r['userId'] as String, token: r['token'] as String);
    _auth = a;
    _save(_kAuth, {'userId': a.userId, 'token': a.token});
    return a;
  }

  /// Сервер больше не знает этот токен. Для аккаунта со входом это значит «устройство отключили»: сохранённое на сервере
  /// убираем, остаётся только неотправленное. У гостя данных больше нигде нет — новому гостю отдаём всё.
  void _forgetSession() {
    final signedIn = family.me.email.isNotEmpty;
    _auth = null;
    _cursor = null;
    _sp?.remove(_kAuth);
    _sp?.remove(_kCursor);
    if (signedIn) {
      history = history.where((e) => _dirty.containsKey('h:${e.id}')).toList();
      marks = marks.where((m) => _dirty.containsKey('w:${m.week}')).toList();
      shop = shop.where((s) => _dirty.containsKey('s:${s.name}')).toList();
      family = const FamilyState();
      _saveHistory();
      _saveWeeks();
      _saveShop();
      _saveFamily();
    } else {
      _markEverything();
    }
  }

  void _markEverything() {
    for (final e in history) {
      if (e.receipt?.masked != true) {
        _dirty.putIfAbsent('h:${e.id}', () => e.savedAt);
      }
    }
    for (final s in shop) {
      _dirty.putIfAbsent('s:${s.name}', () => s.updatedAt);
    }
    for (final m in marks) {
      _dirty.putIfAbsent('w:${m.week}', () => m.updatedAt);
    }
    _save(_kDirty, _dirty);
  }

  /// Запрос от имени этого устройства.
  Future<T> authed<T>(Future<T> Function(String token) call) async {
    final auth = _auth ?? await _register();
    try {
      return await call(auth.token);
    } on ApiException catch (e) {
      if (e.status != 401) rethrow;
      if (_auth?.token == auth.token) _forgetSession();
      return call((_auth ?? await _register()).token);
    }
  }

  Future<Map<String, dynamic>> call(
    String method,
    String path, [
    Object? body,
  ]) => authed((token) => Api.send(method, path, body: body, token: token));

  // ── что отправляем ──
  ({
    Map<String, dynamic> body,
    Map<String, int> sent,
    bool more,
    List<String> deleted,
    List<String> deletedShop,
  })
  _outgoing() {
    final byId = {for (final e in history) e.id: e};
    final byName = {for (final s in shop) s.name: s};
    final sent = <String, int>{};
    final hist = <Map<String, dynamic>>[], items = <Map<String, dynamic>>[];
    final weeks = <Map<String, dynamic>>[];
    final deleted = <String>[], deletedShop = <String>[];
    var more = false;
    for (final d in _dirty.entries) {
      final key = d.key;
      if (key.startsWith('h:')) {
        if (hist.length >= _chunk) {
          more = true;
          continue;
        }
        final id = key.substring(2), e = byId[id];
        if (e != null) {
          hist.add({
            'id': e.id,
            'receiptId': e.receiptId,
            'store': e.store,
            'date': e.date,
            'cubes': max(0, e.cubes),
            'score': e.score.clamp(0, 100),
            'swaps': e.swaps,
            'off': e.off,
            'tag': e.guests ? 'guests' : '',
            'priv': e.priv,
            'receipt': e.receipt?.toJson(),
            'updatedAt': e.savedAt,
          });
        } else if (_tombHistory.containsKey(id)) {
          hist.add({
            'id': id,
            'receiptId': 'deleted',
            'store': '',
            'date': '',
            'cubes': 0,
            'score': 0,
            'swaps': const <int>[],
            'receipt': null,
            'updatedAt': _tombHistory[id],
            'deleted': true,
          });
          deleted.add(id);
        }
        sent[key] = d.value;
      } else if (key.startsWith('s:')) {
        if (items.length >= _chunk) {
          more = true;
          continue;
        }
        final name = key.substring(2), s = byName[name];
        if (s != null) {
          items.add(s.toJson());
        } else if (_tombShop.containsKey(name)) {
          items.add({
            'name': name,
            'instead': '',
            'done': false,
            'updatedAt': _tombShop[name],
            'deleted': true,
          });
          deletedShop.add(name);
        }
        sent[key] = d.value;
      } else if (key.startsWith('w:')) {
        final m = marks.where((m) => 'w:${m.week}' == key).firstOrNull;
        if (m != null) weeks.add(m.toJson());
        sent[key] = d.value;
      } else {
        sent[key] = d.value;
      }
    }
    final c = _cursor, p = profile;
    final ownP = _dirty.containsKey('p') || c == null;
    final ownF = _dirty.containsKey('f') || (c == null && p.familyAt > 0);
    return (
      more: more,
      sent: sent,
      deleted: deleted,
      deletedShop: deletedShop,
      body: {
        if (c != null) 'since': c.cursor,
        if (c != null) 'familyId': c.familyId,
        if (hist.isNotEmpty) 'history': hist,
        if (items.isNotEmpty) 'shop': items,
        if (weeks.isNotEmpty) 'weeks': weeks,
        if (ownP)
          'profile': {
            'onboarded': p.onboarded,
            'seen': p.seen,
            'lang': p.lang,
            'updatedAt': p.updatedAt,
          },
        if (ownF)
          'family': {
            'adults': p.adults,
            'kids': p.kids,
            'goal': p.goal,
            'updatedAt': p.familyAt,
          },
        if (_dirty.containsKey('st') || c == null)
          'stats': {'barcodes': barcodes, 'shopDone': shopDone},
      },
    );
  }

  void _ack(Map<String, int> sent) {
    for (final e in sent.entries) {
      if (_dirty[e.key] == e.value) _dirty.remove(e.key);
    }
    _save(_kDirty, _dirty);
  }

  /// Один проход «отдать и забрать». Когда Future завершился, правки, сделанные до вызова, уже на сервере (или показана ошибка).
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
      if (_cursor == null) _markEverything();
      for (;;) {
        final out = _outgoing();
        final res = await call('POST', '/api/sync', out.body);
        if (res['cursor'] is! num || res['family'] is! Map) {
          throw const ApiException(
            0,
            'bad_response',
            'Ответ сервера не по схеме',
          );
        }
        _ack(out.sent);
        for (final id in out.deleted) {
          if (!_dirty.containsKey('h:$id')) _tombHistory.remove(id);
        }
        for (final n in out.deletedShop) {
          if (!_dirty.containsKey('s:$n')) _tombShop.remove(n);
        }
        if (!out.more) {
          _apply(res);
          break;
        }
      }
      _fails = 0;
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
      _debounce = Timer(
        Duration(seconds: min(300, 15 * pow(2, min(_fails++, 5)).toInt())),
        sync,
      );
    }
  }

  /// Принять изменения с сервера; своё неотправленное остаётся.
  void _apply(Map<String, dynamic> j) {
    final fam = j['family'] as Map;
    final famId = '${fam['id']}';
    // перешли в другую семью: чужие чеки прежней семьи с устройства убираем
    final full = j['full'] == true || _cursor?.familyId != famId;

    final incoming = <String, HistoryEntry>{}, removed = <String>{};
    for (final h in (j['history'] as List? ?? const [])) {
      if (h is! Map || h['id'] is! String) continue;
      if (h['deleted'] == true) {
        removed.add(h['id']);
        continue;
      }
      final e = HistoryEntry.tryJson({...h, 'savedAt': h['updatedAt']});
      if (e != null) incoming[e.id] = e;
    }
    final kept = [
      for (final e in history)
        if (_dirty.containsKey('h:${e.id}') ||
            (!removed.contains(e.id) && !incoming.containsKey(e.id) && !full))
          e,
    ];
    final keptIds = {for (final e in kept) e.id};
    history = [
      ...kept,
      for (final e in incoming.values)
        if (!keptIds.contains(e.id) && !_tombHistory.containsKey(e.id)) e,
    ]..sort((a, b) => b.savedAt.compareTo(a.savedAt));

    final items = <String, ShopItem>{}, gone = <String>{};
    for (final s in (j['shop'] as List? ?? const [])) {
      if (s is! Map || s['name'] is! String) continue;
      if (s['deleted'] == true) {
        gone.add(s['name']);
        continue;
      }
      final it = ShopItem.tryJson(s);
      if (it != null) items[it.name] = it;
    }
    final keptShop = [
      for (final s in shop)
        if (_dirty.containsKey('s:${s.name}') ||
            (!gone.contains(s.name) && !items.containsKey(s.name) && !full))
          s,
    ];
    final names = {for (final s in keptShop) s.name};
    shop = [
      ...keptShop,
      for (final s in items.values)
        if (!names.contains(s.name) && !_tombShop.containsKey(s.name)) s,
    ]..sort((a, b) => b.updatedAt.compareTo(a.updatedAt));

    final ownMarks = [
      for (final m in marks)
        if (_dirty.containsKey('w:${m.week}')) m,
    ];
    final ownWeeks = {for (final m in ownMarks) m.week};
    marks = [
      for (final w in (j['weeks'] as List? ?? const []))
        if (WeekMark.tryJson(w) case final WeekMark m
            when !ownWeeks.contains(m.week))
          m,
      ...ownMarks,
    ]..sort((a, b) => a.week.compareTo(b.week));

    final p = j['profile'];
    if (p is Map) {
      final remote = Profile.fromJson(p);
      final own = _dirty.containsKey('p');
      profile = profile.copyWith(
        onboarded: profile.onboarded || remote.onboarded,
        seen: {...profile.seen, ...remote.seen}.toList(),
        lang: own ? null : remote.lang,
        updatedAt: own ? null : remote.updatedAt,
      );
      setLang(profile.lang);
    }
    if (!_dirty.containsKey('f')) {
      final f = Profile.fromJson(fam);
      profile = profile.copyWith(
        adults: f.adults,
        kids: f.kids,
        goal: f.goal,
        familyAt: f.updatedAt,
      );
    }
    final st = j['stats'];
    if (st is Map) {
      barcodes = max(barcodes, (st['barcodes'] as num?)?.toInt() ?? 0);
      shopDone = max(shopDone, (st['shopDone'] as num?)?.toInt() ?? 0);
    }
    family = FamilyState.fromJson({
      'id': famId,
      'members': fam['members'],
      'me': j['me'],
      'streak': j['streak'],
      'bestWeeks': st is Map ? st['bestWeeks'] : 0,
    });
    _cursor = (cursor: (j['cursor'] as num).toInt(), familyId: famId);
    _save(_kCursor, {'cursor': _cursor!.cursor, 'familyId': famId});
    _saveHistory();
    _saveProfile();
    _saveShop();
    _saveWeeks();
    _saveFamily();
    notifyListeners();
    _checkBadges();
  }

  // ── сравнение цен ──
  /// Где позиции этого чека дешевле в других магазинах (по чекам пользователей «Чек-апа»); null — сервер недоступен.
  Future<PriceCompare?> priceOffers(Receipt r) async {
    if (!syncEnabled) return null;
    try {
      return PriceCompare.fromJson(
        await call('POST', '/api/prices/compare', {
          'store': r.store,
          'items': [
            for (final i in r.items) {'n': i.n, 'p': i.p},
          ],
        }),
      );
    } catch (_) {
      return null;
    }
  }

  // ── аккаунт ──
  /// Новый токен этого устройства; состояние приедет с сервера целиком.
  Future<void> _adopt(Map<String, dynamic> session) async {
    _setAuth(session);
    _cursor = null;
    _sp?.remove(_kCursor);
    await sync();
  }

  /// Короткий код для входа в этот аккаунт с другого устройства (живёт 10 минут).
  Future<String> linkCode() async =>
      (await call('POST', '/api/auth/link', const {}))['code'] as String;

  /// Войти в аккаунт другого устройства по его коду: чеки этого устройства переедут туда же.
  Future<void> redeemLinkCode(String code) async {
    await sync();
    await _adopt(
      await call('POST', '/api/auth/link/redeem', {
        'code': code,
        'label': deviceLabel,
      }),
    );
  }

  Future<bool> emailSignInAvailable() async =>
      (await Api.send('GET', '/api/auth/providers'))['email'] == true;
  Future<void> emailStart(String email) =>
      Api.send('POST', '/api/auth/email/start', body: {'email': email});
  Future<void> emailVerify(String email, String code) async {
    await sync();
    await _adopt(
      await call('POST', '/api/auth/email/verify', {
        'email': email,
        'code': code,
        'label': deviceLabel,
      }),
    );
  }

  Future<void> rename(String name) async {
    await call('PATCH', '/api/account', {'name': name});
    await sync();
  }

  Future<List<DeviceInfo>> devices() async {
    final r = await call('GET', '/api/account');
    return [
      for (final d in (r['devices'] as List? ?? const []))
        if (d is Map && d['id'] is String)
          DeviceInfo(
            d['id'],
            '${d['label'] ?? ''}',
            DateTime.tryParse('${d['lastSeenAt']}') ?? DateTime.now(),
            d['current'] == true,
          ),
    ];
  }

  /// Выйти: сначала отправляем несохранённое; если связи нет — не выходим, чтобы ничего не потерять.
  /// what: this, others, all или id устройства.
  Future<void> signOut(String what) async {
    final leaving = what == 'this' || what == 'all';
    if (leaving) {
      await sync();
      if (_dirty.isNotEmpty) {
        throw const ApiException(
          0,
          'unsaved',
          'Есть несохранённые чеки. Подключись к интернету и попробуй ещё раз',
        );
      }
    }
    await call('POST', '/api/account/signout', {'what': what});
    if (leaving) wipe();
  }

  Future<String> exportData() async => const JsonEncoder.withIndent(
    '  ',
  ).convert(await call('GET', '/api/account/export'));

  Future<void> deleteAccount() async {
    await call('DELETE', '/api/account', {'confirm': 'delete'});
    wipe();
  }

  /// Забыть всё на этом устройстве. Чеки остаются на сервере.
  void wipe() {
    _debounce?.cancel();
    _auth = null;
    _cursor = null;
    _dirty = {};
    _tombHistory = {};
    _tombShop = {};
    carts.clear();
    history = const [];
    shop = const [];
    marks = const [];
    family = const FamilyState();
    profile = const Profile();
    shopDone = barcodes = 0;
    lastSync = null;
    setLang('ru');
    for (final k in const [
      _kHistory,
      _kProfile,
      _kShop,
      _kStats,
      _kAuth,
      _kTomb,
      _kDirty,
      _kCursor,
      _kFamily,
      _kWeeks,
    ]) {
      _sp?.remove(k);
    }
    notifyListeners();
  }

  // ── семья ──
  Future<String> createInvite(String role) async =>
      (await call('POST', '/api/family/invite', {'role': role}))['code']
          as String;
  Future<InvitePreview> previewInvite(String code) async {
    final r = await call('POST', '/api/family/join', {
      'code': code,
      'preview': true,
    });
    return InvitePreview(
      '${r['role']}',
      '${r['invitedBy'] ?? ''}',
      (r['members'] as num?)?.toInt() ?? 1,
    );
  }

  Future<void> joinFamily(String code, {required bool share}) async {
    await sync();
    await call('POST', '/api/family/join', {'code': code, 'share': share});
    await sync();
  }

  Future<void> leaveFamily() async {
    await sync();
    await call('POST', '/api/family/leave', const {});
    await sync();
  }

  Future<void> setRole(String userId, String role) async {
    await call('PATCH', '/api/family/members', {
      'userId': userId,
      'role': role,
    });
    await sync();
  }

  Future<void> removeMember(String userId) async {
    await call('DELETE', '/api/family/members', {'userId': userId});
    await sync();
  }

  /// Запомнить исправления для этого магазина.
  Future<void> sendCorrections(
    String storeName,
    List<Map<String, dynamic>> items,
  ) async {
    if (!syncEnabled || items.isEmpty || isChild) return;
    try {
      await call('POST', '/api/corrections', {
        'store': storeName,
        'items': items.take(100).toList(),
      });
    } catch (_) {
      /* запомним в другой раз */
    }
  }
}

final store = AppStore();

extension on String {
  String ifEmpty(String other) => isEmpty ? other : this;
}

class DeviceInfo {
  final String id, label;
  final DateTime seen;
  final bool current;
  const DeviceInfo(this.id, this.label, this.seen, this.current);
}

class InvitePreview {
  final String role, invitedBy;
  final int members;
  const InvitePreview(this.role, this.invitedBy, this.members);
}

/// Одно предложение «где дешевле»: позиция из чека и цена за кг/л здесь и в другом магазине.
class PriceOffer {
  final String name, unit, store;
  final int yourPrice, bestPrice, n, saving;
  const PriceOffer(
    this.name,
    this.unit,
    this.store,
    this.yourPrice,
    this.bestPrice,
    this.n,
    this.saving,
  );
}

class PriceCompare {
  final List<PriceOffer> offers;
  final int total, compared;
  const PriceCompare(this.offers, this.total, this.compared);

  factory PriceCompare.fromJson(Map<String, dynamic> j) => PriceCompare(
    [
      for (final o in (j['offers'] as List? ?? const []))
        if (o is Map)
          PriceOffer(
            '${o['name']}',
            '${o['unit']}',
            '${o['store']}',
            (o['yourPrice'] as num).round(),
            (o['bestPrice'] as num).round(),
            (o['n'] as num).round(),
            (o['saving'] as num).round(),
          ),
    ],
    (j['total'] as num? ?? 0).round(),
    (j['compared'] as num? ?? 0).round(),
  );
}

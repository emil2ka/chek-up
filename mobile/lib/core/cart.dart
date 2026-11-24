// Корзина до кассы: что убрать и что заменить, пока не куплено (перенос web/src/lib/cart.ts).
// Живёт только на этом телефоне: это ещё не покупка. Сверку с чеком считает сервер (POST /api/cart/settle).
import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'api.dart';
import 'calendar.dart';
import 'data.dart';
import 'engine.dart';
import 'models.dart';
import 'scan.dart';
import 'store.dart';

class CartFact {
  final String entryId;
  final int planned, kept;
  final num sugar, money;
  final List<String> slipped;
  final Map<String, dynamic> _json;
  const CartFact._(
    this.entryId,
    this.planned,
    this.kept,
    this.sugar,
    this.money,
    this.slipped,
    this._json,
  );
  static CartFact? tryJson(Object? j) {
    if (j is! Map || j['entryId'] is! String) return null;
    num n(Object? v) => v is num ? v : 0;
    final saved = j['saved'];
    return CartFact._(
      j['entryId'] as String,
      n(j['planned']).toInt(),
      n(j['kept']).toInt(),
      saved is Map ? n(saved['sugar']) : 0,
      n(j['money']),
      [
        for (final s in (j['slipped'] as List? ?? const []))
          if (s is String) s,
      ],
      Map<String, dynamic>.from(j),
    );
  }
}

class Cart {
  final String id, kind, store, date;
  final int createdAt;

  /// часть товаров не видна
  final bool hidden, demo;
  final List<Item> items;

  /// решили убрать и заменить
  final List<int> out, swaps;
  final int? doneAt;
  final CartFact? fact;
  const Cart({
    required this.id,
    required this.kind,
    required this.store,
    required this.date,
    required this.createdAt,
    required this.items,
    this.hidden = false,
    this.demo = false,
    this.out = const [],
    this.swaps = const [],
    this.doneAt,
    this.fact,
  });

  Cart copyWith({
    List<Item>? items,
    List<int>? out,
    List<int>? swaps,
    int? doneAt,
    CartFact? fact,
  }) => Cart(
    id: id,
    kind: kind,
    store: store,
    date: date,
    createdAt: createdAt,
    hidden: hidden,
    demo: demo,
    items: items ?? this.items,
    out: out ?? this.out,
    swaps: swaps ?? this.swaps,
    doneAt: doneAt ?? this.doneAt,
    fact: fact ?? this.fact,
  );

  /// В виде чека — для общих расчётов и правки.
  Receipt get receipt => Receipt(
    id: id,
    title: 'Корзина',
    store: store.isEmpty ? 'Корзина' : store,
    date: date,
    items: items,
    approx: true,
    via: 'photo',
  );

  Map<String, dynamic> toJson() => {
    'id': id,
    'createdAt': createdAt,
    'date': date,
    'kind': kind,
    'store': store,
    'hidden': hidden,
    'items': [for (final it in items) it.toJson()],
    'out': out,
    'swaps': swaps,
    if (doneAt != null) 'doneAt': doneAt,
    if (demo) 'demo': true,
    if (fact != null) 'fact': fact!._json,
  };

  static Cart? tryJson(Object? j) {
    try {
      if (j is! Map) return null;
      final items = [for (final it in j['items'] as List) Item.fromJson(it)];
      if (items.isEmpty) return null;
      List<int> nums(Object? v) => [
        for (final i in (v is List ? v : const []))
          if (i is num && i >= 0 && i < items.length) i.toInt(),
      ];
      return Cart(
        id: j['id'] as String,
        kind: j['kind'] == 'order' ? 'order' : 'basket',
        store: j['store'] is String ? j['store'] as String : '',
        date: j['date'] as String,
        createdAt: (j['createdAt'] as num).toInt(),
        hidden: j['hidden'] == true,
        demo: j['demo'] == true,
        items: items,
        out: nums(j['out']),
        swaps: nums(j['swaps']),
        doneAt: (j['doneAt'] as num?)?.toInt(),
        fact: CartFact.tryJson(j['fact']),
      );
    } catch (_) {
      return null;
    }
  }
}

double _round1(num v) => (v * 10).round() / 10;

/// Все ли цены известны: на фото корзины их обычно нет.
bool priced(List<Item> items) =>
    items.isNotEmpty && items.every((it) => it.p > 0);

/// Расчёт корзины с решениями. Без цен доля вредного считается по числу позиций.
({Analysis a, int score}) cartAnalysis(
  Cart c, [
  List<int>? out,
  List<int>? swaps,
]) {
  final o = out ?? c.out, s = swaps ?? c.swaps;
  final a = analyze(c.receipt, s, o);
  if (priced(c.items)) return (a: a, score: a.score);
  final flat = analyze(
    c.receipt.copyWith(
      items: [
        for (final it in c.items)
          it.copyWith(p: 1, swap: it.swap?.copyWith(p: 1)),
      ],
    ),
    s,
    o,
  );
  return (a: a, score: flat.score);
}

double _harm(Item it, [int weeks = 1]) =>
    (it.s / 5 + it.t / 0.5 + it.f / 2) / weeks;
const _flagHarm = 8, _minGain = 2, _swapEnough = 0.6;

/// Решение по позиции: убрать ('out') или заменить ('swap').
class Move {
  final int i;
  final String kind;

  /// что сильнее всего уменьшится
  final MetricId metric;
  final double gain;
  const Move(this.i, this.kind, this.metric, this.gain);
}

/// Советы по корзине, самые полезные сверху. Обычную еду убирать не советуем.
List<Move> cartMoves(List<Item> items) {
  final list = <Move>[];
  for (final (i, it) in items.indexed) {
    if (it.nf || it.weeks > 1) continue;
    final own = _harm(it) + (it.x != null ? _flagHarm : 0);
    final swap = it.swap;
    final swapGain = swap == null ? double.negativeInfinity : own - _harm(swap);
    final kind = swap != null && swapGain >= own * _swapEnough
        ? 'swap'
        : it.junk || it.x != null
        ? 'out'
        : swap != null && swapGain >= _minGain
        ? 'swap'
        : null;
    if (kind == null) continue;
    final gain = kind == 'swap' ? swapGain : own;
    if (gain < _minGain) continue;
    final by = [
      for (final (k, m) in const [
        MetricId.sugar,
        MetricId.salt,
        MetricId.fat,
      ].indexed)
        (
          k: k,
          m: m,
          c:
              (it.valueOf(m) - (kind == 'swap' ? swap!.valueOf(m) : 0)) /
              metrics[m]!.cubeG,
        ),
    ]..sort((a, b) => a.c != b.c ? b.c.compareTo(a.c) : a.k - b.k);
    list.add(Move(i, kind, by.first.m, _round1(gain)));
  }
  return list
    ..sort((a, b) => a.gain != b.gain ? b.gain.compareTo(a.gain) : a.i - b.i);
}

const topMoves = 4;

typedef Advice = ({
  List<Move> moves,
  int enough,
  Analysis before,
  Analysis after,
  MetricId metric,
});

({List<int> out, List<int> swaps}) decide(Iterable<Move> list) => (
  out: [
    for (final m in list)
      if (m.kind == 'out') m.i,
  ]..sort(),
  swaps: [
    for (final m in list)
      if (m.kind == 'swap') m.i,
  ]..sort(),
);

/// Самое малое число решений, после которого корзина становится нормальной. Не больше трёх.
Advice advise(Cart c) {
  final list = cartMoves(c.items);
  final before = cartAnalysis(c, const [], const []).a;
  final total = c.items.fold<double>(
    0,
    (n, it) => n + (it.nf ? 0 : _harm(it, it.weeks)),
  );
  var enough = 0, gone = 0.0;
  var after = cartAnalysis(c, const [], const []);
  while (enough < 3 && enough < list.length) {
    if (enough > 0 && after.score >= 60 && gone >= total * 0.4) break;
    gone += list[enough].gain;
    enough++;
    final d = decide(list.take(enough));
    after = cartAnalysis(c, d.out, d.swaps);
  }
  double drop(MetricId m) => before.totals[m]! > 0
      ? (before.totals[m]! - after.a.totals[m]!) / before.totals[m]!
      : 0;
  final sugar =
      before.totals[MetricId.sugar]! - after.a.totals[MetricId.sugar]!;
  var metric = MetricId.sugar;
  if (cubesOfValue(sugar, MetricId.sugar) < 3) {
    for (final m in const [MetricId.salt, MetricId.fat]) {
      if (drop(m) > drop(metric)) metric = m;
    }
  }
  return (
    moves: list,
    enough: enough,
    before: before,
    after: after.a,
    metric: metric,
  );
}

/// На сколько корзина стала дешевле; null — цены известны не у всех.
num? cartMoney(Cart c) {
  final touched = [...c.out, ...c.swaps];
  if (touched.isEmpty || touched.any((i) => c.items[i].p <= 0)) return null;
  num n = 0;
  for (final i in c.out) {
    n += c.items[i].p;
  }
  for (final i in c.swaps) {
    final it = c.items[i], to = it.swap?.p ?? 0;
    n += it.p - (to > 0 ? to : it.p);
  }
  return n;
}

/// Сколько корзина добавит к неделе: запасы входят недельной долей.
double weekAdd(Cart c, List<int> out, List<int> swaps, MetricId m) {
  var n = 0.0;
  for (final (i, it) in c.items.indexed) {
    if (it.nf || out.contains(i)) continue;
    final v = swaps.contains(i) && it.swap != null ? it.swap! : it;
    n += v.valueOf(m) / it.weeks;
  }
  return n;
}

typedef CartResult = ({Cart cart, String? notice, List<int> pending});

/// Корзины на этом телефоне. Новые сверху.
class CartStore extends ChangeNotifier {
  static const _key = 'chekup.carts', _max = 30;

  /// корзина ждёт чека столько часов
  static const _wait = Duration(hours: 36);
  List<Cart> list = const [];
  SharedPreferences? _sp;

  Future<void> load() async {
    try {
      _sp = await SharedPreferences.getInstance();
      final raw = jsonDecode(_sp!.getString(_key) ?? '[]');
      list = [
        for (final j in raw as List) Cart.tryJson(j),
      ].whereType<Cart>().toList();
      notifyListeners();
    } catch (_) {}
  }

  void _set(List<Cart> next) {
    list = next.take(_max).toList();
    notifyListeners();
    final sp = _sp;
    if (sp == null) return;
    unawaited(
      sp.setString(_key, jsonEncode([for (final c in list) c.toJson()])),
    );
  }

  Cart? byId(String id) => list.where((c) => c.id == id).firstOrNull;
  void put(Cart c) => _set([
    c,
    for (final x in list)
      if (x.id != c.id && !(c.demo && x.demo)) x,
  ]);
  void update(Cart c) => _set([for (final x in list) x.id == c.id ? c : x]);
  void remove(String id) => _set([
    for (final x in list)
      if (x.id != id) x,
  ]);
  void clear() => _set(const []);

  Cart? get waiting {
    final now = DateTime.now().millisecondsSinceEpoch;
    return list
        .where(
          (c) =>
              c.doneAt != null &&
              c.fact == null &&
              !c.demo &&
              now - c.doneAt! < _wait.inMilliseconds,
        )
        .firstOrNull;
  }

  CartFact? factFor(String entryId) =>
      list.where((c) => c.fact?.entryId == entryId).firstOrNull?.fact;

  Cart demo() {
    final c = Cart(
      id: 'demo',
      kind: 'basket',
      store: '',
      date: todayIso(),
      createdAt: 0,
      items: demoCart,
      demo: true,
    );
    put(c);
    return c;
  }

  /// Записан новый чек: если он про недавнюю корзину, запомнить, что получилось.
  Future<void> settle(Receipt r, String entryId) async {
    final open = [
      for (final c in list)
        if (c.doneAt != null && c.fact == null && !c.demo) c,
    ].take(5).toList();
    if (open.isEmpty || !store.syncEnabled) return;
    try {
      final got = await store.call('POST', '/api/cart/settle', {
        'entryId': entryId,
        'receipt': r.toJson(),
        'carts': [for (final c in open) c.toJson()],
      });
      final fact = CartFact.tryJson(got['fact']);
      final c = fact == null ? null : byId('${got['cartId']}');
      if (c != null) update(c.copyWith(fact: fact));
    } catch (_) {} // сверим по следующему чеку
  }

  /// Показатели товаров, которых нет в справочнике.
  Future<void> refine(Cart c, List<int> pending) async {
    final at = [
      for (final i in pending)
        if (i < c.items.length) i,
    ].take(40).toList();
    final got = await enrichItems([
      for (final i in at) (n: c.items[i].n, p: c.items[i].p),
    ]);
    final cur = byId(c.id);
    if (got == null || cur == null || cur.items.length != c.items.length) {
      return;
    }
    final next = [...cur.items];
    for (final (k, i) in at.indexed) {
      // пока уточняли, человек мог исправить строку
      if (k < got.length &&
          got[k] != null &&
          next[i].n == c.items[i].n &&
          next[i].src == null) {
        next[i] = got[k]!.copyWith(q: next[i].q);
      }
    }
    update(cur.copyWith(items: next));
  }
}

final carts = CartStore();

/// Корзина по фото или скриншотам.
Future<CartResult> recognizeCart(List<Uint8List> photos) async {
  if (!store.syncEnabled) {
    return (cart: carts.demo(), notice: cartDemoNotice, pending: const <int>[]);
  }
  if (photos.any((b) => b.length > 7 * 1024 * 1024)) {
    throw ScanError('too_large');
  }
  try {
    final r = await store.authed((token) => Api.cart(photos, token: token));
    final d = r['cart'] as Map;
    final now = DateTime.now().millisecondsSinceEpoch;
    final notice = r['notice'] as String?;
    final cart = Cart.tryJson({
      ...d,
      'id': 'c${now.toRadixString(36)}',
      'createdAt': now,
      'date': todayIso(),
      if (notice != null) 'demo': true,
    });
    if (cart == null) throw ScanError('cart_empty');
    carts.put(cart);
    return (
      cart: cart,
      notice: notice,
      pending: [
        for (final i in (r['pending'] as List? ?? const []))
          if (i is num) i.toInt(),
      ],
    );
  } on ApiException catch (e) {
    throw ScanError(
      scanErrors.containsKey(e.code)
          ? e.code
          : e.status == 413
          ? 'too_large'
          : e.status == 429
          ? 'rate_limit'
          : 'unavailable',
    );
  }
}

// Корзина до кассы: съёмка, разбор и экран «убери или замени».
// В журнал ничего не пишется: это ещё не покупка. «Готово, на кассу» запоминает решения, чтобы сверить их с чеком.
import 'dart:async';
import 'dart:math';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../core/cart.dart';
import '../core/engine.dart';
import '../core/i18n.dart';
import '../core/insights.dart';
import '../core/models.dart';
import '../core/scan.dart';
import '../core/store.dart';
import '../ui/forms.dart';
import '../ui/kit.dart';
import '../ui/metric_icon.dart';
import '../ui/pile_hero.dart';
import 'edit.dart';
import 'shell.dart';

const Forms _goodsF = ('товар', 'товара', 'товаров');
const Forms _stepsF = ('решение', 'решения', 'решений');
const Forms _swapsF = ('замена', 'замены', 'замен');
const _go = Color(0xFF0E8A51), _mint = Color(0xFFE6F8EF);

/// «Проверить корзину»: сфоткать то, что в руках, или прислать скриншот заказа.
Future<void> openCartSheet(BuildContext context) async {
  final how = await showSheet<String>(
    context,
    title: t('Проверим корзину'),
    builder: (context) => Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        RowBtn(
          t('Сфоткать корзину'),
          hint: t(
            'тележка, пакет или товары в руках; поверни упаковки названиями к камере',
          ),
          icon: Icons.photo_camera_rounded,
          onTap: () => Navigator.pop(context, 'camera'),
        ),
        RowBtn(
          t('Скриншот или фото'),
          hint: t('корзина из приложения доставки, до трёх снимков'),
          icon: Icons.photo_library_rounded,
          onTap: () => Navigator.pop(context, 'gallery'),
        ),
        RowBtn(
          t('Показать на примере'),
          hint: t('как это выглядит'),
          icon: Icons.shopping_basket_rounded,
          onTap: () => Navigator.pop(context, 'demo'),
        ),
      ],
    ),
  );
  if (how == null || !context.mounted) return;
  final nav = Navigator.of(context);
  switch (how) {
    case 'camera':
      final f = await shootMore();
      if (f != null) scanCart(nav, [f]);
    case 'gallery':
      final files = await pickPhotos();
      if (files.isNotEmpty) scanCart(nav, files.take(3).toList());
    default:
      openCart(nav, carts.demo().id);
  }
}

void scanCart(NavigatorState nav, List<XFile> photos) {
  nav.popUntil((r) => r.isFirst);
  nav.push(pageRoute(CartScanPage(photos: photos)));
}

void openCart(
  NavigatorState nav,
  String id, {
  List<XFile> photos = const [],
  bool replace = false,
}) {
  final route = pageRoute<void>(CartPage(id: id, photos: photos));
  replace ? nav.pushReplacement(route) : nav.push(route);
}

/// Разбор корзины: фото под лучом, найденные товары появляются по одному.
class CartScanPage extends StatefulWidget {
  final List<XFile> photos;
  const CartScanPage({super.key, required this.photos});
  @override
  State<CartScanPage> createState() => _CartScanPageState();
}

class _CartScanPageState extends State<CartScanPage>
    with SingleTickerProviderStateMixin {
  static const _wait = [
    'Узнаю товары',
    'Считаю упаковки',
    'Сверяю со справочником',
    'Смотрю, что лишнее',
    'Ещё немного',
  ];
  late final _beam = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1250),
  )..repeat();
  late final Timer _waiter;
  final _timers = <Timer>[];
  final _t0 = DateTime.now();
  Uint8List? _bytes;
  int _waitI = 0;
  List<String> _names = const [];
  int _seen = 0;

  @override
  void initState() {
    super.initState();
    _waiter = Timer.periodic(const Duration(milliseconds: 1500), (_) {
      if (mounted) setState(() => _waitI = (_waitI + 1) % _wait.length);
    });
    unawaited(_run());
  }

  Future<void> _run() async {
    try {
      final bytes = await bytesOf(widget.photos);
      if (!mounted) return;
      setState(() => _bytes = bytes.first);
      final r = await recognizeCart(bytes);
      if (!mounted) return;
      _waiter.cancel();
      _names = [for (final it in r.cart.items) it.n];
      final step = min(220, 1500 ~/ _names.length);
      for (var k = 0; k < _names.length; k++) {
        _later(k * step, () {
          tick();
          setState(() => _seen = k + 1);
        });
      }
      final spent = DateTime.now().difference(_t0).inMilliseconds;
      _later(max(1900 - spent, _names.length * step + 350), () {
        openCart(
          Navigator.of(context),
          r.cart.id,
          photos: r.notice == null ? widget.photos : const [],
          replace: true,
        );
        if (r.notice != null) showToast(t(r.notice!));
        if (r.pending.isNotEmpty) unawaited(carts.refine(r.cart, r.pending));
      });
    } on ScanError catch (e) {
      _fail(e.code);
    } catch (_) {
      _fail('unavailable');
    }
  }

  void _fail(String code) {
    if (!mounted) return;
    final nav = Navigator.of(context);
    nav.pop();
    if (code == 'is_receipt') {
      showToast(
        t('Это уже чек, а не корзина'),
        action: (
          label: t('Открыть как чек'),
          run: () => scanAgain(nav, widget.photos),
        ),
      );
    } else {
      showToast(t(scanErrors[code]!));
    }
  }

  void _later(int ms, VoidCallback fn) => _timers.add(
    Timer(Duration(milliseconds: max(0, ms)), () => mounted ? fn() : null),
  );

  @override
  void dispose() {
    _waiter.cancel();
    for (final x in _timers) {
      x.cancel();
    }
    _beam.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final mq = MediaQuery.of(context);
    final side = min(mq.size.width * .72, mq.size.height * .36);
    return Scaffold(
      body: DecoratedBox(
        decoration: const BoxDecoration(gradient: sky),
        child: SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 10, 20, 24),
            child: Column(
              children: [
                Row(
                  children: [
                    BarButton(
                      Icons.close_rounded,
                      t('Отменить'),
                      () => Navigator.of(context).pop(),
                    ),
                    Expanded(
                      child: Text(
                        t('До кассы').toUpperCase(),
                        textAlign: TextAlign.center,
                        style: body(12, w: 800, color: Colors.white),
                      ),
                    ),
                    const SizedBox(width: 46),
                  ],
                ),
                Expanded(
                  child: Center(
                    child: Container(
                      width: side,
                      height: side * 1.14,
                      clipBehavior: Clip.antiAlias,
                      decoration: BoxDecoration(
                        color: tint,
                        borderRadius: BorderRadius.circular(26),
                        border: Border.all(color: Colors.white, width: 4),
                        boxShadow: [
                          BoxShadow(
                            color: ink.withValues(alpha: .45),
                            blurRadius: 30,
                            offset: const Offset(0, 24),
                          ),
                        ],
                      ),
                      child: Stack(
                        fit: StackFit.expand,
                        children: [
                          if (_bytes != null)
                            Image.memory(_bytes!, fit: BoxFit.cover),
                          AnimatedBuilder(
                            animation: _beam,
                            builder: (_, _) => Align(
                              alignment: Alignment(0, _beam.value * 2 - 1),
                              child: Container(
                                height: 54,
                                decoration: BoxDecoration(
                                  gradient: LinearGradient(
                                    begin: Alignment.topCenter,
                                    end: Alignment.bottomCenter,
                                    colors: [
                                      blue2.withValues(alpha: 0),
                                      blue2.withValues(alpha: .55),
                                    ],
                                  ),
                                  border: const Border(
                                    bottom: BorderSide(
                                      color: Colors.white,
                                      width: 3,
                                    ),
                                  ),
                                ),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
                FittedBox(
                  child: Text(
                    '${t('Смотрю корзину')}…',
                    style: disp(30, w: 900, color: Colors.white),
                  ),
                ),
                const SizedBox(height: 14),
                SizedBox(
                  height: 48,
                  child: Center(
                    child: AnimatedSwitcher(
                      duration: const Duration(milliseconds: 180),
                      child: Text(
                        _seen > 0 ? nb(_names[_seen - 1]) : t(_wait[_waitI]),
                        key: ValueKey(_seen > 0 ? _seen : -1 - _waitI),
                        maxLines: 2,
                        textAlign: TextAlign.center,
                        style: body(15, w: 700, color: Colors.white),
                      ),
                    ),
                  ),
                ),
                Text('$_seen', style: disp(58, w: 900, color: Colors.white)),
                Text(
                  pl(_seen, _goodsF),
                  style: body(14, w: 700, color: Colors.white),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// «42 кубика», «2,3 г соли»
String _deltaTxt(num v, MetricId m) => isCubeMetric(m)
    ? cubesTxt(cubesOfValue(v, m))
    : '${amountTxt(v, m)} ${t(metrics[m]!.of)}';
String _bigTxt(num v, MetricId m) => isCubeMetric(m)
    ? cubesTxt(cubesOfValue(v, m))
    : '${bigNum(v, m)} ${t(metrics[m]!.unit)}';

class CartPage extends StatefulWidget {
  final String id;

  /// снимки: чтобы доснять ещё один
  final List<XFile> photos;
  const CartPage({super.key, required this.id, this.photos = const []});
  @override
  State<CartPage> createState() => _CartPageState();
}

class _CartPageState extends State<CartPage> {
  MetricId _metric = MetricId.sugar;
  bool _all = false, _rest = false;
  final _scroll = ScrollController();

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  void _set(Cart c, int i, String? kind) {
    thud();
    List<int> with_(List<int> l, bool on) => [
      for (final x in l)
        if (x != i) x,
      if (on) i,
    ]..sort();
    carts.update(
      c.copyWith(
        out: with_(c.out, kind == 'out'),
        swaps: with_(c.swaps, kind == 'swap'),
      ),
    );
  }

  String? _stateOf(Cart c, int i) => c.out.contains(i)
      ? 'out'
      : c.swaps.contains(i)
      ? 'swap'
      : null;

  void _doFirst(Cart c, List<Move> first) {
    thud();
    final d = decide(first), ids = {for (final m in first) m.i};
    List<int> mix(List<int> own, List<int> add) =>
        ({...own.where((i) => !ids.contains(i)), ...add}.toList())..sort();
    carts.update(
      c.copyWith(out: mix(c.out, d.out), swaps: mix(c.swaps, d.swaps)),
    );
    _scroll.animateTo(
      0,
      duration: const Duration(milliseconds: 350),
      curve: Curves.easeOutCubic,
    );
  }

  void _done(Cart c) {
    Navigator.of(context).pop();
    if (c.demo) {
      carts.remove(c.id);
      return;
    }
    if (c.doneAt != null) return;
    carts.update(c.copyWith(doneAt: DateTime.now().millisecondsSinceEpoch));
    showToast(t('Готово. После кассы сфоткай чек: сверим, что получилось'));
  }

  Future<void> _edit(Cart c) async {
    final r = await editReceipt(
      context,
      receipt: c.receipt,
      off: c.out,
      cart: true,
    );
    if (r == null) return;
    // решения держатся за название: строки могли удалить или переставить
    final items = r.receipt.items;
    Iterable<int> moved(List<int> l) => [
      for (final i in l)
        items.indexWhere(
          (it) => it.n == c.items[i].n || it.raw == c.items[i].n,
        ),
    ].where((i) => i >= 0);
    final out = {...moved(c.out), ...r.off}.toList()..sort();
    final swaps = {
      ...moved(c.swaps).where((i) => items[i].swap != null && !out.contains(i)),
    }.toList()..sort();
    carts.update(c.copyWith(items: items, out: out, swaps: swaps));
    showToast(t('Корзина исправлена'));
  }

  Future<void> _more() async {
    final nav = Navigator.of(context);
    final f = await shootMore();
    if (f != null) scanCart(nav, [...widget.photos, f].take(3).toList());
  }

  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: Listenable.merge([carts, store]),
    builder: (context, _) {
      final c = carts.byId(widget.id);
      if (c == null) {
        return const Scaffold(
          body: DecoratedBox(
            decoration: BoxDecoration(gradient: sky),
            child: SizedBox.expand(),
          ),
        );
      }
      return _page(context, c);
    },
  );

  Widget _page(BuildContext context, Cart c) {
    final mq = MediaQuery.of(context);
    final adv = advise(c), now = cartAnalysis(c), start = adv.before;
    final first = adv.moves.take(adv.enough).toList();
    final touched = c.out.isNotEmpty || c.swaps.isNotEmpty;
    final v = verdict(now.score);
    final total = now.a.totals[_metric]!;
    final listed = {for (final m in adv.moves) m.i};
    final shown = [
      for (final (k, m) in adv.moves.indexed)
        if (_all || k < topMoves || _stateOf(c, m.i) != null) m,
    ];
    final others =
        [
          for (var i = 0; i < c.items.length; i++)
            if (!listed.contains(i)) i,
        ]..sort((a, b) {
          final d = c.items[b]
              .valueOf(_metric)
              .compareTo(c.items[a].valueOf(_metric));
          return d != 0 ? d : a - b;
        });
    final food = c.items.where((it) => !it.nf).length;
    final pending = c.items.where((it) => !it.nf && it.src == null).length;
    final week = weekStats(store.real, store.profile).metrics[MetricId.sugar]!;
    int ratio(double g) => ((week.total + g) / week.norm * 100).round();
    final before = ratio(weekAdd(c, const [], const [], MetricId.sugar));
    final after = ratio(weekAdd(c, c.out, c.swaps, MetricId.sugar));
    final canMore = widget.photos.isNotEmpty && widget.photos.length < 3;
    final m0 = adv.metric;

    return Scaffold(
      backgroundColor: Colors.white,
      body: Column(
        children: [
          Expanded(
            child: DecoratedBox(
              decoration: const BoxDecoration(gradient: sky),
              child: LayoutBuilder(
                builder: (context, box) => SingleChildScrollView(
                  controller: _scroll,
                  child: Column(
                    children: [
                      PileHero(
                        height: max(420.0, box.maxHeight * .78),
                        kick: touched
                            ? t('Останется в корзине')
                            : t('Сейчас в корзине'),
                        target: pileCount(total, _metric),
                        maxCubes: max(
                          1,
                          min(
                            220,
                            max(
                              start.cubesBy[_metric]!,
                              now.a.cubesBy[_metric]!,
                            ),
                          ),
                        ),
                        value: total,
                        metric: _metric,
                        level: store.streak.level,
                        onMetric: (m) => setState(() => _metric = m),
                        bar: Row(
                          children: [
                            BarButton(
                              Icons.arrow_back_ios_new_rounded,
                              t('Назад'),
                              () => Navigator.of(context).pop(),
                            ),
                            Expanded(
                              child: Padding(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 8,
                                ),
                                child: Center(
                                  child: TonePill(
                                    v.tone,
                                    t('{n} из 100 · {v}', {
                                      'n': now.score,
                                      'v': v.label.toLowerCase(),
                                    }),
                                  ),
                                ),
                              ),
                            ),
                            BarButton(
                              Icons.edit_rounded,
                              t('Исправить корзину'),
                              () => _edit(c),
                            ),
                          ],
                        ),
                      ),
                      Sheet(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            Padding(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 4,
                              ),
                              child: Text(
                                adv.moves.isEmpty
                                    ? t('Хорошая корзина. Можно на кассу.')
                                    : t(
                                        '{n} {w}, и {x} станет {a} вместо {b}',
                                        {
                                          'n': adv.enough,
                                          'w': pl(
                                            adv.enough,
                                            first.every((m) => m.kind == 'swap')
                                                ? _swapsF
                                                : _stepsF,
                                          ),
                                          'x': t(metrics[m0]!.of),
                                          'a': bigNum(
                                            adv.after.totals[m0]!,
                                            m0,
                                          ),
                                          'b': _bigTxt(start.totals[m0]!, m0),
                                        },
                                      ),
                                style: disp(21, w: 800, h: 1.2, ls: -.03),
                              ),
                            ),
                            const SizedBox(height: 10),
                            Padding(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 4,
                              ),
                              child: Text(
                                [
                                  c.kind == 'order' ? t('Заказ') : t('Корзина'),
                                  if (c.store.isNotEmpty) c.store,
                                  '$food ${pl(food, _goodsF)}',
                                  if (priced(c.items)) money(start.total),
                                  if (c.demo) t('пример'),
                                ].join(' · '),
                                style: body(13, color: mute),
                              ),
                            ),
                            if (pending > 0)
                              Padding(
                                padding: const EdgeInsets.fromLTRB(4, 8, 4, 0),
                                child: Text(
                                  t('Уточняю состав: {n} {w}', {
                                    'n': pending,
                                    'w': pl(pending, _goodsF),
                                  }),
                                  style: body(13, color: mute),
                                ),
                              ),
                            if (c.hidden && canMore) ...[
                              const SizedBox(height: 14),
                              FlatBtn(
                                '${t('Видно не всё: часть товаров закрыта.')} ${t('Доснять')}',
                                color: blue1,
                                height: 60,
                                onTap: _more,
                              ),
                            ],
                            if (shown.isNotEmpty) ...[
                              const SizedBox(height: 26),
                              SecTitle(t('Что сделать до кассы')),
                              for (final m in shown) _moveRow(c, m),
                              if (adv.moves.length > shown.length)
                                FlatBtn(
                                  t('Ещё советы: {n}', {
                                    'n': adv.moves.length - shown.length,
                                  }),
                                  white: true,
                                  color: blue1,
                                  onTap: () => setState(() => _all = true),
                                ),
                            ],
                            if (week.norm > 0 && before > 0) ...[
                              const SizedBox(height: 20),
                              _week(before, after),
                            ],
                            if (others.isNotEmpty) ...[
                              const SizedBox(height: 16),
                              FlatBtn(
                                t(
                                  listed.isEmpty
                                      ? 'Что в корзине: {n}'
                                      : 'Остальное в корзине: {n}',
                                  {'n': others.length},
                                ),
                                icon: _rest
                                    ? Icons.expand_less_rounded
                                    : Icons.expand_more_rounded,
                                color: blue1,
                                onTap: () => setState(() => _rest = !_rest),
                              ),
                              if (_rest)
                                for (final i in others) _restRow(c, i),
                            ],
                            const SizedBox(height: 20),
                            if (first.isNotEmpty &&
                                !touched &&
                                c.doneAt == null)
                              RowBtn(
                                t('Оставлю как есть, на кассу'),
                                icon: Icons.check_rounded,
                                onTap: () => _done(c),
                              ),
                            RowBtn(
                              t('Узнали неверно? Исправь или добавь'),
                              icon: Icons.edit_rounded,
                              onTap: () => _edit(c),
                            ),
                            if (canMore && !c.hidden)
                              RowBtn(
                                t('Доснять корзину'),
                                icon: Icons.photo_camera_rounded,
                                onTap: _more,
                              ),
                            RowBtn(
                              t('Удалить корзину'),
                              icon: Icons.delete_outline_rounded,
                              onTap: () {
                                Navigator.of(context).pop();
                                carts.remove(c.id);
                                showToast(t('Корзина удалена'));
                              },
                            ),
                            const SizedBox(height: 14),
                            Text(
                              t(
                                'Узнаём товары по фото, вес и состав оцениваем примерно. Это не совет врача.',
                              ),
                              textAlign: TextAlign.center,
                              style: body(12, color: mute, h: 1.5),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
          _footer(c, start, now.a, touched, first, mq.padding.bottom),
        ],
      ),
    );
  }

  Widget _footer(
    Cart c,
    Analysis start,
    Analysis now,
    bool touched,
    List<Move> first,
    double bottom,
  ) {
    final saved = cartMoney(c);
    final advise = first.isNotEmpty && !touched && c.doneAt == null;
    final n0 = bigNum(start.totals[MetricId.sugar]!, MetricId.sugar);
    final n1 = bigNum(now.totals[MetricId.sugar]!, MetricId.sugar);
    return Container(
      padding: EdgeInsets.fromLTRB(14, 10, 14, 12 + bottom),
      decoration: BoxDecoration(
        color: Colors.white,
        boxShadow: [
          BoxShadow(
            color: ink.withValues(alpha: .14),
            blurRadius: 30,
            offset: const Offset(0, -10),
          ),
        ],
      ),
      child: Row(
        children: [
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  if (touched) ...[
                    Text(
                      n0,
                      style: disp(
                        17,
                        w: 900,
                        color: mute,
                      ).copyWith(decoration: TextDecoration.lineThrough),
                    ),
                    const Icon(Icons.arrow_forward_rounded, size: 17),
                  ],
                  Text(n1, style: disp(22, w: 900)),
                  const SizedBox(width: 4),
                  const MetricIcon(MetricId.sugar, 20),
                ],
              ),
              if (saved != null && saved != 0)
                Text(
                  '${saved > 0 ? '−' : '+'}${money(saved.abs())}',
                  style: body(13, w: 800, color: _go),
                ),
            ],
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Press(
              scale: .98,
              onTap: () => advise ? _doFirst(c, first) : _done(c),
              child: Container(
                height: 58,
                padding: const EdgeInsets.symmetric(horizontal: 12),
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: advise ? blue1 : _go,
                  borderRadius: BorderRadius.circular(20),
                ),
                child: FittedBox(
                  fit: BoxFit.scaleDown,
                  child: Text(
                    advise
                        ? t('Так и сделаю')
                        : c.doneAt != null
                        ? t('Готово')
                        : t('Готово, на кассу'),
                    style: disp(16, w: 700, color: Colors.white, ls: -.01),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _moveRow(Cart c, Move m) {
    final it = c.items[m.i], state = _stateOf(c, m.i), swap = it.swap;
    final diff = it.p > 0 && swap != null && swap.p > 0 ? it.p - swap.p : 0;

    Widget btn(String kind, String text, List<Widget> under) {
      final on = state == kind, best = m.kind == kind;
      return Expanded(
        child: Press(
          scale: .97,
          label: '$text: ${it.n}',
          onTap: () => _set(c, m.i, on ? null : kind),
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 200),
            constraints: const BoxConstraints(minHeight: 50),
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: on ? _go : Colors.white,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(
                color: on
                    ? _go
                    : best
                    ? blue1
                    : Colors.white,
                width: 2,
              ),
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  on ? '✓ $text' : text,
                  textAlign: TextAlign.center,
                  style: body(
                    14,
                    w: 800,
                    color: on
                        ? Colors.white
                        : best
                        ? blue1
                        : ink,
                  ),
                ),
                ...under,
              ],
            ),
          ),
        ),
      );
    }

    TextStyle small(bool on) => body(12, color: on ? Colors.white : mute);
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: state == null ? tint : _mint,
        borderRadius: BorderRadius.circular(24),
      ),
      child: Column(
        children: [
          Row(
            children: [
              MetricIcon(m.metric, 36),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      nb(it.n),
                      style: body(15, w: 700, color: state == null ? ink : mute)
                          .copyWith(
                            decoration: state == null
                                ? null
                                : TextDecoration.lineThrough,
                          ),
                    ),
                    Text(
                      [
                        it.x == 'alcohol'
                            ? t('алкоголь')
                            : it.x == 'energy'
                            ? t('энергетик')
                            : _deltaTxt(it.valueOf(m.metric), m.metric),
                        if (it.q) t('возможно, узнали неверно'),
                      ].join(' · '),
                      style: body(13, w: 700, color: mute),
                    ),
                  ],
                ),
              ),
              if (it.p > 0) ...[
                const SizedBox(width: 8),
                Text(money(it.p), style: disp(14, w: 800)),
              ],
            ],
          ),
          const SizedBox(height: 10),
          IntrinsicHeight(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (swap != null) ...[
                  btn('swap', t('Заменить'), [
                    Text(
                      nb(swap.n),
                      textAlign: TextAlign.center,
                      style: small(state == 'swap'),
                    ),
                    if (diff != 0)
                      Text(
                        '${diff > 0 ? '−' : '+'}${money(diff.abs())}',
                        style: body(
                          12,
                          w: 800,
                          color: state == 'swap' ? Colors.white : _go,
                        ),
                      ),
                  ]),
                  const SizedBox(width: 8),
                ],
                btn('out', state == 'out' ? t('Убрано') : t('Убрать'), [
                  if (swap != null)
                    Text(t('совсем'), style: small(state == 'out')),
                ]),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _restRow(Cart c, int i) {
    final it = c.items[i], off = c.out.contains(i);
    return Container(
      margin: const EdgeInsets.only(top: 6),
      padding: const EdgeInsets.only(left: 14),
      constraints: const BoxConstraints(minHeight: 52),
      decoration: BoxDecoration(
        color: tint,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(
        children: [
          Expanded(
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 8),
              child: Text(
                '${nb(it.n)}${it.q ? '\n${t('возможно, узнали неверно')}' : ''}',
                style: body(
                  14,
                  color: off ? mute : ink,
                ).copyWith(decoration: off ? TextDecoration.lineThrough : null),
              ),
            ),
          ),
          const SizedBox(width: 8),
          Text(
            it.nf
                ? t('не еда')
                : it.src == null
                ? '…'
                : amountTxt(it.valueOf(_metric), _metric),
            style: disp(13, w: 800, color: mute),
          ),
          IconButton(
            onPressed: () => _set(c, i, off ? null : 'out'),
            tooltip: off
                ? t('Вернуть: {n}', {'n': it.n})
                : t('Убрать: {n}', {'n': it.n}),
            icon: Icon(
              off ? Icons.add_rounded : Icons.delete_outline_rounded,
              color: off ? blue1 : mute,
              size: 21,
            ),
          ),
        ],
      ),
    );
  }

  Widget _week(int before, int after) => Container(
    padding: const EdgeInsets.all(16),
    decoration: BoxDecoration(
      color: tint,
      borderRadius: BorderRadius.circular(24),
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(t('Неделя с этой корзиной'), style: disp(17, w: 800)),
        const SizedBox(height: 8),
        Wrap(
          crossAxisAlignment: WrapCrossAlignment.center,
          spacing: 10,
          children: [
            Text(
              '$after%',
              style: disp(
                34,
                w: 900,
                color: after > 100
                    ? bad
                    : after > 70
                    ? const Color(0xFFB57300)
                    : _go,
              ),
            ),
            Text(t('нормы сахара семьи'), style: body(14, color: mute)),
            if (after < before)
              Text(
                '$before%',
                style: disp(
                  15,
                  w: 800,
                  color: mute,
                ).copyWith(decoration: TextDecoration.lineThrough),
              ),
          ],
        ),
        const SizedBox(height: 10),
        ClipRRect(
          borderRadius: BorderRadius.circular(7),
          child: LinearProgressIndicator(
            value: min(1, after / 100),
            minHeight: 14,
            backgroundColor: Colors.white,
            color: after > 100 ? bad : mid,
          ),
        ),
      ],
    ),
  );
}

/// Чек сверен с корзиной: что осталось в магазине.
class CartFactCard extends StatelessWidget {
  final CartFact fact;
  const CartFactCard(this.fact, {super.key});
  @override
  Widget build(BuildContext context) {
    final cubes = cubesOfValue(max(0, fact.sugar), MetricId.sugar);
    return Container(
      margin: const EdgeInsets.only(top: 22),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: _mint,
        borderRadius: BorderRadius.circular(24),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            t('До кассы: {a} из {b}', {'a': fact.kept, 'b': fact.planned}),
            style: disp(18, w: 800),
          ),
          if (cubes > 0 || fact.money > 0)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Text(
                [
                  if (cubes > 0) cubesTxt(cubes),
                  if (fact.money > 0) money(fact.money),
                ].join(' · '),
                style: disp(28, w: 900, color: _go, h: 1.05),
              ),
            ),
          if (fact.kept > 0)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Text(
                t('осталось в магазине, а не дома.'),
                style: body(14),
              ),
            ),
          if (fact.slipped.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Text(
                t('Всё-таки в чеке: {list}.', {
                  'list': fact.slipped.join('; '),
                }),
                style: body(14),
              ),
            ),
        ],
      ),
    );
  }
}

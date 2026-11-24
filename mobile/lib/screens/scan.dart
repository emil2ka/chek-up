// Экран сканирования (~2,6 с): «бумажный» чек или фото, бегущий луч сканера,
// сменяющиеся сладкие позиции и растущий счётчик кубиков.
import 'dart:async';
import 'dart:math';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../core/engine.dart';
import '../core/i18n.dart';
import '../core/models.dart';
import '../core/outbox.dart';
import '../core/store.dart';
import '../ui/kit.dart';
import '../ui/metric_icon.dart';
import 'cart.dart';
import 'shell.dart';

const _duration =
    2600; // мс — минимум; настоящее распознавание может идти дольше
const _wait = [
  'Читаю позиции',
  'Разбираю сокращения кассы',
  'Сверяю со справочником',
  'Считаю шесть показателей',
  'Ещё немного',
];
const _lines = [.92, .64, .80, .48, .86, .70, .58, .90, .44, .76, .66, .84];

class ScanPage extends StatefulWidget {
  /// снимки чека (до трёх кадров) или пусто для демо
  final List<XFile> photos;
  final Receipt? receipt;
  const ScanPage({super.key, this.photos = const [], this.receipt});
  @override
  State<ScanPage> createState() => _ScanPageState();
}

class _ScanPageState extends State<ScanPage> with TickerProviderStateMixin {
  late final _beam = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1250),
  )..repeat();
  late final _bob = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 2800),
  )..repeat(reverse: true);
  final _timers = <Timer>[];
  Timer? _waiter;
  Uint8List? _bytes;
  Receipt? _found;
  (int, MetricId, String, String)? _tick;
  int _count = 0, _waitI = 0;

  final _jobId = Outbox.newId();
  bool _slow = false;

  @override
  void initState() {
    super.initState();
    _found = widget.receipt;
    _waiter = Timer.periodic(
      const Duration(milliseconds: 1700),
      (_) => setState(() => _waitI = (_waitI + 1) % _wait.length),
    );
    _later(900, () => setState(() => _slow = true));
    if (widget.receipt != null) {
      _show(widget.receipt!, ScanOutcome('demo', receipt: widget.receipt));
    } else {
      outbox.waitFor(_jobId, _arrived);
      _start();
    }
  }

  Future<void> _start() async {
    try {
      final bytes = await bytesOf(widget.photos);
      if (mounted) setState(() => _bytes = bytes.first);
      await outbox.enqueue(
        [for (final f in widget.photos) f.path],
        bytes,
        id: _jobId,
      );
    } catch (_) {
      _arrived(const ScanOutcome('error', code: 'bad_request'));
    }
  }

  void _arrived(ScanOutcome o) {
    if (!mounted) return;
    if (o.kind == 'error') {
      _waiter?.cancel();
      if (o.code == 'not_receipt' && widget.photos.isNotEmpty) {
        final nav = Navigator.of(context), photos = widget.photos;
        nav.pop();
        showToast(
          t('Похоже, это не чек'),
          action: (
            label: t('Это корзина'),
            run: () {
              unawaited(outbox.remove(_jobId));
              scanCart(nav, photos);
            },
          ),
        );
        return;
      }
      showToast(
        o.code == 'unavailable' || o.code == 'rate_limit'
            ? t('Чек в очереди: прочитаем, как только получится')
            : scanErrorText(o.code),
      );
      Navigator.of(context).pop();
      return;
    }
    _show(o.receipt!, o);
  }

  final _t0 = DateTime.now();

  void _show(Receipt r, ScanOutcome o) {
    _waiter?.cancel();
    setState(() => _found = r);
    final a = analyze(r);
    // позиции, где чего-то хотя бы кубик; для каждой показываем самый выраженный показатель
    const scanned = [MetricId.sugar, MetricId.salt, MetricId.fat];
    ({MetricId m, num v, int c}) worst(AnalyzedItem it) {
      final list = [
        for (final m in scanned)
          (m: m, v: it.item.valueOf(m), c: cubesOfValue(it.item.valueOf(m), m)),
      ]..sort((x, y) => y.c.compareTo(x.c));
      return list.first;
    }

    final sweet = a.items
        .where((it) => it.counted && worst(it).c >= 1)
        .take(8)
        .toList();
    final startAt = max(150, DateTime.now().difference(_t0).inMilliseconds);
    // позиции успевают прочитать, но готовый чек зря не держим
    final span = max(min(1400, sweet.length * 280), _duration - startAt - 450);
    final step = sweet.isEmpty ? span : span / sweet.length;
    for (final (k, it) in sweet.indexed) {
      _later((k * step).round(), () {
        tick();
        setState(() {
          final w = worst(it);
          _tick = (
            k,
            w.m,
            it.item.n,
            '${amountTxt(w.v, w.m)} ${t(metrics[w.m]!.of)}',
          );
          _count = (a.items.length * (k + 1) / sweet.length).round();
        });
      });
    }
    _later(max(_duration - startAt, span + 250), () {
      final nav = Navigator.of(context);
      var id = o.entryId;
      if (id == null) {
        final prev = store.findByReceipt(r.id);
        id = prev?.id ?? store.saveReceipt(r).id;
      }
      openResult(nav, id, replace: true);
      if (o.kind == 'duplicate') {
        showToast(t('Этот чек уже есть в журнале, второй раз не считаем'));
      }
      if (o.notice != null) showToast(t(o.notice!));
    });
  }

  Future<void> _more() async {
    final nav = Navigator.of(context);
    final f = await shootMore();
    if (f == null) return;
    outbox.stopWaiting(_jobId);
    await outbox.remove(_jobId);
    scanAgain(nav, [...widget.photos, f].take(3).toList());
  }

  void _later(int ms, VoidCallback fn) => _timers.add(
    Timer(Duration(milliseconds: max(0, ms)), () => mounted ? fn() : null),
  );

  @override
  void dispose() {
    outbox.stopWaiting(_jobId);
    _waiter?.cancel();
    for (final t in _timers) {
      t.cancel();
    }
    _beam.dispose();
    _bob.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final mq = MediaQuery.of(context);
    final short = mq.size.height < 700;
    final pw = min(
      min(mq.size.width.clamp(0, 430) * .62, 250.0),
      mq.size.height * .42 / 1.4,
    );

    final paper = AnimatedBuilder(
      animation: _bob,
      builder: (_, child) {
        final t = Curves.easeInOut.transform(_bob.value);
        return Transform.translate(
          offset: Offset(0, -6 * t),
          child: Transform.rotate(
            angle: (-2.5 + 1.5 * t) * pi / 180,
            child: child,
          ),
        );
      },
      child: ClipPath(
        clipper: _PaperEdge(),
        child: Container(
          color: _bytes != null ? tint : Colors.white,
          child: Stack(
            children: [
              if (_bytes != null)
                Positioned.fill(
                  child: Image.memory(
                    _bytes!,
                    fit: BoxFit.cover,
                    gaplessPlayback: true,
                  ),
                )
              else
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 18, 16, 30),
                  child: Column(
                    children: [
                      Text(
                        _found?.store ?? '',
                        style: disp(17, w: 800, ls: -.03, h: 1.2),
                      ),
                      Text(
                        _found == null ? '' : dateRu(_found!.date),
                        style: body(12, w: 700, color: mute),
                      ),
                      const SizedBox(height: 10),
                      const _Dashes(),
                      const SizedBox(height: 14),
                      Expanded(
                        child: ClipRect(
                          child: OverflowBox(
                            alignment: Alignment.topLeft,
                            maxHeight: double.infinity,
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                for (final (i, w) in _lines.indexed)
                                  Rise(
                                    delay: i * 70,
                                    ms: 300,
                                    child: FractionallySizedBox(
                                      widthFactor: w,
                                      child: Container(
                                        height: 6,
                                        margin: const EdgeInsets.only(
                                          bottom: 8,
                                        ),
                                        decoration: BoxDecoration(
                                          borderRadius: BorderRadius.circular(
                                            3,
                                          ),
                                          gradient: const LinearGradient(
                                            colors: [
                                              line,
                                              line,
                                              Colors.transparent,
                                              Colors.transparent,
                                              Color(0xFFC4C8DC),
                                              Color(0xFFC4C8DC),
                                            ],
                                            stops: [0, .68, .68, .78, .78, 1],
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
                      const _Dashes(),
                      const SizedBox(height: 12),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Container(
                            width: pw * .28,
                            height: 10,
                            decoration: BoxDecoration(
                              color: ink,
                              borderRadius: BorderRadius.circular(4),
                            ),
                          ),
                          Container(
                            width: pw * .2,
                            height: 10,
                            decoration: BoxDecoration(
                              color: ink,
                              borderRadius: BorderRadius.circular(4),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              // луч сканера
              Positioned.fill(
                child: AnimatedBuilder(
                  animation: _beam,
                  builder: (_, _) => CustomPaint(
                    painter: _BeamPainter(
                      Curves.easeInOut.transform(_beam.value),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );

    return Scaffold(
      body: DecoratedBox(
        decoration: const BoxDecoration(gradient: sky),
        child: Padding(
          padding: EdgeInsets.fromLTRB(
            20,
            mq.padding.top + 10,
            20,
            mq.padding.bottom + 28,
          ),
          child: Column(
            children: [
              SizedBox(
                height: 48,
                child: Stack(
                  alignment: Alignment.center,
                  children: [
                    Align(
                      alignment: Alignment.centerLeft,
                      child: Press(
                        scale: .92,
                        label: t('Отменить'),
                        onTap: () {
                          if (_found == null) outbox.remove(_jobId);
                          Navigator.of(context).pop();
                        },
                        child: Container(
                          width: 44,
                          height: 44,
                          decoration: BoxDecoration(
                            color: Colors.white.withValues(alpha: .16),
                            borderRadius: BorderRadius.circular(14),
                          ),
                          child: const Icon(
                            Icons.close_rounded,
                            color: Colors.white,
                            size: 22,
                          ),
                        ),
                      ),
                    ),
                    Text(
                      [
                        t('Сканирую'),
                        if (widget.photos.length > 1)
                          t('кадров: {n}', {'n': widget.photos.length}),
                      ].join(' · ').toUpperCase(),
                      style: body(
                        12,
                        w: 800,
                        color: Colors.white.withValues(alpha: .82),
                      ).copyWith(letterSpacing: 1),
                    ),
                  ],
                ),
              ),
              Expanded(
                child: Center(
                  child: TweenAnimationBuilder<double>(
                    tween: Tween(begin: 0, end: 1),
                    duration: const Duration(milliseconds: 520),
                    curve: Curves.easeOutBack,
                    builder: (_, v, child) => Opacity(
                      opacity: v.clamp(0, 1),
                      child: Transform.scale(scale: .9 + .1 * v, child: child),
                    ),
                    child: SizedBox(
                      width: pw,
                      height: pw * 1.4,
                      child: Stack(
                        clipBehavior: Clip.none,
                        children: [
                          Positioned.fill(
                            child: DecoratedBox(
                              decoration: BoxDecoration(
                                boxShadow: [
                                  BoxShadow(
                                    color: ink.withValues(alpha: .4),
                                    blurRadius: 30,
                                    offset: const Offset(0, 24),
                                    spreadRadius: -8,
                                  ),
                                ],
                              ),
                              child: paper,
                            ),
                          ),
                          for (final (al, t, r) in [
                            (Alignment.topLeft, true, false),
                            (Alignment.topRight, true, true),
                            (Alignment.bottomLeft, false, false),
                            (Alignment.bottomRight, false, true),
                          ])
                            Positioned(
                              top: t ? -16 : null,
                              bottom: t ? null : -16,
                              left: r ? null : -16,
                              right: r ? -16 : null,
                              child: CustomPaint(
                                size: const Size.square(34),
                                painter: _Corner(al),
                              ),
                            ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
              Text(
                t('Читаю чек…'),
                style: disp(30, color: Colors.white, h: .95, ls: -.045),
              ),
              SizedBox(
                height: 66,
                child: Center(
                  child: AnimatedSwitcher(
                    duration: const Duration(milliseconds: 240),
                    reverseDuration: const Duration(milliseconds: 60),
                    transitionBuilder: (child, a) => FadeTransition(
                      opacity: a,
                      child: SlideTransition(
                        position: Tween(
                          begin: const Offset(0, .5),
                          end: Offset.zero,
                        ).animate(a),
                        child: child,
                      ),
                    ),
                    child: _tick == null
                        ? Text(
                            t(_wait[_waitI]),
                            textAlign: TextAlign.center,
                            key: ValueKey('w$_waitI'),
                            style: body(
                              15,
                              w: 700,
                              color: Colors.white.withValues(alpha: .8),
                            ),
                          )
                        : Container(
                            key: ValueKey(_tick!.$1),
                            padding: const EdgeInsets.symmetric(
                              horizontal: 18,
                              vertical: 10,
                            ),
                            decoration: BoxDecoration(
                              color: Colors.white.withValues(alpha: .18),
                              borderRadius: BorderRadius.circular(23),
                              border: Border.all(
                                color: Colors.white.withValues(alpha: .25),
                              ),
                            ),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                MetricIcon(_tick!.$2, 24),
                                const SizedBox(width: 9),
                                Flexible(
                                  child: Text.rich(
                                    TextSpan(
                                      children: [
                                        TextSpan(text: '${_tick!.$3}: '),
                                        TextSpan(
                                          text: _tick!.$4.replaceAll(' ', ' '),
                                          style: disp(
                                            14,
                                            w: 800,
                                            color: Colors.white,
                                            ls: 0,
                                            h: 1.3,
                                          ),
                                        ),
                                      ],
                                    ),
                                    maxLines: 2,
                                    overflow: TextOverflow.ellipsis,
                                    style: body(
                                      15,
                                      w: 700,
                                      color: Colors.white,
                                      h: 1.3,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ),
                  ),
                ),
              ),
              SizedBox(height: short ? 6 : 12),
              TweenAnimationBuilder<double>(
                key: ValueKey(_count),
                tween: Tween(begin: _count == 0 ? 1 : 1.18, end: 1),
                duration: const Duration(milliseconds: 260),
                curve: Curves.easeOutBack,
                builder: (_, s, child) =>
                    Transform.scale(scale: s, child: child),
                child: Text(
                  '$_count',
                  style: disp(
                    short ? 54 : 68,
                    color: Colors.white,
                    h: .95,
                    ls: -.06,
                  ),
                ),
              ),
              const SizedBox(height: 6),
              Text(
                pl(_count, itemsF),
                style: body(
                  14,
                  w: 700,
                  color: Colors.white.withValues(alpha: .86),
                ),
              ),
              if (widget.receipt == null && _found == null)
                AnimatedOpacity(
                  opacity: _slow ? 1 : 0,
                  duration: const Duration(milliseconds: 300),
                  child: Padding(
                    padding: const EdgeInsets.only(top: 14),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        GlassButton(
                          t('Продолжить в фоне'),
                          height: 50,
                          onTap: () => Navigator.of(context).pop(),
                        ),
                        if (widget.photos.length < 3)
                          Press(
                            onTap: _more,
                            child: Padding(
                              padding: const EdgeInsets.only(top: 12),
                              child: Text(
                                t('Чек длинный? Добавь ещё кадр'),
                                textAlign: TextAlign.center,
                                style: body(14, w: 700, color: Colors.white)
                                    .copyWith(
                                      decoration: TextDecoration.underline,
                                      decorationColor: Colors.white54,
                                    ),
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Dashes extends StatelessWidget {
  const _Dashes();
  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (_, c) => Row(
      children: [
        for (var i = 0; i < (c.maxWidth / 10).floor(); i++)
          Container(
            width: 6,
            height: 2,
            margin: const EdgeInsets.only(right: 4),
            color: line,
          ),
      ],
    ),
  );
}

/// Зубчатый нижний край бумаги.
class _PaperEdge extends CustomClipper<Path> {
  @override
  Path getClip(Size s) {
    final p = Path()
      ..moveTo(0, 8)
      ..quadraticBezierTo(0, 0, 8, 0)
      ..lineTo(s.width - 8, 0)
      ..quadraticBezierTo(s.width, 0, s.width, 8)
      ..lineTo(s.width, s.height - 8);
    final n = (s.width / 16).round(), tw = s.width / n;
    for (var i = 0; i < n; i++) {
      p
        ..lineTo(s.width - tw * (i + .5), s.height)
        ..lineTo(s.width - tw * (i + 1), s.height - 8);
    }
    return p..close();
  }

  @override
  bool shouldReclip(_) => false;
}

class _BeamPainter extends CustomPainter {
  final double t;
  _BeamPainter(this.t);
  @override
  void paint(Canvas c, Size s) {
    final y = s.height * t;
    c.drawRect(
      Rect.fromLTRB(0, y - 70, s.width, y),
      Paint()
        ..shader = LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [blue3.withValues(alpha: 0), blue3.withValues(alpha: .45)],
        ).createShader(Rect.fromLTRB(0, y - 70, s.width, y)),
    );
    c.drawRect(
      Rect.fromLTRB(0, y - 6, s.width, y + 6),
      Paint()
        ..color = blue2.withValues(alpha: .55)
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 8),
    );
    c.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromLTRB(0, y - 2, s.width, y + 2),
        const Radius.circular(2),
      ),
      Paint()..color = blue2,
    );
  }

  @override
  bool shouldRepaint(_BeamPainter old) => old.t != t;
}

class _Corner extends CustomPainter {
  final Alignment al;
  _Corner(this.al);
  @override
  void paint(Canvas c, Size s) {
    final p = Paint()
      ..color = Colors.white
      ..style = PaintingStyle.stroke
      ..strokeWidth = 4
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;
    final x0 = al.x < 0 ? 2.0 : s.width - 2, x1 = al.x < 0 ? s.width : 0.0;
    final y0 = al.y < 0 ? 2.0 : s.height - 2, y1 = al.y < 0 ? s.height : 0.0;
    c.drawPath(
      Path()
        ..moveTo(x1, y0)
        ..lineTo(x0, y0)
        ..lineTo(x0, y1),
      p,
    );
  }

  @override
  bool shouldRepaint(_) => false;
}

// Экран сканирования (~2,6 с): «бумажный» чек или фото, бегущий луч сканера,
// сменяющиеся сладкие позиции и растущий счётчик кубиков.
import 'dart:async';
import 'dart:math';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../core/engine.dart';
import '../core/models.dart';
import '../core/scan.dart';
import '../core/store.dart';
import '../ui/kit.dart';
import 'shell.dart';

const _duration =
    2600; // мс — минимум; настоящее распознавание может идти дольше
const _wait = [
  'Ищу сладкое, солёное и жирное',
  'Разбираю сокращения кассы',
  'Сверяю со справочником',
  'Считаю сахар, соль и жиры',
];
const _lines = [.92, .64, .80, .48, .86, .70, .58, .90, .44, .76, .66, .84];

class ScanPage extends StatefulWidget {
  final XFile? photo;
  final Receipt? receipt;
  const ScanPage({super.key, this.photo, this.receipt});
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
  (int, String, String)? _tick;
  int _count = 0, _waitI = 0;

  @override
  void initState() {
    super.initState();
    _found = widget.receipt;
    widget.photo
        ?.readAsBytes()
        .then((b) => mounted ? setState(() => _bytes = b) : null)
        .catchError((_) => null);
    _waiter = Timer.periodic(
      const Duration(milliseconds: 1700),
      (_) => setState(() => _waitI = (_waitI + 1) % _wait.length),
    );
    _run();
  }

  Future<void> _run() async {
    final t0 = DateTime.now();
    int since() => DateTime.now().difference(t0).inMilliseconds;
    try {
      final (r, notice) = widget.receipt != null
          ? (widget.receipt!, null)
          : await recognize(widget.photo!);
      _waiter?.cancel();
      if (!mounted) return;
      setState(() => _found = r);
      final a = analyze(r);
      // позиции, где чего-то хотя бы кубик; для каждой показываем самый выраженный показатель
      const scanned = [MetricId.sugar, MetricId.salt, MetricId.fat];
      ({MetricId m, num v, int c}) worst(AnalyzedItem it) {
        final list = [
          for (final m in scanned)
            (
              m: m,
              v: it.active.valueOf(m),
              c: cubesOfValue(it.active.valueOf(m), m),
            ),
        ]..sort((x, y) => y.c.compareTo(x.c));
        return list.first;
      }

      final sweet = a.items.where((it) => worst(it).c >= 1).toList();
      final all = scanned.fold<int>(0, (sum, m) => sum + a.cubesBy[m]!);
      final startAt = max(150, since());
      // если ответ пришёл поздно, всё равно даём позициям время, чтобы их успели прочитать
      final span = max(
        min(1600, sweet.length * 320),
        _duration - startAt - 450,
      );
      final step = sweet.isEmpty ? span : span / sweet.length;
      for (final (k, it) in sweet.indexed) {
        _later(startAt - since() + (k * step).round(), () {
          tick();
          setState(() {
            final w = worst(it);
            _tick = (
              k,
              it.active.n,
              '${amountTxt(w.v, w.m)} ${metrics[w.m]!.of}',
            );
            _count = (all * (k + 1) / sweet.length).round();
          });
        });
      }
      _later(max(_duration, startAt + span.round() + 450) - since(), () {
        final nav = Navigator.of(context);
        final prev = store.findByReceipt(r.id);
        openResult(
          nav,
          r,
          prev?.id ?? store.newId(),
          prev?.swaps ?? const [],
          replace: true,
        );
        if (notice != null) showToast(notice);
      });
    } catch (e) {
      _waiter?.cancel();
      if (!mounted) return;
      showToast(
        e is ScanError
            ? e.message
            : 'Не получилось прочитать чек. Попробуй ещё раз',
      );
      Navigator.of(context).pop();
    }
  }

  void _later(int ms, VoidCallback fn) => _timers.add(
    Timer(Duration(milliseconds: max(0, ms)), () => mounted ? fn() : null),
  );

  @override
  void dispose() {
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
                  builder: (_, __) => CustomPaint(
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
                        label: 'Отменить сканирование',
                        onTap: () => Navigator.of(context).pop(),
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
                      'СКАНИРУЮ',
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
                'Читаю чек…',
                style: disp(30, color: Colors.white, h: .95, ls: -.045),
              ),
              SizedBox(
                height: 66,
                child: Center(
                  child: AnimatedSwitcher(
                    duration: const Duration(milliseconds: 260),
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
                            _wait[_waitI],
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
                                Container(
                                  width: 9,
                                  height: 9,
                                  decoration: BoxDecoration(
                                    color: Colors.white,
                                    borderRadius: BorderRadius.circular(3),
                                  ),
                                ),
                                const SizedBox(width: 9),
                                Flexible(
                                  child: Text.rich(
                                    TextSpan(
                                      children: [
                                        TextSpan(text: '${_tick!.$2} — '),
                                        TextSpan(
                                          text: _tick!.$3.replaceAll(' ', ' '),
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
                '${pl(_count, cubesF)} сахара, соли и жиров найдено',
                style: body(
                  14,
                  w: 700,
                  color: Colors.white.withValues(alpha: .86),
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

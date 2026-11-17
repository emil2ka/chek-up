// Стиль «Гора сахара»: цвета, шрифты и общие детали интерфейса.
import 'dart:async';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../core/models.dart';

// ── Токены (те же, что в web/src/app/globals.css) ──
const blue1 = Color(0xFF1238F5);
const blue2 = Color(0xFF3F6BFF);
const blue3 = Color(0xFF86A8FF);
const ink = Color(0xFF0D1440);
const mute = Color(0xFF6B76A8);
const line = Color(0xFFE3E8F8);
const tint = Color(0xFFEEF2FF);
const tintHi = Color(0xFFD7E1FF);
const good = Color(0xFF19B36B);
const mid = Color(0xFFF2A20C);
const bad = Color(0xFFF0433A);
const sky = LinearGradient(
  begin: Alignment.topCenter,
  end: Alignment.bottomCenter,
  colors: [blue1, blue2, blue3],
  stops: [0, .55, 1],
);
const rSheet = 30.0;

Color toneColor(Tone t) => switch (t) {
  Tone.good => good,
  Tone.mid => mid,
  Tone.bad => bad,
};

/// Unbounded — цифры и заголовки.
TextStyle disp(
  double size, {
  int w = 900,
  Color color = ink,
  double h = 1.0,
  double ls = -.04,
}) => TextStyle(
  fontFamily: 'Unbounded',
  fontSize: size,
  fontWeight: FontWeight.values[(w ~/ 100 - 1).clamp(0, 8)],
  fontVariations: [FontVariation('wght', w.toDouble())],
  color: color,
  height: h,
  letterSpacing: size * ls,
  fontFeatures: const [FontFeature.tabularFigures()],
);

/// Manrope — текст и подписи.
TextStyle body(
  double size, {
  int w = 600,
  Color color = ink,
  double h = 1.35,
}) => TextStyle(
  fontFamily: 'Manrope',
  fontSize: size,
  fontWeight: FontWeight.values[(w ~/ 100 - 1).clamp(0, 8)],
  fontVariations: [FontVariation('wght', w.toDouble())],
  color: color,
  height: h,
);

void tick() => HapticFeedback.selectionClick();
void thud() => HapticFeedback.lightImpact();

/// Нажимаемая область: чуть сжимается под пальцем.
class Press extends StatefulWidget {
  final Widget child;
  final VoidCallback? onTap;
  final double scale;
  final String? label;
  const Press({
    super.key,
    required this.child,
    this.onTap,
    this.scale = .965,
    this.label,
  });
  @override
  State<Press> createState() => _PressState();
}

class _PressState extends State<Press> {
  bool _down = false;
  @override
  Widget build(BuildContext context) {
    final on = widget.onTap != null;
    return Semantics(
      button: true,
      enabled: on,
      label: widget.label,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTapDown: on ? (_) => setState(() => _down = true) : null,
        onTapCancel: () => setState(() => _down = false),
        onTapUp: (_) => setState(() => _down = false),
        onTap: on
            ? () {
                tick();
                widget.onTap!();
              }
            : null,
        child: AnimatedScale(
          scale: _down ? widget.scale : 1,
          duration: const Duration(milliseconds: 110),
          child: AnimatedOpacity(
            opacity: on ? 1 : .45,
            duration: const Duration(milliseconds: 150),
            child: widget.child,
          ),
        ),
      ),
    );
  }
}

/// Появление снизу с задержкой.
class Rise extends StatefulWidget {
  final Widget child;
  final int delay;
  final int ms;
  const Rise({super.key, required this.child, this.delay = 0, this.ms = 640});
  @override
  State<Rise> createState() => _RiseState();
}

class _RiseState extends State<Rise> with SingleTickerProviderStateMixin {
  late final _c = AnimationController(
    vsync: this,
    duration: Duration(milliseconds: widget.ms),
  );
  Timer? _t;
  @override
  void initState() {
    super.initState();
    _t = Timer(Duration(milliseconds: widget.delay), () => _c.forward());
  }

  @override
  void dispose() {
    _t?.cancel();
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final a = CurvedAnimation(parent: _c, curve: const Cubic(.2, .9, .2, 1));
    return AnimatedBuilder(
      animation: a,
      builder: (_, child) => Opacity(
        opacity: a.value,
        child: Transform.translate(
          offset: Offset(0, 22 * (1 - a.value)),
          child: child,
        ),
      ),
      child: widget.child,
    );
  }
}

/// Белая наклонённая плашка в заголовке: «сахара».
class Hl extends StatelessWidget {
  final String text;
  final TextStyle style;
  const Hl(this.text, this.style, {super.key});
  @override
  Widget build(BuildContext context) {
    final s = style.fontSize ?? 40;
    return Transform.rotate(
      angle: -3.5 * pi / 180,
      child: Container(
        margin: EdgeInsets.symmetric(vertical: s * .05),
        padding: EdgeInsets.fromLTRB(s * .16, s * .04, s * .16, s * .1),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(s * .2),
          boxShadow: [
            BoxShadow(
              color: ink.withValues(alpha: .35),
              blurRadius: s * .4,
              offset: Offset(0, s * .18),
            ),
          ],
        ),
        child: Text(text, style: style.copyWith(color: blue1)),
      ),
    );
  }
}

/// Цветная точка оценки.
class ToneDot extends StatelessWidget {
  final Tone tone;
  const ToneDot(this.tone, {super.key});
  @override
  Widget build(BuildContext context) {
    final c = toneColor(tone);
    return Container(
      width: 10,
      height: 10,
      decoration: BoxDecoration(
        color: c,
        shape: BoxShape.circle,
        boxShadow: [
          BoxShadow(color: c.withValues(alpha: .22), spreadRadius: 3),
        ],
      ),
    );
  }
}

/// Белая главная кнопка.
class WhiteButton extends StatelessWidget {
  final String text;
  final IconData? icon;
  final IconData? trailing;
  final VoidCallback? onTap;
  final double height;
  final bool badge;
  const WhiteButton(
    this.text, {
    super.key,
    this.icon,
    this.trailing,
    this.onTap,
    this.height = 68,
    this.badge = false,
  });
  @override
  Widget build(BuildContext context) => Press(
    onTap: onTap,
    child: Container(
      height: height,
      padding: const EdgeInsets.symmetric(horizontal: 20),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(22),
        border: const Border(
          bottom: BorderSide(color: Color(0xFFD5E0FF), width: 4),
        ),
        boxShadow: [
          BoxShadow(
            color: ink.withValues(alpha: .5),
            blurRadius: 36,
            offset: const Offset(0, 18),
            spreadRadius: -10,
          ),
        ],
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          if (icon != null && badge)
            Container(
              width: 42,
              height: 42,
              margin: const EdgeInsets.only(right: 12),
              decoration: BoxDecoration(
                color: blue1,
                borderRadius: BorderRadius.circular(14),
              ),
              child: Icon(icon, color: Colors.white, size: 24),
            )
          else if (icon != null)
            Padding(
              padding: const EdgeInsets.only(right: 10),
              child: Icon(icon, color: blue1, size: 24),
            ),
          Flexible(
            child: Text(
              text,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: disp(
                height >= 64 ? 18 : 16,
                w: 700,
                color: blue1,
                ls: -.01,
              ),
            ),
          ),
          if (trailing != null)
            Padding(
              padding: const EdgeInsets.only(left: 10),
              child: Icon(trailing, color: blue1, size: 24),
            ),
        ],
      ),
    ),
  );
}

/// Полупрозрачная кнопка на синем фоне.
class GlassButton extends StatelessWidget {
  final String text;
  final IconData? icon;
  final VoidCallback? onTap;
  final double height;
  const GlassButton(
    this.text, {
    super.key,
    this.icon,
    this.onTap,
    this.height = 56,
  });
  @override
  Widget build(BuildContext context) => Press(
    onTap: onTap,
    child: Container(
      height: height,
      padding: const EdgeInsets.symmetric(horizontal: 18),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: .16),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(
          color: Colors.white.withValues(alpha: .45),
          width: 1.5,
        ),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null)
            Padding(
              padding: const EdgeInsets.only(right: 10),
              child: Icon(icon, color: Colors.white, size: 23),
            ),
          Flexible(
            child: Text(
              text,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: disp(15, w: 700, color: Colors.white, ls: -.01),
            ),
          ),
        ],
      ),
    ),
  );
}

/// Белая карточка-лист со скруглённым верхом.
class Sheet extends StatelessWidget {
  final Widget child;
  final EdgeInsets padding;
  const Sheet({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.fromLTRB(14, 24, 14, 24),
  });
  @override
  Widget build(BuildContext context) => Container(
    width: double.infinity,
    padding: padding,
    decoration: BoxDecoration(
      color: Colors.white,
      borderRadius: const BorderRadius.vertical(top: Radius.circular(rSheet)),
      boxShadow: [
        BoxShadow(
          color: const Color(0xFF08145A).withValues(alpha: .35),
          blurRadius: 40,
          offset: const Offset(0, -14),
        ),
      ],
    ),
    child: child,
  );
}

/// Заголовок раздела на белом листе.
class SecTitle extends StatelessWidget {
  final String text;
  final Widget? trailing;
  const SecTitle(this.text, {super.key, this.trailing});
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(4, 0, 4, 12),
    child: Row(
      children: [
        Expanded(child: Text(text, style: disp(19, w: 800, h: 1.15, ls: -.02))),
        if (trailing != null) trailing!,
      ],
    ),
  );
}

/// Плашка-счётчик: «3 из 9».
class CountPill extends StatelessWidget {
  final String text;
  const CountPill(this.text, {super.key});
  @override
  Widget build(BuildContext context) => Container(
    height: 32,
    padding: const EdgeInsets.symmetric(horizontal: 12),
    alignment: Alignment.center,
    decoration: BoxDecoration(
      color: tint,
      borderRadius: BorderRadius.circular(16),
    ),
    child: Text(text, style: disp(13, w: 800, color: blue1, ls: 0)),
  );
}

/// Кубик сахара значком (изометрия).
class CubeIcon extends StatelessWidget {
  final double size;
  final double angle;
  const CubeIcon(this.size, {super.key, this.angle = 0});
  @override
  Widget build(BuildContext context) => Transform.rotate(
    angle: angle * pi / 180,
    child: CustomPaint(size: Size.square(size), painter: _CubePainter()),
  );
}

class _CubePainter extends CustomPainter {
  @override
  void paint(Canvas c, Size s) {
    final w = s.width, cx = w / 2;
    final top = Path()
      ..moveTo(cx, w * .08)
      ..lineTo(w * .9, w * .29)
      ..lineTo(cx, w * .5)
      ..lineTo(w * .1, w * .29)
      ..close();
    final left = Path()
      ..moveTo(w * .1, w * .29)
      ..lineTo(cx, w * .5)
      ..lineTo(cx, w * .94)
      ..lineTo(w * .1, w * .72)
      ..close();
    final right = Path()
      ..moveTo(w * .9, w * .29)
      ..lineTo(cx, w * .5)
      ..lineTo(cx, w * .94)
      ..lineTo(w * .9, w * .72)
      ..close();
    final all = Path.combine(
      PathOperation.union,
      Path.combine(PathOperation.union, top, left),
      right,
    );
    c.drawShadow(all, ink, w * .08, true);
    c.drawPath(left, Paint()..color = const Color(0xFFDDE5FF));
    c.drawPath(right, Paint()..color = const Color(0xFFB9C8F7));
    c.drawPath(top, Paint()..color = Colors.white);
    final edge = Paint()
      ..color = Colors.white
      ..style = PaintingStyle.stroke
      ..strokeWidth = w * .05
      ..strokeJoin = StrokeJoin.round;
    c.drawPath(all, edge);
  }

  @override
  bool shouldRepaint(_) => false;
}

/// Счётчик «− 2 +».
class StepperRow extends StatelessWidget {
  final String label, hint;
  final int value, min, max;
  final bool glass;
  final ValueChanged<int> onChange;
  const StepperRow({
    super.key,
    required this.label,
    required this.hint,
    required this.value,
    required this.min,
    required this.max,
    required this.onChange,
    this.glass = false,
  });

  Widget _btn(IconData icon, bool on, int next) => Press(
    scale: .9,
    label: icon == Icons.add_rounded ? '$label: больше' : '$label: меньше',
    onTap: on ? () => onChange(next) : null,
    child: Container(
      width: 46,
      height: 46,
      decoration: BoxDecoration(
        color: glass ? Colors.white.withValues(alpha: .2) : Colors.white,
        borderRadius: BorderRadius.circular(15),
        border: Border.all(
          color: glass ? Colors.white.withValues(alpha: .4) : line,
          width: 1.5,
        ),
      ),
      child: Icon(icon, color: glass ? Colors.white : blue1, size: 24),
    ),
  );

  @override
  Widget build(BuildContext context) {
    final fg = glass ? Colors.white : ink;
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 10, 10, 10),
      decoration: BoxDecoration(
        color: glass ? Colors.white.withValues(alpha: .14) : tint,
        borderRadius: BorderRadius.circular(22),
        border: glass
            ? Border.all(color: Colors.white.withValues(alpha: .28))
            : null,
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: disp(16, w: 700, color: fg, ls: -.02, h: 1.2),
                ),
                Text(
                  hint,
                  style: body(
                    13,
                    color: glass ? Colors.white.withValues(alpha: .8) : mute,
                  ),
                ),
              ],
            ),
          ),
          _btn(Icons.remove_rounded, value > min, value - 1),
          SizedBox(
            width: 46,
            child: Text(
              '$value',
              textAlign: TextAlign.center,
              style: disp(24, color: fg),
            ),
          ),
          _btn(Icons.add_rounded, value < max, value + 1),
        ],
      ),
    );
  }
}

/// Мягкое светлое пятно в углу синего экрана.
class Glow extends StatelessWidget {
  const Glow({super.key});
  @override
  Widget build(BuildContext context) => Positioned(
    top: -120,
    right: -140,
    child: IgnorePointer(
      child: Container(
        width: 420,
        height: 420,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          gradient: RadialGradient(
            colors: [blue3.withValues(alpha: .55), blue3.withValues(alpha: 0)],
          ),
        ),
      ),
    ),
  );
}

// ── Уведомления: очередь, чтобы одно не затирало другое ──
final toasts = ValueNotifier<List<(int, String)>>(const []);
int _toastSeq = 0;

void showToast(String text) => toasts.value = [
  ...toasts.value.skip(max(0, toasts.value.length - 2)),
  (++_toastSeq, text),
];

class ToastHost extends StatefulWidget {
  final Widget child;
  const ToastHost({super.key, required this.child});
  @override
  State<ToastHost> createState() => _ToastHostState();
}

class _ToastHostState extends State<ToastHost> {
  Timer? _t;
  int _shown = 0;

  void _close() {
    _t?.cancel();
    if (toasts.value.isNotEmpty) toasts.value = toasts.value.sublist(1);
  }

  @override
  void dispose() {
    _t?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Stack(
    children: [
      widget.child,
      ValueListenableBuilder(
        valueListenable: toasts,
        builder: (context, q, _) {
          final cur = q.isEmpty ? null : q.first;
          if (cur != null && cur.$1 != _shown) {
            _shown = cur.$1;
            _t?.cancel();
            _t = Timer(const Duration(milliseconds: 4200), _close);
          }
          return Positioned(
            left: 16,
            right: 16,
            bottom: MediaQuery.paddingOf(context).bottom + 100,
            child: AnimatedSwitcher(
              duration: const Duration(milliseconds: 280),
              switchInCurve: Curves.easeOutBack,
              transitionBuilder: (child, a) => FadeTransition(
                opacity: a,
                child: SlideTransition(
                  position: Tween(
                    begin: const Offset(0, .8),
                    end: Offset.zero,
                  ).animate(a),
                  child: child,
                ),
              ),
              child: cur == null
                  ? const SizedBox.shrink()
                  : Material(
                      key: ValueKey(cur.$1),
                      color: Colors.transparent,
                      child: Semantics(
                        liveRegion: true,
                        child: Container(
                          padding: const EdgeInsets.fromLTRB(14, 12, 6, 12),
                          decoration: BoxDecoration(
                            color: ink,
                            borderRadius: BorderRadius.circular(20),
                            border: Border.all(
                              color: Colors.white.withValues(alpha: .1),
                            ),
                            boxShadow: [
                              BoxShadow(
                                color: ink.withValues(alpha: .6),
                                blurRadius: 40,
                                offset: const Offset(0, 18),
                                spreadRadius: -12,
                              ),
                            ],
                          ),
                          child: Row(
                            children: [
                              Container(
                                width: 28,
                                height: 28,
                                decoration: BoxDecoration(
                                  color: mid,
                                  borderRadius: BorderRadius.circular(9),
                                ),
                                child: const Icon(
                                  Icons.priority_high_rounded,
                                  size: 18,
                                  color: ink,
                                ),
                              ),
                              const SizedBox(width: 12),
                              Expanded(
                                child: Text(
                                  cur.$2,
                                  style: body(14, color: Colors.white),
                                ),
                              ),
                              IconButton(
                                onPressed: _close,
                                tooltip: 'Закрыть уведомление',
                                icon: Icon(
                                  Icons.close_rounded,
                                  size: 20,
                                  color: Colors.white.withValues(alpha: .7),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
            ),
          );
        },
      ),
    ],
  );
}

// Значок показателя: та же фигурка, что лежит в горе. Здесь же «всё, что внутри» — ряд и плитки из шести.
import 'package:flutter/material.dart';

import '../core/engine.dart';
import '../core/i18n.dart';
import '../core/models.dart';
import 'food_piece.dart';
import 'kit.dart';

/// Нарисовать значок с центром в нуле.
void drawMetric(Canvas c, MetricId m, double size) {
  final shape = shapeOf[m];
  if (shape != null) {
    drawFoodPiece(c, shape, size);
    return;
  }
  final h = size * .39;
  c.save();
  c.rotate(-.14);
  final rr = RRect.fromRectAndRadius(
    Rect.fromLTRB(-h, -h, h, h),
    Radius.circular(size * .15),
  );
  c.drawRRect(
    rr,
    Paint()
      ..shader = const LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: [Colors.white, Color(0xFFF3F6FF), Color(0xFFB9C8F7)],
      ).createShader(rr.outerRect),
  );
  final dot = Paint()..color = const Color(0x8C6E87DC);
  for (final (x, y) in const [
    (-.14, -.13),
    (.13, -.02),
    (-.07, .15),
    (.17, .2),
  ]) {
    c.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromCenter(
          center: Offset(x * size, y * size),
          width: size * .09,
          height: size * .09,
        ),
        Radius.circular(size * .02),
      ),
      dot,
    );
  }
  c.drawRRect(
    rr,
    Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = size * .035
      ..color = const Color(0x472846BE),
  );
  c.restore();
}

class MetricIcon extends StatelessWidget {
  final MetricId m;
  final double size;
  const MetricIcon(this.m, this.size, {super.key});
  @override
  Widget build(BuildContext context) => ExcludeSemantics(
    child: CustomPaint(size: Size.square(size), painter: _IconPainter(m)),
  );
}

class _IconPainter extends CustomPainter {
  final MetricId m;
  const _IconPainter(this.m);
  @override
  void paint(Canvas c, Size s) {
    c.translate(s.width / 2, s.height / 2);
    drawMetric(c, m, s.width * .94);
  }

  @override
  bool shouldRepaint(_IconPainter oldDelegate) => oldDelegate.m != m;
}

/// «14 264»
String shortNum(num v, MetricId m) =>
    bigNum(v, m).replaceAllMapped(RegExp(r'\B(?=(\d{3})+$)'), (_) => '\u2009');

String _unit(MetricId m) => isCubeMetric(m)
    ? t('куб.')
    : m == MetricId.kcal
    ? ''
    : t(metrics[m]!.unit);

String shortLabel(MetricId m) => switch (m) {
  MetricId.kcal => t('Ккал'),
  MetricId.carbs => t('Углев.'),
  _ => t(metrics[m]!.label),
};

/// Ряд «что покажем»: значок и название, а с totals — значок и число. Для синего фона.
class SixRow extends StatelessWidget {
  final Map<MetricId, double>? totals;
  const SixRow({super.key, this.totals});
  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.fromLTRB(8, 12, 8, 10),
    decoration: BoxDecoration(
      color: ink.withValues(alpha: .18),
      borderRadius: BorderRadius.circular(22),
      border: Border.all(color: Colors.white.withValues(alpha: .18)),
    ),
    child: Row(
      children: [
        for (final m in metricIds)
          Expanded(
            child: Semantics(
              label: totals == null
                  ? t(metrics[m]!.label)
                  : '${t(metrics[m]!.label)}: ${shortNum(totals![m]!, m)}',
              excludeSemantics: true,
              child: Column(
                children: [
                  MetricIcon(m, 34),
                  const SizedBox(height: 4),
                  FittedBox(
                    fit: BoxFit.scaleDown,
                    child: Text(
                      totals == null ? shortLabel(m) : shortNum(totals![m]!, m),
                      style: body(
                        totals == null ? 11.5 : 13,
                        w: totals == null ? 700 : 800,
                        color: Colors.white,
                        h: 1.1,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
      ],
    ),
  );
}

/// Плитки со значениями; с onChange нажатие выбирает показатель.
class SixGrid extends StatelessWidget {
  final Map<MetricId, double> totals;
  final Set<MetricId>? available;
  final MetricId? value;
  final ValueChanged<MetricId>? onChange;

  /// доля нормы, 0..∞
  final Map<MetricId, double>? ratio;
  const SixGrid({
    super.key,
    required this.totals,
    this.available,
    this.value,
    this.onChange,
    this.ratio,
  });

  Widget _tile(MetricId m) {
    final known = available?.contains(m) ?? true, on = value == m;
    final r = ratio?[m];
    final child = AnimatedContainer(
      duration: const Duration(milliseconds: 160),
      constraints: const BoxConstraints(minHeight: 66),
      padding: const EdgeInsets.fromLTRB(7, 8, 5, 8),
      decoration: BoxDecoration(
        color: on ? tintHi : tint,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: on ? blue1 : tint, width: 2),
      ),
      child: Row(
        children: [
          MetricIcon(m, 30),
          const SizedBox(width: 5),
          Expanded(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  t(metrics[m]!.label),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: body(12.5, w: 700, color: mute, h: 1.15),
                ),
                const SizedBox(height: 2),
                FittedBox(
                  fit: BoxFit.scaleDown,
                  alignment: Alignment.centerLeft,
                  child: Text.rich(
                    TextSpan(
                      children: [
                        TextSpan(
                          text: known ? shortNum(totals[m]!, m) : '—',
                          style: disp(16, ls: -.04, h: 1.1),
                        ),
                        if (known && _unit(m).isNotEmpty)
                          TextSpan(
                            text: ' ${_unit(m)}',
                            style: body(11.5, w: 700, color: mute),
                          ),
                      ],
                    ),
                  ),
                ),
                if (r != null && known)
                  Text(
                    '${(r * 100).round()}%',
                    semanticsLabel: '${(r * 100).round()}% ${t('от нормы')}',
                    style: body(
                      11.5,
                      w: 700,
                      color: isHarmfulMetric(m) && r > 1 ? bad : mute,
                      h: 1.2,
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
    return onChange == null
        ? child
        : Semantics(
            selected: on,
            child: Press(scale: .97, onTap: () => onChange!(m), child: child),
          );
  }

  @override
  Widget build(BuildContext context) => Column(
    children: [
      for (final (k, row) in [metricIds.take(3), metricIds.skip(3)].indexed)
        Padding(
          padding: EdgeInsets.only(top: k == 0 ? 0 : 8),
          child: IntrinsicHeight(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                for (final (i, m) in row.indexed) ...[
                  if (i > 0) const SizedBox(width: 8),
                  Expanded(child: _tile(m)),
                ],
              ],
            ),
          ),
        ),
    ],
  );
}

/// Четыре главных числа строкой — в списках чеков.
class MetricLine extends StatelessWidget {
  final Map<MetricId, double> totals;
  const MetricLine(this.totals, {super.key});
  @override
  Widget build(BuildContext context) => Wrap(
    spacing: 9,
    runSpacing: 2,
    children: [
      for (final m in const [
        MetricId.sugar,
        MetricId.salt,
        MetricId.fat,
        MetricId.kcal,
      ])
        Semantics(
          label: metricTxt(totals[m]!, m),
          excludeSemantics: true,
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              MetricIcon(m, 17),
              const SizedBox(width: 3),
              Text(shortNum(totals[m]!, m), style: body(13, w: 700)),
            ],
          ),
        ),
    ],
  );
}

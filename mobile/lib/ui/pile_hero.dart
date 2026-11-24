// Верх экранов «Результат» и «Неделя»: большая цифра и гора кубиков под ней.
import 'package:flutter/material.dart';

import '../core/engine.dart';
import '../core/models.dart';
import 'kit.dart';
import 'pile.dart';

const heroHeadH =
    320.0; // место под шапку, вкладки показателей, подпись и цифру

class PileHero extends StatefulWidget {
  final double height;
  final Widget bar;
  final String kick;

  /// сколько кубиков лежит на экране
  final int target;

  /// под это количество подбирается размер кубика
  final int maxCubes;

  final String capSuffix;
  final num? value;

  /// выбранный показатель: от него цвет кубиков и подпись под цифрой
  final MetricId metric;

  /// переключатель показателей под шапкой (null — без него)
  final ValueChanged<MetricId>? onMetric;
  const PileHero({
    super.key,
    required this.height,
    required this.bar,
    required this.kick,
    required this.target,
    required this.maxCubes,
    required this.value,
    this.capSuffix = '',
    this.metric = MetricId.sugar,
    this.onMetric,
  });

  @override
  State<PileHero> createState() => _PileHeroState();
}

class _PileHeroState extends State<PileHero> {
  final _n = ValueNotifier((MetricId.sugar, 0));

  @override
  void dispose() {
    _n.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final top = MediaQuery.paddingOf(context).top;
    final amount = widget.value;
    final metric = widget.metric;
    return SizedBox(
      height: widget.height,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          const Glow(),
          if (amount != null)
            Positioned.fill(
              child: Semantics(
                label: pileHints[metric],
                child: SugarPile(
                  key: ValueKey(metric),
                  palettes: [pilePalettes[metric]!],
                  target: widget.target,
                  cubeSize: (size) => metricPileSize(
                    metric,
                    size.width,
                    size.height - top - heroHeadH,
                    widget.maxCubes,
                  ),
                  onCount: (count) => _n.value = (metric, count),
                ),
              ),
            ),
          Positioned(
            left: 10,
            right: 10,
            top: top + 62 + (widget.onMetric != null ? 94 : 0),
            child: IgnorePointer(
              child: ValueListenableBuilder(
                valueListenable: _n,
                builder: (_, n, _) {
                  final (countedMetric, count) = n;
                  final value =
                      amount != null &&
                          isCubeMetric(widget.metric) &&
                          widget.target == cubesOfValue(amount, widget.metric)
                      ? (countedMetric == metric ? count : 0) *
                            metrics[metric]!.cubeG
                      : amount;
                  final number = value == null
                      ? '—'
                      : bigNum(value, widget.metric);
                  final hint = pileHints[widget.metric];
                  return Column(
                    children: [
                      Text(
                        widget.kick,
                        style: body(
                          15,
                          w: 700,
                          color: Colors.white.withValues(alpha: .85),
                        ),
                      ),
                      const SizedBox(height: 2),
                      TweenAnimationBuilder<double>(
                        key: ValueKey(number),
                        tween: Tween(begin: 1.045, end: 1),
                        duration: const Duration(milliseconds: 160),
                        builder: (_, s, child) =>
                            Transform.scale(scale: s, child: child),
                        child: FittedBox(
                          fit: BoxFit.scaleDown,
                          child: Text(
                            number,
                            style:
                                disp(
                                  number.length >= 4 ? 74 : 100,
                                  color: Colors.white,
                                  h: 1,
                                  ls: -.07,
                                ).copyWith(
                                  shadows: [
                                    Shadow(
                                      color: blue1.withValues(alpha: .5),
                                      blurRadius: 24,
                                    ),
                                  ],
                                ),
                          ),
                        ),
                      ),
                      Text(
                        value == null
                            ? 'нет данных в этом чеке'
                            : '${bigCap(value, widget.metric)}${widget.capSuffix}',
                        style: disp(
                          17,
                          w: 500,
                          color: Colors.white,
                          ls: -.01,
                          h: 1.2,
                        ),
                      ),
                      if (hint != null && amount != null && amount > 0)
                        ExcludeSemantics(
                          child: Padding(
                            padding: const EdgeInsets.only(top: 5),
                            child: Text(
                              hint,
                              style: body(
                                11,
                                w: 800,
                                color: Colors.white.withValues(alpha: .82),
                              ),
                            ),
                          ),
                        ),
                    ],
                  );
                },
              ),
            ),
          ),
          Positioned(
            left: 14,
            right: 14,
            top: top + 8,
            child: SizedBox(height: 48, child: widget.bar),
          ),
          if (widget.onMetric != null)
            Positioned(
              left: 14,
              right: 14,
              top: top + 62,
              child: MetricTabs(
                value: widget.metric,
                onChange: widget.onMetric!,
              ),
            ),
        ],
      ),
    );
  }
}

/// Плашка с оценкой в шапке.
class TonePill extends StatelessWidget {
  final Tone tone;
  final String text;
  const TonePill(this.tone, this.text, {super.key});
  @override
  Widget build(BuildContext context) => Container(
    height: 38,
    padding: const EdgeInsets.symmetric(horizontal: 14),
    decoration: BoxDecoration(
      color: Colors.white,
      borderRadius: BorderRadius.circular(19),
      boxShadow: [
        BoxShadow(
          color: ink.withValues(alpha: .3),
          blurRadius: 18,
          offset: const Offset(0, 8),
          spreadRadius: -6,
        ),
      ],
    ),
    child: Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        ToneDot(tone),
        const SizedBox(width: 9),
        Flexible(
          child: Text(
            text,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: body(14, w: 800),
          ),
        ),
      ],
    ),
  );
}

/// Квадратная стеклянная кнопка в шапке.
class BarButton extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  const BarButton(this.icon, this.label, this.onTap, {super.key});
  @override
  Widget build(BuildContext context) => Press(
    scale: .9,
    label: label,
    onTap: onTap,
    child: Container(
      width: 46,
      height: 46,
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: .18),
        borderRadius: BorderRadius.circular(15),
        border: Border.all(
          color: Colors.white.withValues(alpha: .3),
          width: 1.5,
        ),
      ),
      child: Icon(icon, color: Colors.white, size: 23),
    ),
  );
}

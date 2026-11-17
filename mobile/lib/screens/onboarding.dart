// Знакомство при первом запуске: три шага и состав семьи. Можно пропустить.
import 'package:flutter/material.dart';

import '../core/engine.dart';
import '../core/models.dart';
import '../core/store.dart';
import '../ui/kit.dart';

class Onboarding extends StatefulWidget {
  final VoidCallback onDone;
  const Onboarding({super.key, required this.onDone});
  @override
  State<Onboarding> createState() => _OnboardingState();
}

class _OnboardingState extends State<Onboarding> {
  static const _steps = 3;
  int _step = 0;

  @override
  Widget build(BuildContext context) {
    final mq = MediaQuery.of(context);
    final p = store.profile;
    final last = _step == _steps - 1;
    const norm =
        10; // норма взрослого у каждого показателя — около 10 кубиков в день
    final cola = (106 / cubeG).round(),
        sausage = (8.8 / metrics[MetricId.salt]!.cubeG).round();
    final h1 = disp(
      (mq.size.width.clamp(0, 430) * .104).clamp(32.0, 44.0),
      color: Colors.white,
      h: 1.02,
      ls: -.045,
    );
    final sub = body(17, color: Colors.white.withValues(alpha: .9), h: 1.42);

    final page = switch (_step) {
      0 => Column(
        mainAxisAlignment: MainAxisAlignment.center,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Center(
            child: SizedBox(
              width: 224,
              height: 176,
              child: Stack(
                children: [
                  Positioned(
                    top: 8,
                    left: 12,
                    child: CubeIcon(144, angle: -12),
                  ),
                  Positioned(
                    right: 0,
                    bottom: 0,
                    child: CubeIcon(88, angle: 14),
                  ),
                  Positioned(top: 0, right: 24, child: CubeIcon(48, angle: 28)),
                ],
              ),
            ),
          ),
          const SizedBox(height: 36),
          Wrap(
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              Text('Чек знает, что ты ', style: h1),
              Hl('ешь', h1),
            ],
          ),
          const SizedBox(height: 16),
          Text(
            'Сфоткай чек из магазина — покажем, сколько в корзине сахара, соли, насыщенных жиров и калорий и сколько на это ушло денег. И подскажем, что заменить.',
            style: sub,
          ),
        ],
      ),
      1 => Column(
        mainAxisAlignment: MainAxisAlignment.center,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Center(
            child: SizedBox(
              width: 5 * 52 + 4 * 10,
              child: Wrap(
                spacing: 10,
                runSpacing: 10,
                children: [
                  for (var i = 0; i < norm; i++)
                    Rise(
                      delay: i * 45,
                      child: CubeIcon(52, angle: i.isOdd ? 6 : -6),
                    ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 36),
          Wrap(
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              Text('Всё считаем ', style: h1),
              Hl('кубиками', h1),
            ],
          ),
          const SizedBox(height: 16),
          Text(
            'Кубик у каждого показателя свой: 5 г сахара, 0,5 г соли, 2 г жиров или 200 ккал. Норма взрослого — около $norm ${pl(norm, cubesF)} каждого в день. В литре колы $cola кубиков сахара, в докторской колбасе на 400 г — $sausage кубиков соли.',
            style: sub,
          ),
        ],
      ),
      _ => Column(
        mainAxisAlignment: MainAxisAlignment.center,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Wrap(
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              Text('Кто ест из этой ', style: h1),
              Hl('корзины', h1),
              Text('?', style: h1),
            ],
          ),
          const SizedBox(height: 16),
          Text(
            'От этого зависит норма сахара на неделю. Изменить можно в профиле.',
            style: sub,
          ),
          const SizedBox(height: 24),
          StepperRow(
            glass: true,
            label: 'Взрослые',
            hint:
                'до ${metrics[MetricId.sugar]!.adult.round()} г сахара и ${metrics[MetricId.salt]!.adult.round()} г соли в день',
            value: p.adults,
            min: 1,
            max: maxAdults,
            onChange: (v) => store.updateProfile(p.copyWith(adults: v)),
          ),
          const SizedBox(height: 10),
          StepperRow(
            glass: true,
            label: 'Дети',
            hint:
                'до ${metrics[MetricId.sugar]!.kid.round()} г сахара и ${metrics[MetricId.salt]!.kid.round()} г соли в день',
            value: p.kids,
            min: 0,
            max: maxKids,
            onChange: (v) => store.updateProfile(p.copyWith(kids: v)),
          ),
          const SizedBox(height: 20),
          Text.rich(
            TextSpan(
              children: [
                const TextSpan(text: 'Норма семьи — '),
                TextSpan(
                  text: '${familyDailyCubes(p)}',
                  style: disp(20, color: Colors.white, h: 1.3),
                ),
                TextSpan(
                  text: ' ${pl(familyDailyCubes(p), cubesF)} сахара в день',
                ),
              ],
            ),
            style: body(16, color: Colors.white.withValues(alpha: .92)),
          ),
        ],
      ),
    };

    return Material(
      type: MaterialType.transparency,
      child: DecoratedBox(
        decoration: const BoxDecoration(gradient: sky),
        child: Stack(
          children: [
            const Glow(),
            Padding(
              padding: EdgeInsets.fromLTRB(
                20,
                mq.padding.top + 12,
                20,
                mq.padding.bottom + 20,
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  SizedBox(
                    height: 44,
                    child: Row(
                      children: [
                        for (var i = 0; i < _steps; i++)
                          AnimatedContainer(
                            duration: const Duration(milliseconds: 300),
                            width: i == _step ? 32 : 6,
                            height: 6,
                            margin: const EdgeInsets.only(right: 6),
                            decoration: BoxDecoration(
                              color: Colors.white.withValues(
                                alpha: i == _step ? 1 : .4,
                              ),
                              borderRadius: BorderRadius.circular(3),
                            ),
                          ),
                        const Spacer(),
                        if (!last)
                          Press(
                            onTap: widget.onDone,
                            child: Padding(
                              padding: const EdgeInsets.all(8),
                              child: Text(
                                'Пропустить',
                                style: body(
                                  15,
                                  w: 700,
                                  color: Colors.white.withValues(alpha: .85),
                                ),
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
                  Expanded(
                    child: AnimatedSwitcher(
                      duration: const Duration(milliseconds: 320),
                      switchInCurve: const Cubic(.2, .8, .2, 1),
                      transitionBuilder: (child, a) => FadeTransition(
                        opacity: a,
                        child: SlideTransition(
                          position: Tween(
                            begin: const Offset(.12, 0),
                            end: Offset.zero,
                          ).animate(a),
                          child: child,
                        ),
                      ),
                      child: KeyedSubtree(
                        key: ValueKey(_step),
                        child: Center(
                          child: SingleChildScrollView(child: page),
                        ),
                      ),
                    ),
                  ),
                  WhiteButton(
                    last ? 'Начать' : 'Дальше',
                    trailing: Icons.arrow_forward_rounded,
                    height: 64,
                    onTap: () =>
                        last ? widget.onDone() : setState(() => _step++),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

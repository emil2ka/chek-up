// Знакомство при первом запуске: три шага и состав семьи. Можно пропустить.
import 'package:flutter/material.dart';

import '../core/engine.dart';
import '../core/i18n.dart';
import '../core/models.dart';
import '../core/store.dart';
import '../ui/kit.dart';
import '../ui/metric_icon.dart';

/// Слова заголовка по одному: плашка переносится вместе с ними.
List<Widget> _words(String text, TextStyle st) => [
  for (final w in text.split(' ')) Text('$w ', style: st),
];

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
          Center(
            child: SizedBox(
              width: 290,
              child: Wrap(
                alignment: WrapAlignment.spaceBetween,
                runSpacing: 14,
                children: [
                  for (final (i, m) in metricIds.indexed)
                    Rise(
                      delay: i * 60,
                      child: Transform.rotate(
                        angle: i.isOdd ? .14 : -.14,
                        child: MetricIcon(m, 82),
                      ),
                    ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 34),
          Wrap(
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              ..._words(t('Узнай'), h1),
              Hl(t('всё,'), h1),
              Text(' ', style: h1),
              ..._words(t('что ты покупаешь'), h1),
            ],
          ),
          const SizedBox(height: 16),
          Text(
            t(
              'До кассы сфоткай корзину: подскажем, что убрать. После покупки сфоткай чек: покажем, что вышло.',
            ),
            style: sub,
          ),
        ],
      ),
      1 => Column(
        mainAxisAlignment: MainAxisAlignment.center,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Wrap(
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [..._words(t('Видно'), h1), Hl(t('глазами'), h1)],
          ),
          const SizedBox(height: 20),
          for (final (i, m) in metricIds.indexed)
            Rise(
              delay: i * 50,
              child: Container(
                margin: const EdgeInsets.only(bottom: 8),
                padding: const EdgeInsets.fromLTRB(12, 8, 14, 8),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: .13),
                  borderRadius: BorderRadius.circular(18),
                ),
                child: Row(
                  children: [
                    MetricIcon(m, 36),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            t(metrics[m]!.label),
                            style: disp(
                              15,
                              w: 700,
                              color: Colors.white,
                              h: 1.2,
                              ls: -.02,
                            ),
                          ),
                          Text(
                            unitNote(m),
                            style: body(
                              13,
                              color: Colors.white.withValues(alpha: .88),
                              h: 1.2,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
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
              ..._words(t('Кто ест из этой'), h1),
              Hl(t('корзины'), h1),
              Text('?', style: h1),
            ],
          ),
          const SizedBox(height: 16),
          Text(
            t('От этого зависит норма на неделю. Изменить можно в профиле.'),
            style: sub,
          ),
          const SizedBox(height: 24),
          StepperRow(
            glass: true,
            label: t('Взрослые'),
            hint: t('до {a} г сахара и {b} г соли в день', {
              'a': metrics[MetricId.sugar]!.adult.round(),
              'b': metrics[MetricId.salt]!.adult.round(),
            }),
            value: p.adults,
            min: 1,
            max: maxAdults,
            onChange: (v) => store.updateFamily(adults: v),
          ),
          const SizedBox(height: 10),
          StepperRow(
            glass: true,
            label: t('Дети'),
            hint: t('до {a} г сахара и {b} г соли в день', {
              'a': metrics[MetricId.sugar]!.kid.round(),
              'b': metrics[MetricId.salt]!.kid.round(),
            }),
            value: p.kids,
            min: 0,
            max: maxKids,
            onChange: (v) => store.updateFamily(kids: v),
          ),
          const SizedBox(height: 20),
          Text.rich(
            TextSpan(
              children: [
                TextSpan(text: '${t('Норма семьи')}: '),
                TextSpan(
                  text: '${familyDailyCubes(p)}',
                  style: disp(20, color: Colors.white, h: 1.3),
                ),
                TextSpan(
                  text:
                      ' ${pl(familyDailyCubes(p), sugarCubesF)} ${t('в день')}',
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
                        Press(
                          onTap: () => store.updateMe(
                            lang: p.lang == 'kk' ? 'ru' : 'kk',
                          ),
                          child: Padding(
                            padding: const EdgeInsets.all(8),
                            child: Text(
                              p.lang == 'kk' ? 'Русский' : 'Қазақша',
                              style: body(15, w: 800, color: Colors.white),
                            ),
                          ),
                        ),
                        if (!last)
                          Press(
                            onTap: widget.onDone,
                            child: Padding(
                              padding: const EdgeInsets.all(8),
                              child: Text(
                                t('Пропустить'),
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
                    last ? t('Начать') : t('Дальше'),
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

// «Неделя»: гора сахара из всех чеков за 7 дней, норма семьи, дни, источники, деньги и прогноз на год.
import 'dart:math';

import 'package:flutter/material.dart';

import '../core/engine.dart';
import '../core/insights.dart';
import '../core/models.dart';
import '../core/store.dart';
import '../ui/kit.dart';
import '../ui/pile_hero.dart';
import 'shell.dart';

/// больше кубиков на экране не рисуем — счётчик всё равно показывает настоящее число
const _pileCap = 220;

class WeekScreen extends StatefulWidget {
  final VoidCallback onProfile;
  const WeekScreen({super.key, required this.onProfile});

  @override
  State<WeekScreen> createState() => _WeekScreenState();
}

class _WeekScreenState extends State<WeekScreen> {
  MetricId _metric = MetricId.sugar;

  @override
  Widget build(BuildContext context) {
    final onProfile = widget.onProfile;
    final p = store.profile;
    final st = weekStats(store.history, p);
    final mdef = metrics[_metric]!;
    final mw = st.metrics[_metric]!;
    final cubes = mw.cubes, norm = mw.normCubes;
    final ratio = mw.ratio;
    final pct = (ratio * 100).round();
    final tone = ratio <= .7
        ? Tone.good
        : ratio <= 1
        ? Tone.mid
        : Tone.bad;
    final maxDay = st.days.map((d) => d.by[_metric]!).fold(1, max);
    final empty = st.receipts.isEmpty;
    final shown = min(cubes, _pileCap);
    final over = cubes - norm;
    final family =
        '${p.adults} ${pl(p.adults, adultsF)}${p.kids > 0 ? ' и ${p.kids} ${pl(p.kids, kidsF)}' : ''}';
    final normLine = empty
        ? 'Отсканируй чек — и здесь появится гора за неделю.'
        : over > 0
        ? 'Это на $over ${pl(over, cubesF)} больше недельной нормы семьи.'
        : ratio <= .7
        ? 'Отличная неделя: ${mdef.of} заметно меньше нормы.'
        : 'В пределах недельной нормы семьи.';

    Widget card({
      required Widget child,
      Color color = tint,
      EdgeInsets padding = const EdgeInsets.all(16),
    }) => Container(
      padding: padding,
      decoration: BoxDecoration(
        color: color,
        borderRadius: BorderRadius.circular(24),
      ),
      child: child,
    );

    return LayoutBuilder(
      builder: (context, box) => SingleChildScrollView(
        child: Column(
          children: [
            PileHero(
              height: max(420.0, box.maxHeight * .58),
              kick: 'В чеках за неделю',
              target: shown,
              maxCubes: max(1, shown),
              real: (n) => shown > 0 ? (n * cubes / shown).round() : 0,
              capSuffix: ' за 7 дней',
              metric: _metric,
              onMetric: (m) => setState(() => _metric = m),
              bar: Row(
                children: [
                  const SizedBox(width: 6),
                  Text('Неделя', style: disp(22, w: 800, color: Colors.white)),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Align(
                      alignment: Alignment.centerRight,
                      child: TonePill(
                        tone,
                        empty ? 'чеков пока нет' : '$pct% нормы семьи',
                      ),
                    ),
                  ),
                ],
              ),
            ),
            Sheet(
              padding: EdgeInsets.fromLTRB(
                14,
                24,
                14,
                tabBarSpace(context) + 16,
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  // ── норма семьи ──
                  const SecTitle('Норма семьи'),
                  card(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          crossAxisAlignment: CrossAxisAlignment.end,
                          children: [
                            Flexible(
                              child: FittedBox(
                                fit: BoxFit.scaleDown,
                                alignment: Alignment.centerLeft,
                                child: Row(
                                  crossAxisAlignment: CrossAxisAlignment.end,
                                  children: [
                                    Text('$cubes', style: disp(46, ls: -.05)),
                                    const SizedBox(width: 8),
                                    Padding(
                                      padding: const EdgeInsets.only(bottom: 5),
                                      child: Text(
                                        'из $norm',
                                        style: disp(18, color: mute, ls: -.03),
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                            const SizedBox(width: 12),
                            Text(
                              '${pl(norm, cubesF)}\nв неделю',
                              textAlign: TextAlign.right,
                              style: body(13, w: 700, color: mute, h: 1.2),
                            ),
                          ],
                        ),
                        const SizedBox(height: 12),
                        ClipRRect(
                          borderRadius: BorderRadius.circular(8),
                          child: Container(
                            height: 16,
                            color: Colors.white,
                            alignment: Alignment.centerLeft,
                            child: FractionallySizedBox(
                              widthFactor:
                                  (cubes > 0 ? max(.04, pct / 100) : 0.0).clamp(
                                    0.0,
                                    1.0,
                                  ),
                              child: Container(
                                decoration: BoxDecoration(
                                  color: toneColor(tone),
                                  borderRadius: BorderRadius.circular(8),
                                ),
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(height: 12),
                        Text(normLine, style: body(15)),
                        Press(
                          onTap: onProfile,
                          child: Padding(
                            padding: const EdgeInsets.only(top: 12, bottom: 2),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Text(
                                  'Семья: $family',
                                  style: body(14, w: 700, color: blue1),
                                ),
                                const Icon(
                                  Icons.chevron_right_rounded,
                                  color: blue1,
                                  size: 18,
                                ),
                              ],
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                  // ── по дням ──
                  const SizedBox(height: 28),
                  const SecTitle('По дням'),
                  card(
                    padding: const EdgeInsets.fromLTRB(10, 16, 10, 12),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        for (final d in st.days)
                          Expanded(
                            child: Semantics(
                              label:
                                  '${d.day}-е число: ${d.by[_metric]!} ${pl(d.by[_metric]!, cubesF)}',
                              excludeSemantics: true,
                              child: Column(
                                children: [
                                  Text(
                                    d.by[_metric]! > 0
                                        ? '${d.by[_metric]!}'
                                        : '',
                                    style: disp(13, w: 800, ls: 0),
                                  ),
                                  const SizedBox(height: 6),
                                  SizedBox(
                                    height: 96,
                                    child: Align(
                                      alignment: Alignment.bottomCenter,
                                      child: TweenAnimationBuilder<double>(
                                        tween: Tween(
                                          begin: 6,
                                          end: d.by[_metric]! > 0
                                              ? max(
                                                  10.0,
                                                  d.by[_metric]! / maxDay * 96,
                                                )
                                              : 6,
                                        ),
                                        duration: const Duration(
                                          milliseconds: 700,
                                        ),
                                        curve: Curves.easeOutCubic,
                                        builder: (_, h, __) => Container(
                                          height: h,
                                          margin: const EdgeInsets.symmetric(
                                            horizontal: 4,
                                          ),
                                          constraints: const BoxConstraints(
                                            maxWidth: 32,
                                          ),
                                          decoration: BoxDecoration(
                                            color: d.by[_metric]! > 0
                                                ? (d.today ? blue1 : blue3)
                                                : line,
                                            borderRadius: BorderRadius.circular(
                                              9,
                                            ),
                                          ),
                                        ),
                                      ),
                                    ),
                                  ),
                                  const SizedBox(height: 6),
                                  Text(
                                    d.label.toUpperCase(),
                                    style: body(
                                      12,
                                      w: 800,
                                      color: d.today ? blue1 : mute,
                                      h: 1.1,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 28),
                  if (empty)
                    Container(
                      padding: const EdgeInsets.all(20),
                      decoration: BoxDecoration(
                        gradient: sky,
                        borderRadius: BorderRadius.circular(24),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Text(
                            'Неделя пока пустая',
                            style: disp(22, color: Colors.white, h: 1.05),
                          ),
                          const SizedBox(height: 8),
                          Text(
                            'Сканируй чеки после каждого похода в магазин — увидишь, сколько сахара семья покупает за неделю.',
                            style: body(
                              15,
                              color: Colors.white.withValues(alpha: .9),
                            ),
                          ),
                          const SizedBox(height: 16),
                          WhiteButton(
                            'Сканировать чек',
                            icon: Icons.photo_camera_rounded,
                            height: 56,
                            onTap: () => openCamera(context),
                          ),
                        ],
                      ),
                    )
                  else ...[
                    // ── если так весь год ──
                    const SecTitle('Если так весь год'),
                    Container(
                      padding: const EdgeInsets.all(18),
                      decoration: BoxDecoration(
                        color: ink,
                        borderRadius: BorderRadius.circular(24),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            crossAxisAlignment: CrossAxisAlignment.end,
                            children: [
                              Flexible(
                                child: FittedBox(
                                  fit: BoxFit.scaleDown,
                                  alignment: Alignment.centerLeft,
                                  child: Text(
                                    (mw.total * 52 / 1000)
                                        .toStringAsFixed(
                                          mw.total * 52 >= 10000 ? 0 : 1,
                                        )
                                        .replaceAll('.', ','),
                                    style: disp(
                                      54,
                                      color: Colors.white,
                                      ls: -.06,
                                    ),
                                  ),
                                ),
                              ),
                              const SizedBox(width: 8),
                              Padding(
                                padding: const EdgeInsets.only(bottom: 7),
                                child: Text(
                                  _metric == MetricId.kcal
                                      ? 'тыс. ккал'
                                      : 'кг ${mdef.of}',
                                  style: disp(
                                    17,
                                    w: 500,
                                    color: Colors.white,
                                    ls: -.01,
                                  ),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 10),
                          Text(
                            'Столько ${_metric == MetricId.sugar ? 'добавленного сахара' : mdef.of} семья купит за год, если каждая неделя будет как эта. Это ${group((mw.total * 52 / mdef.cubeG).round())} кубиков.',
                            style: body(
                              14,
                              color: Colors.white.withValues(alpha: .82),
                            ),
                          ),
                          const SizedBox(height: 14),
                          Container(
                            padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
                            decoration: BoxDecoration(
                              color: Colors.white.withValues(alpha: .1),
                              borderRadius: BorderRadius.circular(18),
                            ),
                            child: Row(
                              children: [
                                const Icon(
                                  Icons.savings_rounded,
                                  color: mid,
                                  size: 24,
                                ),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: Text.rich(
                                    TextSpan(
                                      children: [
                                        TextSpan(
                                          text: money(st.junk * 52),
                                          style: disp(
                                            16,
                                            w: 800,
                                            color: Colors.white,
                                            ls: -.02,
                                            h: 1.3,
                                          ),
                                        ),
                                        const TextSpan(
                                          text: ' в год уйдёт на вредное',
                                        ),
                                      ],
                                    ),
                                    style: body(
                                      14,
                                      color: Colors.white.withValues(alpha: .9),
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                    // ── источники ──
                    if (mw.sources.isNotEmpty) ...[
                      const SizedBox(height: 28),
                      const SecTitle('Главные источники'),
                      for (final (i, s) in mw.sources.indexed)
                        Container(
                          margin: const EdgeInsets.only(bottom: 8),
                          padding: const EdgeInsets.fromLTRB(10, 10, 16, 10),
                          decoration: BoxDecoration(
                            color: tint,
                            borderRadius: BorderRadius.circular(20),
                          ),
                          child: Row(
                            children: [
                              Container(
                                width: 34,
                                height: 34,
                                alignment: Alignment.center,
                                decoration: BoxDecoration(
                                  color: Colors.white,
                                  borderRadius: BorderRadius.circular(12),
                                ),
                                child: Text(
                                  '${i + 1}',
                                  style: disp(14, color: blue1, ls: 0),
                                ),
                              ),
                              const SizedBox(width: 12),
                              Expanded(
                                child: Text(
                                  s.$1,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: body(15, w: 700),
                                ),
                              ),
                              Text(
                                '${cubesOfValue(s.$2, _metric)}',
                                style: disp(17, ls: -.03),
                              ),
                              const SizedBox(width: 5),
                              Text(
                                pl(cubesOfValue(s.$2, _metric), cubesF),
                                style: body(12, w: 700, color: mute),
                              ),
                            ],
                          ),
                        ),
                    ],
                    // ── деньги ──
                    const SizedBox(height: 20),
                    const SecTitle('Деньги'),
                    IntrinsicHeight(
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Expanded(
                            child: card(
                              child: _money(
                                'На вредное',
                                money(st.junk),
                                st.total > 0
                                    ? '${(st.junk / st.total * 100).round()}% всех трат'
                                    : 'трат нет',
                              ),
                            ),
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: card(
                              color: good.withValues(alpha: .12),
                              child: _money(
                                'Замены экономят',
                                money(st.saved),
                                mw.cubesSaved > 0
                                    ? 'и минус ${mw.cubesSaved} ${pl(mw.cubesSaved, cubesF)} ${mdef.of}'
                                    : 'включи замены в чеке',
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                    // ── чеки недели ──
                    const SizedBox(height: 28),
                    SecTitle(
                      '${st.receipts.length} ${pl(st.receipts.length, receiptsF)} за неделю',
                    ),
                    for (final r in st.receipts)
                      Container(
                        margin: const EdgeInsets.only(bottom: 8),
                        padding: const EdgeInsets.all(6),
                        decoration: BoxDecoration(
                          color: tint,
                          borderRadius: BorderRadius.circular(22),
                        ),
                        child: Row(
                          children: [
                            Expanded(
                              child: Press(
                                scale: .985,
                                onTap: () => openSaved(context, r.entry.id),
                                child: Padding(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 10,
                                    vertical: 8,
                                  ),
                                  child: Row(
                                    children: [
                                      Expanded(
                                        child: Column(
                                          crossAxisAlignment:
                                              CrossAxisAlignment.start,
                                          children: [
                                            Text(
                                              r.receipt.store,
                                              maxLines: 1,
                                              overflow: TextOverflow.ellipsis,
                                              style: disp(
                                                15,
                                                w: 700,
                                                ls: -.02,
                                                h: 1.25,
                                              ),
                                            ),
                                            Text(
                                              '${dateRu(r.receipt.date)} · ${r.receipt.title}',
                                              maxLines: 1,
                                              overflow: TextOverflow.ellipsis,
                                              style: body(13, color: mute),
                                            ),
                                          ],
                                        ),
                                      ),
                                      const SizedBox(width: 10),
                                      Text(
                                        '${r.analysis.cubesBy[_metric]}',
                                        style: disp(20),
                                      ),
                                      const SizedBox(width: 9),
                                      ToneDot(verdict(r.analysis.score).tone),
                                    ],
                                  ),
                                ),
                              ),
                            ),
                            Press(
                              scale: .9,
                              label:
                                  'Удалить чек: ${r.receipt.store}, ${dateRu(r.receipt.date)}',
                              onTap: () {
                                store.removeEntry(r.entry.id);
                                showToast('Чек удалён из истории');
                              },
                              child: const SizedBox(
                                width: 44,
                                height: 44,
                                child: Icon(
                                  Icons.delete_outline_rounded,
                                  color: mute,
                                  size: 22,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                  ],
                  const SizedBox(height: 14),
                  Text(
                    'Неделя считается по датам чеков. Это купленное, а не съеденное: часть продуктов останется на потом. 1 кубик ${mdef.of} = ${cubeLabel(_metric)}. Норма: ${mdef.norm}.',
                    style: body(12, color: mute, h: 1.5),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _money(String label, String value, String hint) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Text(label, style: body(13, w: 700, color: mute)),
      const SizedBox(height: 4),
      FittedBox(
        fit: BoxFit.scaleDown,
        alignment: Alignment.centerLeft,
        child: Text(value, style: disp(22)),
      ),
      const SizedBox(height: 8),
      Text(hint, style: body(13, color: mute, h: 1.25)),
    ],
  );
}

// «Неделя»: гора за календарную неделю по факту, стрик и закрытие недели, норма и цель, дни, источники, деньги. Вторая вкладка — журнал.
import 'dart:math';

import 'package:flutter/material.dart';

import '../core/calendar.dart';
import '../core/engine.dart';
import '../core/i18n.dart';
import '../core/insights.dart';
import '../core/models.dart';
import '../core/store.dart';
import '../ui/forms.dart';
import '../ui/kit.dart';
import '../ui/pile_hero.dart';
import '../ui/share_card.dart';
import '../ui/streak_view.dart';
import 'journal.dart';
import 'shell.dart';

class WeekScreen extends StatefulWidget {
  final VoidCallback onProfile;
  const WeekScreen({super.key, required this.onProfile});

  @override
  State<WeekScreen> createState() => _WeekScreenState();
}

class _WeekScreenState extends State<WeekScreen> {
  MetricId _metric = MetricId.sugar;
  String? _week;
  bool _journal = false;

  Future<void> _shareWeek(String week) {
    final w = weekStats(store.real, store.profile, week: week);
    final pct = (w.ratio * 100).round();
    return shareResult(
      metric: MetricId.sugar,
      cubesBy: {for (final m in metricIds) m: w.metrics[m]!.cubes},
      totals: {for (final m in metricIds) m: w.metrics[m]!.total},
      available: metricIds.toSet(),
      pill: streakTitle(store.streak),
      tone: w.ratio <= .7
          ? Tone.good
          : w.ratio <= 1
          ? Tone.mid
          : Tone.bad,
      where: weekTxt(week),
      kick: t('За неделю'),
      level: store.streak.level,
      text: t(
        '{s} в «Чек-ап»: за неделю {n} кубиков сахара, {p}% нормы семьи.',
        {'s': streakTitle(store.streak), 'n': w.cubes, 'p': pct},
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final p = store.profile;
    final thisWeek = weekOf(todayIso());
    final week = _week ?? thisWeek;
    final current = week == thisWeek;
    final list = store.shown;
    final st = weekStats(list, p, week: week);
    final mdef = metrics[_metric]!;
    final mw = st.metrics[_metric]!;
    final pct = (mw.ratio * 100).round();
    final tone = !isHarmfulMetric(_metric) || mw.ratio <= .7
        ? Tone.good
        : mw.ratio <= 1
        ? Tone.mid
        : Tone.bad;
    final maxDay = st.days.map((d) => d.amounts[_metric]!).fold<double>(1, max);
    final bought = st.receipts.length + st.refunds.length;
    final empty = bought == 0 && mw.total == 0;
    final incomplete = st.receipts.any(
      (r) => r.analysis.items.any(
        (it) => it.counted && !hasMetricData(it.item, _metric),
      ),
    );
    final shown = pileCount(mw.total, _metric);

    return LayoutBuilder(
      builder: (context, box) => SingleChildScrollView(
        child: Column(
          children: [
            PileHero(
              key: ValueKey(week),
              height: max(400.0, box.maxHeight * .58),
              kick: t('Куплено по чекам'),
              target: shown,
              maxCubes: max(1, shown),
              value: mw.total,
              capSuffix: ' ${t('за неделю')}',
              metric: _metric,
              level: store.streak.level,
              onMetric: (m) => setState(() => _metric = m),
              bar: Row(
                children: [
                  BarButton(
                    Icons.chevron_left_rounded,
                    t('Предыдущая неделя'),
                    () => setState(() => _week = addDays(week, -7)),
                  ),
                  Expanded(
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 6),
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          FittedBox(
                            child: Text(
                              current ? t('Эта неделя') : weekTxt(week),
                              style: disp(
                                15,
                                w: 800,
                                color: Colors.white,
                                h: 1.2,
                              ),
                            ),
                          ),
                          FittedBox(
                            child: Text(
                              empty
                                  ? t('чеков нет')
                                  : t('{n}% нормы', {'n': pct}),
                              style: body(
                                13,
                                w: 700,
                                color: Colors.white.withValues(alpha: .9),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  Opacity(
                    opacity: current ? .35 : 1,
                    child: BarButton(
                      Icons.chevron_right_rounded,
                      t('Следующая неделя'),
                      () => current
                          ? null
                          : setState(() => _week = addDays(week, 7)),
                    ),
                  ),
                ],
              ),
            ),
            Sheet(
              padding: EdgeInsets.fromLTRB(
                14,
                20,
                14,
                tabBarSpace(context) + 16,
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Segmented(
                    value: _journal,
                    options: [(false, t('Неделя')), (true, t('Журнал'))],
                    onChange: (v) => setState(() => _journal = v),
                  ),
                  const SizedBox(height: 22),
                  if (_journal)
                    const Journal()
                  else ...[
                    if (current) ...[
                      StreakCard(
                        onScan: () => openCamera(context),
                        onShare: _shareWeek,
                      ),
                      const SizedBox(height: 28),
                    ],
                    SecTitle(t('Норма семьи')),
                    Tile(child: _norm(mw, tone, pct, st, empty, incomplete)),
                    if (isCubeMetric(_metric)) ...[
                      const SizedBox(height: 28),
                      SecTitle(t('Цель')),
                      Tile(child: _goal(week)),
                    ],
                    // ── по дням ──
                    const SizedBox(height: 28),
                    SecTitle(t('По дням')),
                    Tile(
                      padding: const EdgeInsets.fromLTRB(10, 16, 10, 12),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          for (final d in st.days)
                            Expanded(
                              child: Semantics(
                                label:
                                    '${dayTxt(d.iso)}: ${metricTxt(d.amounts[_metric]!, _metric)}',
                                excludeSemantics: true,
                                child: Column(
                                  children: [
                                    Text(
                                      d.amounts[_metric]! > 0
                                          ? bigNum(d.amounts[_metric]!, _metric)
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
                                            end: d.amounts[_metric]! > 0
                                                ? max(
                                                    10.0,
                                                    d.amounts[_metric]! /
                                                        maxDay *
                                                        96,
                                                  )
                                                : 6,
                                          ),
                                          duration: const Duration(
                                            milliseconds: 700,
                                          ),
                                          curve: Curves.easeOutCubic,
                                          builder: (_, h, _) => Container(
                                            height: h,
                                            margin: const EdgeInsets.symmetric(
                                              horizontal: 4,
                                            ),
                                            constraints: const BoxConstraints(
                                              maxWidth: 32,
                                            ),
                                            decoration: BoxDecoration(
                                              color: d.amounts[_metric]! > 0
                                                  ? (d.today
                                                        ? blue1
                                                        : d.future
                                                        ? blue3.withValues(
                                                            alpha: .5,
                                                          )
                                                        : blue3)
                                                  : line,
                                              borderRadius:
                                                  BorderRadius.circular(9),
                                            ),
                                          ),
                                        ),
                                      ),
                                    ),
                                    const SizedBox(height: 6),
                                    Text(
                                      t(d.label).toUpperCase(),
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
                      FlatBtn(
                        t('Внести чек'),
                        primary: true,
                        icon: Icons.photo_camera_rounded,
                        height: 56,
                        onTap: () => openCamera(context),
                      )
                    else ...[
                      // ── источники ──
                      if (mw.sources.isNotEmpty) ...[
                        const SizedBox(height: 28),
                        SecTitle(t('Главные источники')),
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
                                    maxLines: 2,
                                    overflow: TextOverflow.ellipsis,
                                    style: body(15, w: 700),
                                  ),
                                ),
                                Text(
                                  bigNum(s.$2, _metric),
                                  style: disp(17, ls: -.03),
                                ),
                                const SizedBox(width: 5),
                                Text(
                                  bigCap(s.$2, _metric),
                                  style: body(12, w: 700, color: mute),
                                ),
                              ],
                            ),
                          ),
                      ],

                      if (!store.isChild && bought > 0) ...[
                        const SizedBox(height: 20),
                        SecTitle(t('Деньги')),
                        _moneyCards(st),
                      ],
                      if (bought > 0) ...[
                        const SizedBox(height: 28),
                        SecTitle(
                          '${st.receipts.length} ${pl(st.receipts.length, receiptsF)} ${t('за неделю')}',
                        ),
                        for (final r in [...st.receipts, ...st.refunds])
                          ReceiptRow(r.entry, metric: _metric),
                      ],
                    ],
                    const SizedBox(height: 14),
                    Text(
                      '${t('Неделя идёт с понедельника по воскресенье. Это купленное, а не съеденное.')} ${unitNote(_metric)}. ${t('Норма')}: ${t(mdef.norm)}.',
                      textAlign: TextAlign.center,
                      style: body(12, color: mute, h: 1.5),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _norm(
    MetricWeek mw,
    Tone tone,
    int pct,
    WeekStats st,
    bool empty,
    bool incomplete,
  ) {
    final p = store.profile;
    final over = mw.total - mw.norm;
    final family =
        '${p.adults} ${pl(p.adults, adultsF)}${p.kids > 0 ? ' ${t('и')} ${p.kids} ${pl(p.kids, kidsF)}' : ''}';
    final text = incomplete
        ? t('Сумма по доступным данным: в части чеков этого показателя нет.')
        : empty
        ? t('Внеси чек, и здесь появятся данные за неделю.')
        : !isHarmfulMetric(_metric)
        ? t('По чекам: {n}% недельного ориентира семьи.', {'n': pct})
        : over > .05
        ? t('Это на {x} больше недельной нормы семьи.', {
            'x': metricTxt(over, _metric),
          })
        : t('В пределах недельной нормы семьи.');
    return Column(
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
                    Text(bigNum(mw.total, _metric), style: disp(46, ls: -.05)),
                    const SizedBox(width: 8),
                    Padding(
                      padding: const EdgeInsets.only(bottom: 5),
                      child: Text(
                        '${t('из')} ${bigNum(mw.norm, _metric)}',
                        style: disp(18, color: mute, ls: -.03),
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(width: 12),
            Text(
              '${bigCap(mw.norm, _metric)}\n${t('в неделю')}',
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
              widthFactor: (mw.total > 0 ? max(.04, pct / 100) : 0.0).clamp(
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
        Text(text, style: body(15)),
        if (mw.fromStock > .05)
          Padding(
            padding: const EdgeInsets.only(top: 6),
            child: Text(
              t('Из них {x} из запасов, купленных раньше.', {
                'x': metricTxt(mw.fromStock, _metric),
              }),
              style: body(13, color: mute),
            ),
          ),
        if (st.guests > 0)
          Padding(
            padding: const EdgeInsets.only(top: 6),
            child: Text(
              t('Чеки с пометкой «гости» в норму не входят.'),
              style: body(13, color: mute),
            ),
          ),
        Press(
          onTap: widget.onProfile,
          child: Padding(
            padding: const EdgeInsets.only(top: 12, bottom: 2),
            child: Row(
              children: [
                Flexible(
                  child: Text(
                    '${t('Семья')}: $family',
                    style: body(14, w: 700, color: blue1),
                  ),
                ),
                const Icon(Icons.chevron_right_rounded, color: blue1, size: 18),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _goal(String week) {
    final g = goalState(
      store.real,
      store.profile,
      store.marks,
      store.profile.goal,
      week: week,
    );
    final pct = store.profile.goal;
    final ok = g.now <= g.target;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          g.base < 2
              ? t(
                  'Закрой две недели: посчитаем обычное количество сахара и предложим цель.',
                )
              : pct > 0
              ? t('Обычно {a}, цель −{p}%: до {g} {w}.', {
                  'a': g.average,
                  'p': pct,
                  'g': g.target,
                  'w': pl(g.target, cubesF),
                })
              : t('Обычно у вас {n} {w} в неделю. На сколько уменьшим?', {
                  'n': g.average,
                  'w': pl(g.average, cubesF),
                }),
          style: body(15),
        ),
        if (g.base >= 2 && pct > 0)
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Text(
              ok
                  ? t('Идёшь по цели: {n}', {'n': g.now})
                  : t('Уже {n}, на {d} больше цели', {
                      'n': g.now,
                      'd': g.now - g.target,
                    }),
              style: body(
                15,
                w: 800,
                color: ok ? const Color(0xFF0E8A51) : const Color(0xFFB26A00),
              ),
            ),
          ),
        if (g.base >= 2 && !store.isChild)
          Padding(
            padding: const EdgeInsets.only(top: 12),
            child: Row(
              children: [
                for (final (i, v) in [0, ...goals].indexed) ...[
                  if (i > 0) const SizedBox(width: 6),
                  Expanded(
                    child: FlatBtn(
                      v == 0 ? t('нет') : '−$v%',
                      primary: pct == v,
                      white: pct != v,
                      height: 44,
                      onTap: () => store.updateFamily(goal: v),
                    ),
                  ),
                ],
              ],
            ),
          ),
        const SizedBox(height: 8),
        Text(t('На стрик цель не влияет.'), style: body(13, color: mute)),
      ],
    );
  }

  Widget _moneyCards(WeekStats st) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      IntrinsicHeight(
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Expanded(
              child: Tile(
                child: stat(
                  t('На вредное'),
                  money(st.junk),
                  st.food > 0
                      ? t('{n}% из {m} на еду', {
                          'n': (st.junk / st.food * 100).round(),
                          'm': money(st.food),
                        })
                      : t('трат нет'),
                ),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Tile(
                color: good.withValues(alpha: .12),
                child: stat(
                  t('Замены сработали'),
                  money(st.saved),
                  st.confirmed.isNotEmpty
                      ? t('и минус {n} {w} сахара', {
                          'n': st.cubesSaved,
                          'w': pl(st.cubesSaved, cubesF),
                        })
                      : t('засчитаем, когда следующий чек подтвердит'),
                ),
              ),
            ),
          ],
        ),
      ),
      for (final c in st.confirmed.take(4))
        Padding(
          padding: const EdgeInsets.only(top: 8),
          child: Tile(
            color: good.withValues(alpha: .09),
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            child: Text('${c.from} → ${c.to}', style: body(14)),
          ),
        ),
      if (st.flagged > 0)
        Padding(
          padding: const EdgeInsets.only(top: 8),
          child: Tile(
            color: bad.withValues(alpha: .08),
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    t('Алкоголь и энергетики'),
                    style: body(14, w: 700),
                  ),
                ),
                Text(money(st.flagged), style: disp(16, w: 800)),
              ],
            ),
          ),
        ),
    ],
  );
}

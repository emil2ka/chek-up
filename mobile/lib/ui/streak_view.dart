// Стрик «недели подряд»: ряд кубиков-недель, плашка на главной и карточка закрытия недели.
import 'package:flutter/material.dart';

import '../core/calendar.dart';
import '../core/engine.dart';
import '../core/i18n.dart';
import '../core/insights.dart' as insights;
import '../core/store.dart';
import '../core/streak.dart';
import 'forms.dart';
import 'kit.dart';

String streakTitle(Streak s) => s.current > 0
    ? t('{n} {w} подряд', {'n': s.current, 'w': pl(s.current, weeksF)})
    : t('Начни стрик');

String _cellName(String k) => switch (k) {
  'full' => t('засчитана, сахар в норме'),
  'outline' => t('засчитана, сахара больше нормы'),
  'none' => t('засчитана, покупок не было'),
  'frozen' => t('пропуск на заморозке'),
  'miss' => t('пропущена'),
  'now' => t('идёт'),
  _ => t('ещё можно закрыть'),
};

/// Ряд последних 12 недель на синем фоне; пустые места справа — будущие.
class StreakRow extends StatelessWidget {
  final Streak streak;
  const StreakRow(this.streak, {super.key});

  Widget _cell(String? kind) {
    final white = Colors.white;
    Color? fill;
    BoxBorder? border;
    switch (kind) {
      case 'full':
        fill = white;
      case 'outline':
        border = Border.all(color: white, width: 2.5);
      case 'none':
        border = Border.all(color: white.withValues(alpha: .75), width: 2);
      case 'frozen':
        fill = white.withValues(alpha: .28);
      case 'miss':
        border = Border.all(color: white.withValues(alpha: .3), width: 2);
      case 'now':
        border = Border.all(color: white.withValues(alpha: .8), width: 1.5);
      case 'late':
        border = Border.all(color: mid, width: 2.5);
      default:
        fill = white.withValues(alpha: .1);
    }
    return AspectRatio(
      aspectRatio: 1,
      child: Container(
        decoration: BoxDecoration(
          color: fill,
          border: border,
          borderRadius: BorderRadius.circular(7),
        ),
        child: switch (kind) {
          'full' => const FittedBox(
            child: Padding(
              padding: EdgeInsets.all(4),
              child: Icon(Icons.check_rounded, color: blue1),
            ),
          ),
          'frozen' => FittedBox(
            child: Padding(
              padding: const EdgeInsets.all(4),
              child: Icon(Icons.ac_unit_rounded, color: white),
            ),
          ),
          'none' => Center(
            child: Container(
              width: 6,
              height: 2,
              color: white.withValues(alpha: .75),
            ),
          ),
          _ => null,
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) => Semantics(
    label: [
      for (final c in streak.cells) '${weekTxt(c.week)}: ${_cellName(c.kind)}',
    ].join('. '),
    child: Row(
      children: [
        for (var i = 0; i < 12; i++) ...[
          if (i > 0) const SizedBox(width: 4),
          Expanded(
            child: _cell(i < streak.cells.length ? streak.cells[i].kind : null),
          ),
        ],
      ],
    ),
  );
}

/// Узкая плашка на главной.
class StreakPill extends StatelessWidget {
  final VoidCallback onTap;
  const StreakPill({super.key, required this.onTap});
  @override
  Widget build(BuildContext context) {
    final s = store.streak;
    final done = completeness(store);
    final today = todayIso(), sunday = addDays(weekOf(today), 6);
    final left = today == sunday
        ? t('сегодня последний день недели')
        : t('до {day}', {'day': dayTxt(sunday)});
    return Press(
      scale: .985,
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 13),
        decoration: BoxDecoration(
          color: ink.withValues(alpha: .2),
          borderRadius: BorderRadius.circular(22),
          border: Border.all(color: Colors.white.withValues(alpha: .2)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Wrap(
              alignment: WrapAlignment.spaceBetween,
              crossAxisAlignment: WrapCrossAlignment.end,
              spacing: 10,
              runSpacing: 2,
              children: [
                Text(
                  streakTitle(s),
                  style: disp(
                    16,
                    w: 800,
                    color: Colors.white,
                    ls: -.03,
                    h: 1.2,
                  ),
                ),
                Text(
                  '${done.now}${done.usual > 0 ? ' ${t('из')} ${done.usual}' : ''} ${pl(done.now, receiptsF)} · $left',
                  style: body(
                    13,
                    w: 700,
                    color: Colors.white.withValues(alpha: .88),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 9),
            StreakRow(s),
          ],
        ),
      ),
    );
  }
}

({int now, int usual}) completeness(AppStore s) =>
    insights.completeness(s.real, s.marks, s.closingWeek);

/// Карточка стрика: сколько внесено, закрыть неделю, отменить.
class StreakCard extends StatefulWidget {
  final VoidCallback onScan;
  final void Function(String week) onShare;
  const StreakCard({super.key, required this.onScan, required this.onShare});
  @override
  State<StreakCard> createState() => _StreakCardState();
}

class _StreakCardState extends State<StreakCard> {
  bool _ask = false;

  void _close(String week, String state) {
    thud();
    setState(() => _ask = false);
    store.setMark(week, state);
  }

  @override
  Widget build(BuildContext context) {
    final s = store.streak;
    final week = store.closingWeek;
    final done = completeness(store);
    final state =
        store.marks.where((m) => m.week == week).firstOrNull?.state ?? 'open';
    final closed = state != 'open';
    final isPrev = week.compareTo(weekOf(todayIso())) < 0;
    final hours = ((closeDeadline(week) - nowMs()) / 3600000).ceil().clamp(
      1,
      999,
    );
    final few = done.usual > 0 && done.now < done.usual;

    Widget inner;
    if (closed) {
      inner = Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Container(
                width: 28,
                height: 28,
                decoration: const BoxDecoration(
                  color: good,
                  shape: BoxShape.circle,
                ),
                child: const Icon(
                  Icons.check_rounded,
                  color: Colors.white,
                  size: 19,
                ),
              ),
              const SizedBox(width: 9),
              Expanded(
                child: Text(
                  state == 'none' && done.now == 0
                      ? t('Неделя закрыта: покупок не было')
                      : t('Неделя закрыта'),
                  style: body(16, w: 800),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: FlatBtn(
                  t('Поделиться'),
                  primary: true,
                  onTap: () => widget.onShare(week),
                ),
              ),
              if (!store.isChild) ...[
                const SizedBox(width: 8),
                Expanded(
                  child: FlatBtn(
                    t('Открыть снова'),
                    onTap: () => store.setMark(week, 'open'),
                  ),
                ),
              ],
            ],
          ),
        ],
      );
    } else if (store.isChild) {
      inner = Text(
        t('Неделю закрывает взрослый. Твои чеки уже учтены.'),
        style: body(15, w: 700),
      );
    } else {
      inner = Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            done.now == 0
                ? t('На этой неделе чеков пока нет')
                : done.usual > 0
                ? t('Внесено {n} {w} из обычных {u}', {
                    'n': done.now,
                    'w': pl(done.now, receiptsF),
                    'u': done.usual,
                  })
                : t('Внесено {n} {w}', {
                    'n': done.now,
                    'w': pl(done.now, receiptsF),
                  }),
            style: body(16, w: 800),
          ),
          if (isPrev)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text(
                '${t('Можно дозаписать до вечера понедельника')} · ${t('осталось {n} ч', {'n': hours})}',
                style: body(13, w: 700, color: const Color(0xFFB26A00)),
              ),
            ),
          const SizedBox(height: 12),
          if (_ask)
            ConfirmBox(
              text: done.now > 0
                  ? t('Обычно чеков больше. Точно внесены все?')
                  : t(
                      'Закрыть неделю без чеков? Отметим, что продукты не покупали.',
                    ),
              no: t('Отмена'),
              yes: t('Да, закрыть'),
              danger: false,
              onNo: () => setState(() => _ask = false),
              onYes: () => _close(week, done.now > 0 ? 'closed' : 'none'),
            )
          else if (done.now > 0)
            FlatBtn(
              t('Это все чеки за неделю'),
              primary: true,
              onTap: () =>
                  few ? setState(() => _ask = true) : _close(week, 'closed'),
            )
          else ...[
            FlatBtn(t('Внести чек'), primary: true, onTap: widget.onScan),
            const SizedBox(height: 8),
            FlatBtn(
              t('Покупок не было'),
              onTap: () => setState(() => _ask = true),
            ),
          ],
        ],
      );
    }

    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        gradient: sky,
        borderRadius: BorderRadius.circular(28),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      streakTitle(s),
                      style: disp(22, color: Colors.white, h: 1.05),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      s.total == 0
                          ? t('Внеси чеки за неделю и нажми «Это все чеки»')
                          : [
                              '${t('Рекорд')}: ${store.bestStreak}',
                              '${s.freezes} ${pl(s.freezes, freezesF)}',
                              if (s.next != null)
                                '${t('до нового кубика')} ${s.next! - s.current}',
                            ].join(' · '),
                      style: body(
                        13,
                        color: Colors.white.withValues(alpha: .88),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Container(
                height: 36,
                padding: const EdgeInsets.symmetric(horizontal: 12),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: .18),
                  borderRadius: BorderRadius.circular(18),
                ),
                child: Row(
                  children: [
                    const Icon(
                      Icons.ac_unit_rounded,
                      color: Colors.white,
                      size: 16,
                    ),
                    const SizedBox(width: 5),
                    Text(
                      '${s.freezes}',
                      style: body(13, w: 800, color: Colors.white),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          StreakRow(s),
          const SizedBox(height: 16),
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(22),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  '${weekTxt(week)}${isPrev ? ' · ${t('прошлая неделя')}' : ''}',
                  style: body(13, w: 700, color: mute),
                ),
                const SizedBox(height: 4),
                inner,
              ],
            ),
          ),
          const SizedBox(height: 12),
          Text(
            t(
              'Белый кубик: сахар в норме, контурный: больше нормы. Стрик горит только от пропуска, а не от сахара.',
            ),
            style: body(13, color: Colors.white.withValues(alpha: .88)),
          ),
        ],
      ),
    );
  }
}

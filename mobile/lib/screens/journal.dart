// Журнал: календарь месяца, итоги, поиск и все чеки без ограничения по времени.
import 'package:flutter/material.dart';

import '../core/calendar.dart';
import '../core/engine.dart';
import '../core/i18n.dart';
import '../core/insights.dart';
import '../core/models.dart';
import '../core/plan.dart';
import '../core/store.dart';
import '../ui/forms.dart';
import '../ui/kit.dart';
import '../ui/metric_icon.dart';
import 'shell.dart';

/// Строка чека: магазин, дата и пометки, кубики (или другой показатель) и точка оценки.
class ReceiptRow extends StatelessWidget {
  final HistoryEntry entry;

  /// число справа по этому показателю; null — все главные строкой и оценка
  final MetricId? metric;
  const ReceiptRow(this.entry, {super.key, this.metric});
  @override
  Widget build(BuildContext context) {
    final e = entry, r = receiptOf(e)!;
    final a = factOf(e, r);
    final score = r.masked ? e.score : a.score;
    final who = store.authorOf(e);
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Press(
        scale: .985,
        onTap: () => openSaved(context, e.id),
        child: Container(
          constraints: const BoxConstraints(minHeight: 60),
          padding: const EdgeInsets.fromLTRB(16, 10, 16, 10),
          decoration: BoxDecoration(
            color: tint,
            borderRadius: BorderRadius.circular(22),
          ),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Flexible(
                          child: Text(
                            e.store,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: disp(15, w: 700, ls: -.02, h: 1.25),
                          ),
                        ),
                        if (e.priv)
                          const Padding(
                            padding: EdgeInsets.only(left: 5),
                            child: Icon(
                              Icons.lock_rounded,
                              color: mute,
                              size: 15,
                            ),
                          ),
                      ],
                    ),
                    Text(
                      [
                        dayTxt(e.date),
                        if (r.refund) t('возврат'),
                        if (e.guests) t('гости'),
                        if (isDemo(e)) t('пример'),
                        if (who.isNotEmpty) who,
                        if (!store.isChild && !r.masked) money(a.total),
                      ].join(' · '),
                      style: body(13, color: mute),
                    ),
                    if (metric == null) ...[
                      const SizedBox(height: 2),
                      MetricLine(a.totals),
                    ],
                  ],
                ),
              ),
              const SizedBox(width: 10),
              Text(
                metric == null
                    ? '$score'
                    : '${r.refund ? '−' : ''}${bigNum(a.totals[metric]!, metric!)}',
                style: disp(20),
              ),
              const SizedBox(width: 9),
              ToneDot(verdict(score).tone),
            ],
          ),
        ),
      ),
    );
  }
}

class Journal extends StatefulWidget {
  const Journal({super.key});
  @override
  State<Journal> createState() => _JournalState();
}

class _JournalState extends State<Journal> {
  String _ym = monthOf(todayIso());
  String? _day;
  String _query = '';
  int _limit = 30;

  static String _norm(String s) => s.toLowerCase().replaceAll('ё', 'е');

  void _go(int d) => setState(() {
    _ym = addMonths(_ym, d);
    _day = null;
    _limit = 30;
  });

  @override
  Widget build(BuildContext context) {
    final entries = store.shown;
    final today = todayIso();
    final days = monthDays(entries, _ym);
    final sum = monthStats(entries, _ym);
    final prev = monthStats(entries, addMonths(_ym, -1));
    final hide = store.isChild;
    final q = _norm(_query.trim());
    final list =
        [
          for (final e in entries)
            if (receiptOf(e) case final Receipt r
                when q.isNotEmpty
                    ? _norm(
                        '${e.store} ${r.title} ${dayTxt(e.date)} ${r.items.map((i) => i.n).join(' ')}',
                      ).contains(q)
                    : _day != null
                    ? e.date == _day
                    : isIso(e.date) && monthOf(e.date) == _ym)
              e,
        ]..sort((a, b) {
          final d = b.date.compareTo(a.date);
          return d != 0 ? d : b.savedAt - a.savedAt;
        });
    final first = dowOf('$_ym-01'), n = daysInMonth(_ym);
    final diff = prev.food > 0
        ? ((sum.food - prev.food) / prev.food * 100).round()
        : 0;

    Widget nav(IconData icon, String label, VoidCallback? onTap) => Press(
      scale: .92,
      label: label,
      onTap: onTap,
      child: Container(
        width: 44,
        height: 44,
        decoration: BoxDecoration(
          color: tint,
          borderRadius: BorderRadius.circular(16),
        ),
        child: Icon(icon, color: blue1),
      ),
    );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            nav(
              Icons.chevron_left_rounded,
              t('Предыдущий месяц'),
              () => _go(-1),
            ),
            Expanded(
              child: Text(
                monthTxt(_ym),
                textAlign: TextAlign.center,
                style: disp(18, w: 800, ls: -.02),
              ),
            ),
            nav(
              Icons.chevron_right_rounded,
              t('Следующий месяц'),
              _ym.compareTo(monthOf(today)) >= 0 ? null : () => _go(1),
            ),
          ],
        ),
        const SizedBox(height: 12),
        Tile(
          padding: const EdgeInsets.all(10),
          child: GridView.count(
            crossAxisCount: 7,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            padding: EdgeInsets.zero,
            mainAxisSpacing: 4,
            crossAxisSpacing: 4,
            children: [
              for (final d in dowShort)
                Center(
                  child: Text(
                    t(d).toUpperCase(),
                    style: body(12, w: 800, color: mute),
                  ),
                ),
              for (var i = 0; i < first; i++) const SizedBox(),
              for (var i = 1; i <= n; i++)
                () {
                  final iso = '$_ym-${i.toString().padLeft(2, '0')}';
                  final d = days[iso];
                  return Press(
                    scale: .93,
                    label:
                        '${dayTxt(iso)}: ${d == null ? t('чеков нет') : '${d.n} ${pl(d.n, receiptsF)}, ${t('оценка')} ${d.score}'}',
                    onTap: () => d == null
                        ? null
                        : setState(() => _day = _day == iso ? null : iso),
                    child: Stack(
                      alignment: Alignment.center,
                      children: [
                        Positioned.fill(
                          child: DecoratedBox(
                            decoration: BoxDecoration(
                              color: d == null ? null : blue1,
                              borderRadius: BorderRadius.circular(12),
                              border: _day == iso
                                  ? Border.all(color: ink, width: 3)
                                  : null,
                            ),
                          ),
                        ),
                        Text(
                          '$i',
                          style: body(
                            14,
                            w: 800,
                            color: d != null
                                ? Colors.white
                                : iso == today
                                ? blue1
                                : mute,
                          ),
                        ),
                        if (d != null)
                          Positioned(
                            bottom: 4,
                            child: Container(
                              width: 6,
                              height: 6,
                              decoration: BoxDecoration(
                                color: toneColor(verdict(d.score).tone),
                                shape: BoxShape.circle,
                              ),
                            ),
                          ),
                      ],
                    ),
                  );
                }(),
            ],
          ),
        ),
        const SizedBox(height: 28),
        SecTitle(t('Итог месяца')),
        SixGrid(totals: sum.totals),
        const SizedBox(height: 8),
        Tile(
          child: stat(
            hide ? t('Чеков') : t('На продукты'),
            hide ? '${sum.receipts}' : money(sum.food),
            '${sum.receipts} ${pl(sum.receipts, receiptsF)}${diff != 0 && !hide ? ' · ${diff > 0 ? '+' : '−'}${diff.abs()}% ${t('к прошлому')}' : ''}',
          ),
        ),
        if (!hide) ...[
          const SizedBox(height: 8),
          IntrinsicHeight(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Expanded(
                  child: Tile(
                    child: stat(
                      t('На вредное'),
                      money(sum.junk),
                      sum.food > 0
                          ? t('{n}% еды', {
                              'n': (sum.junk / sum.food * 100).round(),
                            })
                          : '—',
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Tile(
                    color: good.withValues(alpha: .12),
                    child: stat(
                      t('Замены сработали'),
                      money(sum.saved),
                      t('подтверждено чеками'),
                    ),
                  ),
                ),
              ],
            ),
          ),
          if (sum.stores.length > 1) ...[
            const SizedBox(height: 8),
            Tile(
              child: Column(
                children: [
                  for (final s in sum.stores)
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 3),
                      child: Row(
                        children: [
                          Expanded(
                            child: Text(
                              s.name,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: body(14),
                            ),
                          ),
                          Text(
                            money(s.total),
                            style: disp(14, w: 800, ls: -.02),
                          ),
                        ],
                      ),
                    ),
                ],
              ),
            ),
          ],
        ],
        const SizedBox(height: 28),
        SecTitle(_day != null && q.isEmpty ? dayTxt(_day!) : t('Все чеки')),
        Field(
          hint: t('Магазин или продукт'),
          onChanged: (v) => setState(() {
            _query = v;
            _limit = 30;
          }),
        ),
        const SizedBox(height: 8),
        if (list.isEmpty)
          Padding(
            padding: const EdgeInsets.all(6),
            child: Text(
              q.isNotEmpty
                  ? t('Ничего не нашлось')
                  : t('В этом месяце чеков нет'),
              style: body(15, color: mute),
            ),
          ),
        for (final e in list.take(_limit)) ReceiptRow(e),
        if (list.length > _limit)
          FlatBtn(
            t('Показать ещё'),
            color: blue1,
            onTap: () => setState(() => _limit += 30),
          ),
      ],
    );
  }
}

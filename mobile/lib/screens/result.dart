// Экран результата: гора → одна мысль → три лучшие замены → остальное под «Подробнее».
// Замены — это план: гора уменьшается на экране, но в факт и экономию они попадают, когда их подтвердит чек.
import 'dart:math';

import 'package:flutter/material.dart';

import '../core/engine.dart';
import '../core/i18n.dart';
import '../core/insights.dart';
import '../core/models.dart';
import '../core/store.dart';
import '../ui/forms.dart';
import '../ui/kit.dart';
import '../ui/pile_hero.dart';
import '../ui/share_card.dart';
import 'edit.dart';
import 'prices_card.dart';
import 'shell.dart';

class ResultPage extends StatefulWidget {
  final String entryId;
  const ResultPage({super.key, required this.entryId});
  @override
  State<ResultPage> createState() => _ResultPageState();
}

class _ResultPageState extends State<ResultPage> {
  static const _top = 3;
  MetricId _metric = MetricId.sugar;
  bool _more = false, _allSwaps = false, _srcReady = false;
  late HistoryEntry _e;
  late Receipt _r;
  late ResultModel _m;

  void _toggle(int i) {
    final on = {..._e.swaps};
    on.contains(i) ? on.remove(i) : on.add(i);
    store.saveEntry(_e.copyWith(swaps: on.toList()..sort()));
  }

  void _share() => shareResult(
    metric: _metric,
    cubesBy: _m.base.cubesBy,
    totals: _m.base.totals,
    available: _m.available,
    pill: _m.pill,
    tone: _m.tone,
    where: '${_r.store} · ${dateRu(_r.date)}',
    text: _m.shareText,
    level: store.streak.level,
  );

  void _toList() {
    // в список уходят все замены плана, а не только видимые на этой вкладке
    final items = [
      for (final i in _e.swaps)
        if (i < _r.items.length && _r.items[i].swap != null)
          ShopItem(name: _r.items[i].swap!.n, instead: _r.items[i].n),
    ];
    final n = store.addToShop(items);
    showToast(
      n > 0
          ? t('В списке на следующий поход: +{n}', {'n': n})
          : t('Эти замены уже в списке'),
    );
  }

  Future<void> _edit() async {
    final e = _e;
    final nav = Navigator.of(context);
    final r = await editReceipt(
      context,
      receipt: _r,
      off: e.off,
      onDelete: () {
        nav.pop();
        store.removeEntry(e.id);
        showToast(t('Чек удалён'));
      },
    );
    if (r == null) return;
    store.editReceipt(e, r.receipt, r.off);
    showToast(t('Чек исправлен'));
    await store.sendCorrections(r.receipt.store, r.corrections);
  }

  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: store,
    builder: (context, _) {
      final e = store.entry(widget.entryId);
      final r = e == null ? null : receiptOf(e);
      if (e == null || r == null) {
        return const Scaffold(
          body: DecoratedBox(
            decoration: BoxDecoration(gradient: sky),
            child: SizedBox.expand(),
          ),
        );
      }
      _e = e;
      _r = r;
      _m = resultModel(r, e.swaps, metric: _metric, off: e.off, score: e.score);
      return _page(context);
    },
  );

  Widget _page(BuildContext context) {
    final mq = MediaQuery.of(context);
    final a = _m.analysis;
    final demo = isDemo(_e), mine = store.isMine(_e);
    final editable = !demo && !_r.masked && (mine || !store.isChild);
    final rows = swapRows(_r, _metric, _e.off);
    final shown = [
      for (final (k, x) in rows.indexed)
        if (_allSwaps || k < _top || _e.swaps.contains(x.i)) x,
    ];
    final planned = _e.swaps.any((i) => rows.any((x) => x.i == i));
    final unsure = _r.items.where((it) => it.q).length;
    final gap = _r.sum == null || _r.masked
        ? 0
        : (_r.items.fold<num>(0, (n, it) => n + it.p) - _r.sum!).round();
    final who = store.authorOf(_e);

    return Scaffold(
      body: DecoratedBox(
        decoration: const BoxDecoration(gradient: sky),
        child: LayoutBuilder(
          builder: (context, box) => SingleChildScrollView(
            child: Column(
              children: [
                PileHero(
                  height: max(440.0, box.maxHeight * .62),
                  kick: planned
                      ? t('Будет в следующий раз')
                      : t('В твоём чеке'),
                  target: pileCount(a.totals[_metric]!, _metric),
                  maxCubes: min(220, _m.maxCubes),
                  value: _m.available.contains(_metric)
                      ? a.totals[_metric]!
                      : null,
                  metric: _metric,
                  level: store.streak.level,
                  onMetric: (m) => setState(() => _metric = m),
                  bar: Row(
                    children: [
                      BarButton(
                        Icons.arrow_back_ios_new_rounded,
                        t('Назад'),
                        () => Navigator.of(context).pop(),
                      ),
                      Expanded(
                        child: Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 8),
                          child: Center(child: TonePill(_m.tone, _m.pill)),
                        ),
                      ),
                      BarButton(
                        Icons.ios_share_rounded,
                        t('Поделиться результатом'),
                        _share,
                      ),
                    ],
                  ),
                ),
                Sheet(
                  padding: EdgeInsets.fromLTRB(
                    14,
                    24,
                    14,
                    mq.padding.bottom + 24,
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      if (editable && (unsure > 0 || gap != 0))
                        _check(unsure, gap),
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 4),
                        child: Text(
                          conclusion(_r, _m.base, guests: _e.guests),
                          style: disp(21, w: 800, h: 1.2, ls: -.03),
                        ),
                      ),
                      const SizedBox(height: 10),
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 4),
                        child: Text(
                          [
                            _r.store,
                            dateRu(_r.date),
                            if (!_r.masked) money(_m.base.total),
                            if (who.isNotEmpty) t('внесено: {n}', {'n': who}),
                            if (demo) t('пример, в учёт не идёт'),
                            if (_m.base.offCount > 0)
                              t('не считаем: {n}', {'n': _m.base.offCount}),
                          ].join(' · '),
                          style: body(13, color: mute),
                        ),
                      ),
                      if (!_r.refund) ...[
                        const SizedBox(height: 28),
                        SecTitle(t('В следующий раз возьми')),
                        if (rows.isEmpty)
                          _empty(
                            t('Нет замен, которые меняют этот показатель.'),
                          ),
                        for (final x in shown)
                          Padding(
                            padding: const EdgeInsets.only(bottom: 8),
                            child: _swapRow(x),
                          ),
                        if (rows.length > shown.length)
                          FlatBtn(
                            t('Ещё замены: {n}', {
                              'n': rows.length - shown.length,
                            }),
                            white: true,
                            color: blue1,
                            onTap: () => setState(() => _allSwaps = true),
                          ),
                        AnimatedSize(
                          duration: const Duration(milliseconds: 260),
                          curve: Curves.easeOutCubic,
                          alignment: Alignment.topCenter,
                          child: _m.summary == null
                              ? const SizedBox(width: double.infinity)
                              : _summary(),
                        ),
                      ],
                      if (editable) ...[
                        const SizedBox(height: 24),
                        RowBtn(
                          t('Изменить чек'),
                          icon: Icons.edit_rounded,
                          onTap: _edit,
                        ),
                        SwitchRow(
                          t('Для гостей'),
                          hint: t('деньги посчитаем, норму не тронем'),
                          value: _e.guests,
                          onChanged: (v) =>
                              store.saveEntry(_e.copyWith(guests: v)),
                        ),
                        if (mine)
                          SwitchRow(
                            t('Личный чек'),
                            hint: t('семья его не увидит'),
                            value: _e.priv,
                            onChanged: (v) =>
                                store.saveEntry(_e.copyWith(priv: v)),
                          ),
                      ],
                      const SizedBox(height: 16),
                      Press(
                        scale: .98,
                        onTap: () {
                          setState(() => _more = !_more);
                          Future.delayed(
                            const Duration(milliseconds: 60),
                            () => mounted
                                ? setState(() => _srcReady = true)
                                : null,
                          );
                        },
                        child: Container(
                          height: 50,
                          decoration: BoxDecoration(
                            color: tint,
                            borderRadius: BorderRadius.circular(17),
                          ),
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Text(
                                t('Подробнее'),
                                style: body(15, w: 800, color: blue1),
                              ),
                              Icon(
                                _more
                                    ? Icons.expand_less_rounded
                                    : Icons.expand_more_rounded,
                                color: blue1,
                              ),
                            ],
                          ),
                        ),
                      ),
                      if (_more) ..._details(),
                      const SizedBox(height: 24),
                      Press(
                        onTap: () => openCamera(context),
                        child: Container(
                          height: 62,
                          decoration: BoxDecoration(
                            gradient: sky,
                            borderRadius: BorderRadius.circular(20),
                          ),
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              const Icon(
                                Icons.photo_camera_rounded,
                                color: Colors.white,
                              ),
                              const SizedBox(width: 10),
                              Flexible(
                                child: FittedBox(
                                  fit: BoxFit.scaleDown,
                                  child: Text(
                                    t('Внести ещё чек'),
                                    style: disp(
                                      16,
                                      w: 700,
                                      color: Colors.white,
                                      ls: -.01,
                                    ),
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                      const SizedBox(height: 8),
                      FlatBtn(
                        t('Поделиться'),
                        icon: Icons.ios_share_rounded,
                        color: blue1,
                        height: 56,
                        onTap: _share,
                      ),
                      const SizedBox(height: 18),
                      Text(
                        '${_more ? '${t(unitsNote)} ' : ''}${t('Оценка примерная и не заменяет консультацию врача.')}',
                        textAlign: TextAlign.center,
                        style: body(12, color: mute, h: 1.5),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _check(int unsure, int gap) => Padding(
    padding: const EdgeInsets.only(bottom: 18),
    child: Press(
      scale: .985,
      onTap: _edit,
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: mid.withValues(alpha: .16),
          borderRadius: BorderRadius.circular(18),
        ),
        child: Row(
          children: [
            Expanded(
              child: Text(
                [
                  if (unsure > 0)
                    t('Проверь {n} {w}: прочитались плохо.', {
                      'n': unsure,
                      'w': pl(unsure, positionsF),
                    }),
                  if (gap < 0)
                    t('Не хватает {n} до суммы на чеке.', {'n': money(-gap)}),
                  if (gap > 0)
                    t('На {n} больше суммы на чеке.', {'n': money(gap)}),
                ].join(' '),
                style: body(14, w: 700),
              ),
            ),
            const SizedBox(width: 10),
            Text(t('Проверить'), style: body(14, w: 800, color: blue1)),
          ],
        ),
      ),
    ),
  );

  Widget _summary() => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      Container(
        margin: const EdgeInsets.only(top: 4),
        padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
        decoration: BoxDecoration(
          color: good.withValues(alpha: .12),
          borderRadius: BorderRadius.circular(18),
        ),
        child: Row(
          children: [
            const Icon(Icons.check_rounded, color: good, size: 22),
            const SizedBox(width: 10),
            Expanded(
              child: Text.rich(
                TextSpan(
                  children: [
                    TextSpan(text: '${t('В плане')}: '),
                    TextSpan(text: _m.summary!.points, style: body(15, w: 800)),
                    if (_m.summary!.label.isNotEmpty)
                      TextSpan(text: ', ${_m.summary!.label}'),
                    if (_m.summary!.money.isNotEmpty)
                      TextSpan(
                        text: ' ${_m.summary!.money}',
                        style: body(15, w: 800),
                      ),
                    TextSpan(text: '. ${t('Засчитаем, когда купишь.')}'),
                  ],
                ),
                style: body(15),
              ),
            ),
          ],
        ),
      ),
      const SizedBox(height: 8),
      FlatBtn(
        t('В список на следующий поход'),
        primary: true,
        icon: Icons.playlist_add_check_rounded,
        height: 54,
        onTap: _toList,
      ),
    ],
  );

  List<Widget> _details() {
    final mdef = metrics[_metric]!;
    final a = _m.base;
    final eq = equivalents(a.totals[_metric]!, _metric);
    return [
      if (eq.isNotEmpty) ...[
        const SizedBox(height: 26),
        SecTitle(t('Это как…')),
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            for (final (i, e) in eq.indexed) ...[
              if (i > 0) const SizedBox(width: 8),
              Expanded(child: _equiv(e)),
            ],
          ],
        ),
      ],
      const SizedBox(height: 28),
      SecTitle('${t('Откуда')}: ${t(mdef.label).toLowerCase()}'),
      if (_m.sources.isEmpty)
        _empty(t('Нет данных об этом показателе.'))
      else
        for (final s in _m.sources) _source(s),
      if (!_r.masked) ...[
        const SizedBox(height: 22),
        SecTitle(
          isHarmfulMetric(_metric) ? t('Цена вреда') : t('Сколько это стоит'),
        ),
        if (_m.harm.total == 0)
          _empty(t('Таких позиций в чеке нет.'))
        else
          _harm(_m.harm, mdef),
        const SizedBox(height: 22),
        SecTitle(t('На вредное')),
        Tile(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Expanded(
                    child: FittedBox(
                      fit: BoxFit.scaleDown,
                      alignment: Alignment.centerLeft,
                      child: Text(_m.junkSum, style: disp(34, ls: -.05)),
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 12,
                      vertical: 6,
                    ),
                    decoration: BoxDecoration(
                      color: toneColor(_m.junkTone).withValues(alpha: .16),
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: Text(_m.junkShare, style: body(13, w: 800)),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              _meter(a.share, toneColor(_m.junkTone)),
              const SizedBox(height: 10),
              Text(_m.junkOf, style: body(14, color: mute)),
              const SizedBox(height: 10),
              Row(
                children: [
                  const Icon(
                    Icons.calendar_month_rounded,
                    color: blue1,
                    size: 20,
                  ),
                  const SizedBox(width: 8),
                  Expanded(child: Text(_m.junkDays, style: body(14, w: 700))),
                ],
              ),
            ],
          ),
        ),
        if (_m.flagged.isNotEmpty) ...[
          const SizedBox(height: 22),
          SecTitle(t('Алкоголь и энергетики')),
          _flagged(_m, a),
        ],
        const SizedBox(height: 22),
        SecTitle(t('Где дешевле')),
        PricesCard(key: ValueKey(_r.id), receipt: _r),
      ],
    ];
  }

  Widget _harm(HarmPrice h, MetricDef mdef) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Padding(
        padding: const EdgeInsets.symmetric(horizontal: 4),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(money(h.perUnit), style: disp(34, ls: -.04)),
            Text(
              isCubeMetric(mdef.id)
                  ? t('за кубик сахара')
                  : mdef.id == MetricId.kcal
                  ? t('за 100 ккал')
                  : t('за грамм'),
              style: body(15, color: mute),
            ),
            const SizedBox(height: 8),
            Text(
              t('На эти покупки ушло {m}, в них {x}.', {
                'm': money(h.spend),
                'x': metricTxt(h.total, mdef.id),
              }),
              style: body(14, color: mute, h: 1.4),
            ),
          ],
        ),
      ),
      const SizedBox(height: 12),
      for (final x in h.top)
        Container(
          margin: const EdgeInsets.only(bottom: 6),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          decoration: BoxDecoration(
            color: tint,
            borderRadius: BorderRadius.circular(16),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.baseline,
            textBaseline: TextBaseline.alphabetic,
            children: [
              Expanded(child: Text(x.name, style: body(14, h: 1.3))),
              const SizedBox(width: 12),
              Text(money(x.price), style: disp(14, w: 800, ls: -.02)),
              const SizedBox(width: 6),
              Text(
                isCubeMetric(mdef.id)
                    ? '${bigNum(x.value, mdef.id)} ${t('куб.')}'
                    : amountTxt(x.value, mdef.id),
                style: body(13, w: 700, color: mute),
              ),
            ],
          ),
        ),
    ],
  );

  Widget _flagged(ResultModel m, Analysis a) {
    final share = a.food > 0 ? (a.flaggedSum / a.food * 100).round() : 0;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: bad.withValues(alpha: .08),
        borderRadius: BorderRadius.circular(24),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Expanded(
                child: Text(money(a.flaggedSum), style: disp(30, ls: -.04)),
              ),
              Text(
                t('{n}% еды', {'n': share}),
                style: disp(15, w: 800, color: bad, ls: 0),
              ),
            ],
          ),
          const SizedBox(height: 10),
          for (final l in m.flagged)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Row(
                children: [
                  Expanded(child: Text(l.name, style: body(14, h: 1.35))),
                  Text(money(l.price), style: disp(14, w: 800, ls: -.02)),
                ],
              ),
            ),
        ],
      ),
    );
  }

  Widget _empty(String text) => Container(
    padding: const EdgeInsets.all(16),
    decoration: BoxDecoration(
      color: tint,
      borderRadius: BorderRadius.circular(20),
    ),
    child: Text(text, style: body(15, color: mute)),
  );

  Widget _meter(double v, Color color) => ClipRRect(
    borderRadius: BorderRadius.circular(8),
    child: Container(
      height: 14,
      color: Colors.white,
      alignment: Alignment.centerLeft,
      child: AnimatedFractionallySizedBox(
        duration: const Duration(milliseconds: 600),
        curve: Curves.easeOutCubic,
        widthFactor: v.clamp(0.0, 1.0),
        child: Container(
          decoration: BoxDecoration(
            color: color,
            borderRadius: BorderRadius.circular(8),
          ),
        ),
      ),
    ),
  );

  Widget _swapRow(SwapRow r) {
    final on = _e.swaps.contains(r.i);
    return Semantics(
      toggled: on,
      child: Press(
        scale: .98,
        onTap: () => _toggle(r.i),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 200),
          padding: const EdgeInsets.fromLTRB(12, 12, 14, 12),
          decoration: BoxDecoration(
            color: on ? good.withValues(alpha: .1) : tint,
            borderRadius: BorderRadius.circular(22),
            border: Border.all(color: on ? good : Colors.transparent, width: 2),
          ),
          child: Row(
            children: [
              AnimatedContainer(
                duration: const Duration(milliseconds: 200),
                width: 30,
                height: 30,
                decoration: BoxDecoration(
                  color: on ? good : Colors.white,
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: on ? good : line, width: 2),
                ),
                child: on
                    ? const Icon(
                        Icons.check_rounded,
                        color: Colors.white,
                        size: 20,
                      )
                    : null,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      r.from,
                      style: body(14, color: mute).copyWith(
                        decoration: on ? TextDecoration.lineThrough : null,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Padding(
                          padding: EdgeInsets.only(top: 2),
                          child: Icon(
                            Icons.arrow_forward_rounded,
                            size: 17,
                            color: good,
                          ),
                        ),
                        const SizedBox(width: 5),
                        Expanded(
                          child: Text(r.to, style: body(15, w: 800, h: 1.3)),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 10),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(r.cubes, style: disp(14, w: 800, ls: -.02, h: 1.3)),
                  Text(
                    r.price,
                    style: body(
                      13,
                      w: 700,
                      color: r.price.startsWith('+') ? bad : good,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _equiv(Equivalent e) => Container(
    padding: const EdgeInsets.fromLTRB(12, 14, 10, 14),
    decoration: BoxDecoration(
      color: tint,
      borderRadius: BorderRadius.circular(22),
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 36,
          height: 36,
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(12),
          ),
          child: Icon(
            switch (e.icon) {
              'can' => Icons.local_drink_rounded,
              'day' => Icons.calendar_month_rounded,
              'chips' => Icons.fastfood_rounded,
              'butter' => Icons.bakery_dining_rounded,
              'burger' => Icons.lunch_dining_rounded,
              'run' => Icons.directions_run_rounded,
              'choc' => Icons.cookie_rounded,
              'walk' => Icons.directions_walk_rounded,
              _ => Icons.soup_kitchen_rounded,
            },
            color: blue1,
            size: 21,
          ),
        ),
        const SizedBox(height: 10),
        FittedBox(
          fit: BoxFit.scaleDown,
          alignment: Alignment.centerLeft,
          child: Text(e.value, style: disp(24, ls: -.05)),
        ),
        const SizedBox(height: 4),
        Text(e.label, style: body(12, w: 700, color: mute, h: 1.25)),
      ],
    ),
  );

  Widget _source(SourceRow s) => Padding(
    padding: const EdgeInsets.only(bottom: 14),
    child: AnimatedOpacity(
      duration: const Duration(milliseconds: 200),
      opacity: s.swapped ? .5 : 1,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Expanded(
                child: Text(
                  s.weeks > 1
                      ? '${s.name} · ${t('запас на {n} нед.', {'n': s.weeks})}'
                      : s.name,
                  style: body(15, w: 700).copyWith(
                    decoration: s.swapped ? TextDecoration.lineThrough : null,
                  ),
                ),
              ),
              const SizedBox(width: 10),
              Text(s.amount, style: disp(14, w: 800, ls: -.02)),
              const SizedBox(width: 6),
              Text(s.cubes, style: body(13, w: 700, color: mute)),
            ],
          ),
          const SizedBox(height: 6),
          ClipRRect(
            borderRadius: BorderRadius.circular(6),
            child: Container(
              height: 12,
              color: tint,
              alignment: Alignment.centerLeft,
              child: AnimatedFractionallySizedBox(
                duration: const Duration(milliseconds: 700),
                curve: Curves.easeOutCubic,
                widthFactor: _srcReady ? s.width / 100 : 0.0,
                child: CustomPaint(
                  painter: _Cells(s.cells, s.swapped ? mute : blue1),
                  child: const SizedBox.expand(),
                ),
              ),
            ),
          ),
          if (s.swapped)
            Padding(
              padding: const EdgeInsets.only(top: 5),
              child: Row(
                children: [
                  const Icon(
                    Icons.arrow_forward_rounded,
                    size: 16,
                    color: good,
                  ),
                  const SizedBox(width: 5),
                  Expanded(
                    child: Text(s.swapTo, style: body(13, w: 700, color: good)),
                  ),
                ],
              ),
            ),
        ],
      ),
    ),
  );
}

/// Полоса из клеточек: одна клеточка — один кубик.
class _Cells extends CustomPainter {
  final int n;
  final Color color;
  _Cells(this.n, this.color);
  @override
  void paint(Canvas c, Size s) {
    c.drawRRect(
      RRect.fromRectAndRadius(Offset.zero & s, const Radius.circular(6)),
      Paint()..color = color,
    );
    if (n < 2 || s.width / n < 4) return;
    final gap = Paint()
      ..color = Colors.white.withValues(alpha: .55)
      ..strokeWidth = 1.5;
    for (var i = 1; i < n; i++) {
      final x = s.width * i / n;
      c.drawLine(Offset(x, 0), Offset(x, s.height), gap);
    }
  }

  @override
  bool shouldRepaint(_Cells old) => old.n != n || old.color != color;
}

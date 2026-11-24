// Экран результата в стиле «Гора сахара»: цифра, куча кубиков, замены, источники, «вредное».
import 'dart:math';

import 'package:flutter/material.dart';

import '../core/engine.dart';
import '../core/insights.dart';
import '../core/models.dart';
import '../core/store.dart';
import '../ui/kit.dart';
import '../ui/pile_hero.dart';
import '../ui/share_card.dart';
import 'prices_card.dart';
import 'shell.dart';

class ResultPage extends StatefulWidget {
  final Receipt receipt;
  final String entryId;
  final List<int> swaps;
  const ResultPage({
    super.key,
    required this.receipt,
    required this.entryId,
    required this.swaps,
  });
  @override
  State<ResultPage> createState() => _ResultPageState();
}

class _ResultPageState extends State<ResultPage> {
  late Set<int> _on = widget.swaps.toSet();
  MetricId _metric = MetricId.sugar;
  late ResultModel _m = resultModel(widget.receipt, _on, _metric);
  List<SwapRow> get _rows => swapRows(widget.receipt, _metric);
  int get _maxCubes => resultModel(widget.receipt, const [], _metric).maxCubes;
  bool _srcReady = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _saveEntry());
    Future.delayed(
      const Duration(milliseconds: 800),
      () => mounted ? setState(() => _srcReady = true) : null,
    );
  }

  void _saveEntry() {
    final r = widget.receipt, a = _m.analysis;
    store.saveEntry(
      HistoryEntry(
        id: widget.entryId,
        receiptId: r.id,
        store: r.store,
        date: r.date,
        cubes: a.cubes,
        score: a.score,
        swaps: _m.swaps,
        savedAt: DateTime.now().millisecondsSinceEpoch,
        receipt: demoById(r.id) == null ? r : null,
      ),
    );
  }

  void _toggle(int i) {
    setState(() {
      _on = {..._on};
      _on.contains(i) ? _on.remove(i) : _on.add(i);
      _m = resultModel(widget.receipt, _on, _metric);
    });
    _saveEntry();
  }

  void _setMetric(MetricId m) => setState(() {
    _metric = m;
    _m = resultModel(widget.receipt, _on, m);
  });

  void _share() {
    final a = _m.analysis;
    shareResult(
      metric: _metric,
      cubesBy: a.cubesBy,
      totals: a.totals,
      available: {
        for (final metric in metricIds)
          if (a.items.any((item) => hasMetricData(item.active, metric))) metric,
      },
      score: a.score,
      where: '${widget.receipt.store} · ${dateRu(widget.receipt.date)}',
      text: _m.shareText,
    );
  }

  void _toList() {
    // в список уходят все включённые замены, а не только видимые на этой вкладке
    final items = [
      for (final i in _on.toList()..sort())
        if (widget.receipt.items[i].swap != null)
          ShopItem(
            name: widget.receipt.items[i].swap!.n,
            instead: widget.receipt.items[i].n,
          ),
    ];
    final n = store.addToShop(items);
    showToast(
      n > 0 ? 'В списке на следующий поход: +$n' : 'Эти замены уже в списке',
    );
  }

  @override
  Widget build(BuildContext context) {
    final mq = MediaQuery.of(context);
    final a = _m.analysis;
    final eq = equivalents(a.totals[_metric]!, _metric);
    final mdef = metrics[_metric]!;

    return Scaffold(
      body: DecoratedBox(
        decoration: const BoxDecoration(gradient: sky),
        child: LayoutBuilder(
          builder: (context, box) => SingleChildScrollView(
            child: Column(
              children: [
                PileHero(
                  height: max(440.0, box.maxHeight * .62),
                  kick: 'В твоём чеке',
                  target: pileCount(a.totals[_metric]!, _metric),
                  maxCubes: min(220, _maxCubes),
                  value:
                      a.items.any((item) => hasMetricData(item.active, _metric))
                      ? a.totals[_metric]!
                      : null,
                  metric: _metric,
                  onMetric: _setMetric,
                  bar: Row(
                    children: [
                      BarButton(
                        Icons.arrow_back_ios_new_rounded,
                        'Назад',
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
                        'Поделиться результатом',
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
                      if (widget.receipt.approx) ...[
                        Container(
                          padding: const EdgeInsets.all(14),
                          margin: const EdgeInsets.only(bottom: 22),
                          decoration: BoxDecoration(
                            color: mid.withValues(alpha: .14),
                            borderRadius: BorderRadius.circular(20),
                          ),
                          child: Text(
                            'Чек распознан по фото: состав и замены оценены приблизительно, по типичным товарам.',
                            style: body(14),
                          ),
                        ),
                      ],
                      // ── замены ──
                      SecTitle(
                        isCubeMetric(_metric)
                            ? 'Замени — и кубики исчезнут'
                            : 'Что изменится с заменой',
                      ),
                      if (_rows.isEmpty)
                        _empty('Нет замен, которые меняют этот показатель.')
                      else
                        for (final r in _rows)
                          Padding(
                            padding: const EdgeInsets.only(bottom: 8),
                            child: _swapRow(r),
                          ),
                      AnimatedSize(
                        duration: const Duration(milliseconds: 260),
                        curve: Curves.easeOutCubic,
                        alignment: Alignment.topCenter,
                        child: _m.summary == null
                            ? const SizedBox(width: double.infinity)
                            : Column(
                                crossAxisAlignment: CrossAxisAlignment.stretch,
                                children: [
                                  Container(
                                    margin: const EdgeInsets.only(top: 4),
                                    padding: const EdgeInsets.fromLTRB(
                                      14,
                                      12,
                                      14,
                                      12,
                                    ),
                                    decoration: BoxDecoration(
                                      color: good.withValues(alpha: .12),
                                      borderRadius: BorderRadius.circular(18),
                                    ),
                                    child: Row(
                                      children: [
                                        const Icon(
                                          Icons.check_rounded,
                                          color: good,
                                          size: 22,
                                        ),
                                        const SizedBox(width: 10),
                                        Expanded(
                                          child: Text.rich(
                                            TextSpan(
                                              children: [
                                                const TextSpan(
                                                  text: 'С заменами: ',
                                                ),
                                                TextSpan(
                                                  text: _m.summary!.points,
                                                  style: body(15, w: 800),
                                                ),
                                                TextSpan(
                                                  text:
                                                      ', ${_m.summary!.label} ',
                                                ),
                                                TextSpan(
                                                  text: _m.summary!.money,
                                                  style: body(15, w: 800),
                                                ),
                                              ],
                                            ),
                                            style: body(15),
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                  const SizedBox(height: 8),
                                  Press(
                                    onTap: _toList,
                                    child: Container(
                                      height: 54,
                                      decoration: BoxDecoration(
                                        color: blue1,
                                        borderRadius: BorderRadius.circular(18),
                                      ),
                                      child: Row(
                                        mainAxisAlignment:
                                            MainAxisAlignment.center,
                                        children: [
                                          const Icon(
                                            Icons.playlist_add_check_rounded,
                                            color: Colors.white,
                                            size: 24,
                                          ),
                                          const SizedBox(width: 10),
                                          Flexible(
                                            child: FittedBox(
                                              fit: BoxFit.scaleDown,
                                              child: Text(
                                                'В список на следующий поход',
                                                style: disp(
                                                  14,
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
                                ],
                              ),
                      ),
                      // ── это как… ──
                      if (eq.isNotEmpty) ...[
                        const SizedBox(height: 30),
                        const SecTitle('Это как…'),
                        AnimatedSwitcher(
                          duration: const Duration(milliseconds: 220),
                          child: Row(
                            key: ValueKey(
                              '${_metric.name}${a.totals[_metric]}',
                            ),
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              for (final (i, e) in eq.indexed) ...[
                                if (i > 0) const SizedBox(width: 8),
                                Expanded(child: _equiv(e)),
                              ],
                            ],
                          ),
                        ),
                      ],
                      // ── источники ──
                      const SizedBox(height: 30),
                      SecTitle('Откуда ${mdef.label.toLowerCase()}'),
                      if (_m.sources.isEmpty)
                        _empty('Нет данных об этом показателе.')
                      else
                        for (final s in _m.sources) _source(s),
                      // ── вредное ──
                      // ── цена вреда ──
                      const SizedBox(height: 22),
                      SecTitle(
                        isHarmfulMetric(_metric)
                            ? 'Цена вреда'
                            : 'Сколько это стоит',
                      ),
                      if (_m.harm.total == 0)
                        _empty('Нет позиций с учтённым количеством ${mdef.of}.')
                      else
                        _harm(_m.harm, mdef),
                      const SizedBox(height: 22),
                      const SecTitle('На вредное'),
                      Container(
                        padding: const EdgeInsets.all(16),
                        decoration: BoxDecoration(
                          color: tint,
                          borderRadius: BorderRadius.circular(24),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              crossAxisAlignment: CrossAxisAlignment.end,
                              children: [
                                Expanded(
                                  child: Text(
                                    _m.junkSum,
                                    style: disp(34, ls: -.05),
                                  ),
                                ),
                                Container(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 12,
                                    vertical: 6,
                                  ),
                                  decoration: BoxDecoration(
                                    color: toneColor(
                                      _m.junkTone,
                                    ).withValues(alpha: .16),
                                    borderRadius: BorderRadius.circular(14),
                                  ),
                                  child: Text(
                                    _m.junkShare,
                                    style: body(13, w: 800),
                                  ),
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
                                Expanded(
                                  child: Text(
                                    _m.junkDays,
                                    style: body(14, w: 700),
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                      if (_m.flagged.isNotEmpty) ...[
                        const SizedBox(height: 22),
                        const SecTitle('Алкоголь и энергетики'),
                        _flagged(_m, a),
                      ],
                      // ── где дешевле ──
                      const SizedBox(height: 22),
                      const SecTitle('Где дешевле'),
                      PricesCard(receipt: widget.receipt),
                      const SizedBox(height: 26),
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
                                    'Сканировать новый чек',
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
                      Press(
                        onTap: _share,
                        child: Container(
                          height: 56,
                          decoration: BoxDecoration(
                            color: tint,
                            borderRadius: BorderRadius.circular(18),
                          ),
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              const Icon(
                                Icons.ios_share_rounded,
                                color: blue1,
                                size: 22,
                              ),
                              const SizedBox(width: 10),
                              Text(
                                'Поделиться',
                                style: disp(15, w: 700, color: blue1, ls: -.01),
                              ),
                            ],
                          ),
                        ),
                      ),
                      const SizedBox(height: 18),
                      Text(
                        '$unitsNote Оценка примерная и не заменяет консультацию врача.',
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
              'за ${isCubeMetric(mdef.id)
                  ? 'кубик'
                  : mdef.id == MetricId.kcal
                  ? '100 ккал'
                  : mdef.unit}${mdef.id == MetricId.kcal ? '' : ' ${mdef.of}'}',
              style: body(15, color: mute),
            ),
            const SizedBox(height: 8),
            Text(
              'На эти покупки ушло ${money(h.spend)}, в них ${metricTxt(h.total, mdef.id)}.',
              style: body(14, color: mute, h: 1.4),
            ),
          ],
        ),
      ),
      const SizedBox(height: 12),
      for (final t in h.top)
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
              Expanded(child: Text(t.name, style: body(14, h: 1.3))),
              const SizedBox(width: 12),
              Text(money(t.price), style: disp(14, w: 800, ls: -.02)),
              const SizedBox(width: 6),
              Text(
                metricTxt(t.value, mdef.id),
                style: body(13, w: 700, color: mute),
              ),
            ],
          ),
        ),
    ],
  );

  Widget _flagged(ResultModel m, Analysis a) {
    final share = a.total > 0 ? (a.flaggedSum / a.total * 100).round() : 0;
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
              Text('$share% чека', style: disp(15, w: 800, color: bad, ls: 0)),
            ],
          ),
          const SizedBox(height: 10),
          for (final l in m.flagged)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      '${l.kind == 'alcohol' ? 'Алкоголь' : 'Энергетик'} · ${l.name}'
                          .replaceFirst(
                            RegExp(r'^Энергетик · (?=Энергетик)'),
                            '',
                          ),
                      style: body(14, h: 1.35),
                    ),
                  ),
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
    final on = _on.contains(r.i);
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
      opacity: s.off ? .5 : 1,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Expanded(
                child: Text(
                  s.name,
                  style: body(15, w: 700).copyWith(
                    decoration: s.off ? TextDecoration.lineThrough : null,
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
                  painter: _Cells(s.cells, s.off ? mute : blue1),
                  child: const SizedBox.expand(),
                ),
              ),
            ),
          ),
          if (s.off)
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

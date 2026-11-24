// «Продукты»: справочник «Что внутри» с поиском, разделами, выбором показателя и проверкой по штрихкоду.
import 'dart:math';

import 'package:flutter/material.dart';

import '../core/catalog.dart';
import '../core/engine.dart';
import '../core/models.dart';
import '../ui/kit.dart';
import 'shell.dart';

/// столько клеточек-кубиков рисуем в строке, остальное — «+N»
const _strip = 24;

class CatalogScreen extends StatefulWidget {
  const CatalogScreen({super.key});
  @override
  State<CatalogScreen> createState() => _CatalogScreenState();
}

class _CatalogScreenState extends State<CatalogScreen> {
  final _q = TextEditingController();
  String _cat = 'all';
  MetricId _metric = MetricId.sugar;
  String? _open;

  @override
  void dispose() {
    _q.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final mq = MediaQuery.of(context);
    final items = searchCatalog(_q.text, _cat, _metric);
    final mdef = metrics[_metric]!;
    final h1 = disp(
      (mq.size.width.clamp(0, 430) * .094).clamp(30.0, 38.0),
      color: Colors.white,
      h: .98,
      ls: -.045,
    );

    return LayoutBuilder(
      builder: (context, box) => SingleChildScrollView(
        keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
        child: Builder(
          builder: (context) => SizedBox(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Padding(
                  padding: EdgeInsets.fromLTRB(20, mq.padding.top + 16, 20, 0),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Rise(child: Text('Что внутри', style: h1)),
                      Rise(
                        delay: 60,
                        child: FittedBox(
                          fit: BoxFit.scaleDown,
                          alignment: Alignment.centerLeft,
                          child: Row(children: [Hl('продуктов', h1)]),
                        ),
                      ),
                      const SizedBox(height: 18),
                      Rise(
                        delay: 120,
                        child: Row(
                          children: [
                            Expanded(
                              child: Container(
                                height: 56,
                                padding: const EdgeInsets.only(
                                  left: 16,
                                  right: 4,
                                ),
                                decoration: BoxDecoration(
                                  color: Colors.white,
                                  borderRadius: BorderRadius.circular(20),
                                  boxShadow: [
                                    BoxShadow(
                                      color: ink.withValues(alpha: .5),
                                      blurRadius: 30,
                                      offset: const Offset(0, 14),
                                      spreadRadius: -12,
                                    ),
                                  ],
                                ),
                                child: Row(
                                  children: [
                                    const Icon(
                                      Icons.search_rounded,
                                      color: blue1,
                                      size: 24,
                                    ),
                                    const SizedBox(width: 10),
                                    Expanded(
                                      child: TextField(
                                        controller: _q,
                                        onChanged: (_) =>
                                            setState(() => _open = null),
                                        textInputAction: TextInputAction.search,
                                        style: body(17),
                                        cursorColor: blue1,
                                        decoration: InputDecoration(
                                          border: InputBorder.none,
                                          isCollapsed: true,
                                          hintText: 'Кола, йогурт, печенье…',
                                          hintStyle: body(17, color: mute),
                                        ),
                                      ),
                                    ),
                                    if (_q.text.isNotEmpty)
                                      IconButton(
                                        tooltip: 'Очистить поиск',
                                        onPressed: () =>
                                            setState(() => _q.clear()),
                                        icon: const Icon(
                                          Icons.close_rounded,
                                          color: mute,
                                          size: 20,
                                        ),
                                      ),
                                  ],
                                ),
                              ),
                            ),
                            const SizedBox(width: 8),
                            Press(
                              scale: .92,
                              label: 'Проверить товар по штрихкоду',
                              onTap: () => openBarcode(context),
                              child: Container(
                                width: 56,
                                height: 56,
                                decoration: BoxDecoration(
                                  color: Colors.white,
                                  borderRadius: BorderRadius.circular(20),
                                  boxShadow: [
                                    BoxShadow(
                                      color: ink.withValues(alpha: .5),
                                      blurRadius: 30,
                                      offset: const Offset(0, 14),
                                      spreadRadius: -12,
                                    ),
                                  ],
                                ),
                                child: const Icon(
                                  Icons.qr_code_scanner_rounded,
                                  color: blue1,
                                  size: 26,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 14),
                Rise(
                  delay: 170,
                  child: SizedBox(
                    height: 44,
                    child: ListView.separated(
                      scrollDirection: Axis.horizontal,
                      padding: const EdgeInsets.symmetric(horizontal: 20),
                      itemCount: cats.length,
                      separatorBuilder: (_, __) => const SizedBox(width: 8),
                      itemBuilder: (_, i) {
                        final (id, label) = cats[i];
                        final on = id == _cat;
                        return Press(
                          scale: .94,
                          onTap: () => setState(() {
                            _cat = id;
                            _open = null;
                          }),
                          child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 16),
                            alignment: Alignment.center,
                            decoration: BoxDecoration(
                              color: on
                                  ? Colors.white
                                  : Colors.white.withValues(alpha: .16),
                              borderRadius: BorderRadius.circular(22),
                              border: Border.all(
                                color: Colors.white.withValues(
                                  alpha: on ? 1 : .45,
                                ),
                                width: 1.5,
                              ),
                            ),
                            child: Text(
                              label,
                              style: body(
                                14,
                                w: 800,
                                color: on ? blue1 : Colors.white,
                              ),
                            ),
                          ),
                        );
                      },
                    ),
                  ),
                ),
                const SizedBox(height: 12),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 20),
                  child: MetricTabs(
                    value: _metric,
                    onChange: (m) => setState(() {
                      _metric = m;
                      _open = null;
                    }),
                  ),
                ),
                const SizedBox(height: 20),
                ConstrainedBox(
                  constraints: BoxConstraints(
                    minHeight: max(0.0, box.maxHeight - mq.padding.top - 250),
                  ),
                  child: Sheet(
                    padding: EdgeInsets.fromLTRB(
                      12,
                      20,
                      12,
                      tabBarSpace(context) + 16,
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Padding(
                          padding: const EdgeInsets.fromLTRB(8, 0, 8, 10),
                          child: Text(
                            '${items.length} ${pl(items.length, productsF)} · ${const {MetricId.sugar: 'сначала самые сладкие', MetricId.salt: 'сначала самые солёные', MetricId.fat: 'сначала самые жирные', MetricId.kcal: 'сначала самые калорийные', MetricId.carbs: 'сначала больше углеводов', MetricId.protein: 'сначала больше белка'}[_metric]}',
                            style: body(13, w: 700, color: mute),
                          ),
                        ),
                        if (items.isEmpty)
                          Container(
                            padding: const EdgeInsets.all(20),
                            decoration: BoxDecoration(
                              color: tint,
                              borderRadius: BorderRadius.circular(24),
                            ),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  'Такого пока нет',
                                  style: disp(20, h: 1.2, ls: -.03),
                                ),
                                const SizedBox(height: 6),
                                Text(
                                  'Попробуй короче: «сок», «йогурт», «шоколад». Или проверь товар по штрихкоду.',
                                  style: body(15, color: mute),
                                ),
                              ],
                            ),
                          )
                        else
                          for (final it in items) _row(it),
                        const SizedBox(height: 12),
                        Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 8),
                          child: Text(
                            'Значения примерные, по типичным товарам в магазинах. ${unitNote(_metric)}. Норма: ${mdef.norm}.',
                            style: body(12, color: mute, h: 1.5),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _row(CatalogItem it) {
    final val = it.valueOf(_metric), mdef = metrics[_metric]!;
    final cubes = cubesOfValue(val, _metric), open = _open == it.id;
    final cells = min(cubes, _strip);
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Press(
        scale: .985,
        onTap: () => setState(() => _open = open ? null : it.id),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 200),
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
          decoration: BoxDecoration(
            color: open ? tintHi : tint,
            borderRadius: BorderRadius.circular(22),
          ),
          child: AnimatedSize(
            duration: const Duration(milliseconds: 240),
            curve: Curves.easeOutCubic,
            alignment: Alignment.topCenter,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            it.name,
                            style: disp(16, w: 700, ls: -.02, h: 1.25),
                          ),
                          Text(it.portion, style: body(13, color: mute)),
                        ],
                      ),
                    ),
                    const SizedBox(width: 12),
                    if (val > 0 && (!isCubeMetric(_metric) || cubes > 0))
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          Text(bigNum(val, _metric), style: disp(26, ls: -.05)),
                          Text(
                            bigCap(val, _metric),
                            style: body(12, w: 700, color: mute, h: 1.2),
                          ),
                        ],
                      )
                    else
                      Container(
                        height: 32,
                        padding: const EdgeInsets.symmetric(horizontal: 12),
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(16),
                        ),
                        child: Row(
                          children: [
                            const ToneDot(Tone.good),
                            const SizedBox(width: 8),
                            Text(
                              val > 0 ? 'почти нет' : 'без ${mdef.of}',
                              style: body(13, w: 800, color: good),
                            ),
                          ],
                        ),
                      ),
                  ],
                ),
                if (isCubeMetric(_metric) && cubes > 0) ...[
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 3,
                    runSpacing: 3,
                    crossAxisAlignment: WrapCrossAlignment.center,
                    children: [
                      for (var i = 0; i < cells; i++)
                        Container(
                          width: 11,
                          height: 11,
                          decoration: BoxDecoration(
                            color: Color(mdef.color),
                            borderRadius: BorderRadius.circular(3),
                            border: const Border(
                              right: BorderSide(
                                color: Color(0xFF0E2BB8),
                                width: 1.5,
                              ),
                              bottom: BorderSide(
                                color: Color(0xFF0E2BB8),
                                width: 1.5,
                              ),
                            ),
                          ),
                        ),
                      if (cubes > cells)
                        Padding(
                          padding: const EdgeInsets.only(left: 3),
                          child: Text(
                            '+${cubes - cells}',
                            style: body(12, w: 800, color: blue1, h: 1),
                          ),
                        ),
                    ],
                  ),
                ],
                if (open) ...[
                  const SizedBox(height: 12),
                  Text(
                    val > 0
                        ? 'В порции около ${amountTxt(val, _metric)} ${_metric == MetricId.sugar ? 'добавленного сахара' : mdef.of} — это ${(val / mdef.adult * 100).round()}% дневной нормы взрослого.'
                        : '${_metric == MetricId.sugar ? 'Добавленного сахара' : mdef.label} здесь нет. Можно не считать.',
                    style: body(15),
                  ),
                  if (it.swap != null)
                    Container(
                      margin: const EdgeInsets.only(top: 8),
                      padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(16),
                      ),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Padding(
                            padding: EdgeInsets.only(top: 1),
                            child: Icon(
                              Icons.arrow_forward_rounded,
                              color: good,
                              size: 20,
                            ),
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              'Лучше взять: ${it.swap}',
                              style: body(15, w: 700, color: good),
                            ),
                          ),
                        ],
                      ),
                    ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}

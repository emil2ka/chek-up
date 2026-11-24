// Правка чека и ручной ввод: строки, «не для нас», не еда, запас на недели, магазин, дата, возврат.
import 'package:flutter/material.dart';

import '../core/calendar.dart';
import '../core/catalog.dart';
import '../core/engine.dart';
import '../core/i18n.dart';
import '../core/insights.dart';
import '../core/models.dart';
import '../core/scan.dart';
import '../core/store.dart';
import '../ui/forms.dart';
import '../ui/kit.dart';

class EditResult {
  final Receipt receipt;
  final List<int> off;
  final List<Map<String, dynamic>> corrections;
  const EditResult(this.receipt, this.off, this.corrections);
}

/// Часто покупаемое — чтобы внести чек руками за несколько нажатий.
List<Item> usualItems(List<HistoryEntry> entries, [int limit = 8]) {
  final by = <String, (int, String, Item)>{};
  for (final e in entries) {
    if (isDemo(e)) continue;
    for (final it in receiptOf(e)?.items ?? const <Item>[]) {
      if (it.p == 0 || it.nf) continue;
      final cur = by[it.n];
      final older = cur != null && cur.$2.compareTo(e.date) > 0;
      by[it.n] = (
        (cur?.$1 ?? 0) + 1,
        older ? cur.$2 : e.date,
        older ? cur.$3 : it,
      );
    }
  }
  final list = [
    for (final x in by.values)
      if (x.$1 >= 2) x,
  ]..sort((a, b) => b.$1 != a.$1 ? b.$1 - a.$1 : b.$2.compareTo(a.$2));
  return [for (final x in list.take(limit)) x.$3];
}

/// «1 250,5» → 1250.5; null — не число
num? parseNum(String s) {
  final v = num.tryParse(
    s.replaceAll(RegExp(r'[\s ]'), '').replaceAll(',', '.'),
  );
  return v != null && v.isFinite && v >= 0 ? v : null;
}

/// Позиции без цены считаем как за тысячу: нужна доля, а не сама цена.
const _basePrice = 1000;

class _Row {
  static int _seq = 0;
  final int key = ++_seq;
  Item it;
  bool off, touched = false, busy = false;

  /// набранное, но ещё не применённое название
  String? pending;

  /// цена замены относительно цены позиции; null — замены нет
  double? ratio;

  /// исходная строка — по ней запоминаем исправление
  final Item? was;
  _Row(this.it, this.off, this.was) {
    if (it.swap != null && it.p > 0) ratio = it.swap!.p / it.p;
  }

  /// Новая цена: вместе с ней меняется и цена замены.
  Item priced(num p) {
    final sw = it.swap;
    return it.copyWith(
      p: p,
      q: false,
      swap: sw == null || ratio == null
          ? sw
          : sw.copyWith(
              p: p == 0 ? 0 : (p * ratio!).round().clamp(1, 10000000),
            ),
    );
  }

  /// Показатели, посчитанные для цены [_basePrice]: цену оставляем введённую.
  void fill(Item got) {
    final p = it.p;
    if (got.swap != null) ratio = got.swap!.p / _basePrice;
    it = got;
    it = priced(p);
  }
}

Future<EditResult?> editReceipt(
  BuildContext context, {
  required Receipt receipt,
  List<int> off = const [],
  bool manual = false,
  VoidCallback? onDelete,
}) => showModalBottomSheet<EditResult>(
  context: context,
  isScrollControlled: true,
  useSafeArea: true,
  backgroundColor: Colors.transparent,
  barrierColor: ink.withValues(alpha: .58),
  constraints: const BoxConstraints(maxWidth: 430),
  builder: (_) =>
      EditSheet(receipt: receipt, off: off, manual: manual, onDelete: onDelete),
);

Receipt blankReceipt() => Receipt(
  id: 'man-${nowMs().toRadixString(36)}',
  title: 'Мой чек',
  store: 'Магазин',
  date: todayIso(),
  items: const [],
  via: 'manual',
);

class EditSheet extends StatefulWidget {
  final Receipt receipt;
  final List<int> off;
  final bool manual;
  final VoidCallback? onDelete;
  const EditSheet({
    super.key,
    required this.receipt,
    this.off = const [],
    this.manual = false,
    this.onDelete,
  });
  @override
  State<EditSheet> createState() => _EditSheetState();
}

class _EditSheetState extends State<EditSheet> {
  late final _store = TextEditingController(
    text: widget.manual ? '' : widget.receipt.store,
  );
  late String _date = widget.receipt.date;
  late bool _refund = widget.receipt.refund;
  late final List<_Row> _rows = [
    for (final (i, it) in widget.receipt.items.indexed)
      _Row(it, widget.off.contains(i), it),
  ];
  int? _open;
  bool _confirm = false;

  @override
  void initState() {
    super.initState();
    if (widget.manual) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _add());
    }
  }

  @override
  void dispose() {
    _store.dispose();
    super.dispose();
  }

  void _set(_Row r, Item it) => setState(() {
    r.it = it;
    r.touched = true;
  });

  Future<void> _rename(_Row r, String text) async {
    final n = text.trim();
    if (n.isEmpty || n == r.it.n) return;
    _set(
      r,
      r.it.copyWith(
        n: n,
        src: 'user',
        q: false,
        raw: () => r.it.raw ?? r.was?.n,
      ),
    );
    setState(() => r.busy = true);
    final got = await itemByName(n, _basePrice);
    if (!mounted) return;
    setState(() {
      r.busy = false;
      // неизвестное название не обнуляет то, что уже посчитано; пока ждали, его могли сменить ещё раз
      if (r.it.n == n && (got.src != null || got.nf)) {
        final raw = r.it.raw;
        r.fill(got.copyWith(n: n, src: 'user', raw: () => raw));
      }
    });
  }

  Future<void> _add() async {
    final it = await showSheet<Item>(
      context,
      title: t('Что купили?'),
      builder: (_) => const _AddItem(),
    );
    if (it == null || !mounted) return;
    final r = _Row(it, false, null);
    setState(() {
      _rows.add(r);
      _open = r.key;
    });
    if (it.src == null && !it.nf) {
      setState(() => r.busy = true);
      final got = await itemByName(it.n, _basePrice);
      if (!mounted) return;
      setState(() {
        r.busy = false;
        if (r.it.n == it.n && r.it.src == null) {
          r.fill(got.copyWith(n: it.n));
        }
      });
    }
  }

  Future<void> _pickDate() async {
    final d = await showDatePicker(
      context: context,
      initialDate: DateTime.tryParse(_date) ?? DateTime.now(),
      firstDate: DateTime(2020),
      lastDate: DateTime.parse(todayIso()),
    );
    if (d != null) {
      setState(
        () => _date =
            '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}',
      );
    }
  }

  void _save() {
    final corrections = <Map<String, dynamic>>[];
    for (final r in _rows) {
      final was = r.was;
      if (!r.touched || was == null) continue;
      final a = r.it.toJson(), b = was.toJson();
      const keys = ['n', 's', 't', 'f', 'k', 'c', 'b', 'w', 'nf'];
      if (keys.every((k) => a[k] == b[k])) continue;
      corrections.add({
        'raw': was.raw ?? was.n,
        'item': {
          for (final k in [...keys, 'junk'])
            if (a[k] != null) k: a[k],
        },
      });
    }
    final name = _store.text.trim();
    Navigator.pop(
      context,
      EditResult(
        widget.receipt.copyWith(
          store: name.isEmpty ? 'Магазин' : name,
          date: _date,
          title: _refund ? 'Возврат' : widget.receipt.title,
          refund: _refund,
          items: [for (final r in _rows) r.it],
        ),
        [
          for (final (i, r) in _rows.indexed)
            if (r.off) i,
        ],
        corrections,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final a = analyze(
      widget.receipt.copyWith(items: [for (final r in _rows) r.it]),
      const [],
      [
        for (final (i, r) in _rows.indexed)
          if (r.off) i,
      ],
    );
    final sum = _rows.fold<num>(0, (n, r) => n + r.it.p);
    final gap = widget.receipt.sum == null
        ? 0
        : (sum - widget.receipt.sum!).round();
    final unsure = _rows.where((r) => r.it.q).length;

    Widget note(String text) => Container(
      width: double.infinity,
      margin: const EdgeInsets.only(top: 8),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: mid.withValues(alpha: .16),
        borderRadius: BorderRadius.circular(18),
      ),
      child: Text(text, style: body(14, w: 700)),
    );

    return SheetFrame(
      title: widget.manual ? t('Чек вручную') : t('Изменить чек'),
      footer: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            children: [
              Expanded(
                child: Text.rich(
                  TextSpan(
                    children: [
                      TextSpan(text: money(sum)),
                      if (gap != 0)
                        TextSpan(
                          text:
                              ' · ${t('на чеке')} ${money(widget.receipt.sum!)}',
                          style: const TextStyle(color: Color(0xFFB26A00)),
                        ),
                    ],
                  ),
                  style: body(14, w: 700, color: mute),
                ),
              ),
              if (_rows.isNotEmpty)
                Text(
                  '${a.cubes} ${pl(a.cubes, cubesF)} · ${a.score}/100',
                  style: body(14, w: 700, color: mute),
                ),
            ],
          ),
          const SizedBox(height: 8),
          FlatBtn(
            t('Сохранить'),
            primary: true,
            height: 54,
            onTap: _rows.isEmpty ? null : _save,
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Field(
            controller: _store,
            label: t('Магазин'),
            hint: 'Magnum, Small…',
            maxLength: 60,
          ),
          const SizedBox(height: 8),
          RowBtn(
            dayTxt(_date),
            icon: Icons.calendar_month_rounded,
            onTap: _pickDate,
          ),
          SwitchRow(
            t('Возврат'),
            value: _refund,
            onChanged: (v) => setState(() => _refund = v),
          ),
          if (unsure > 0)
            note(
              t('Проверь {n} {w}: прочитались плохо.', {
                'n': unsure,
                'w': pl(unsure, positionsF),
              }),
            ),
          if (gap < 0)
            note(
              t(
                'Не хватает {n} до суммы на чеке: возможно, пропущена строка.',
                {'n': money(-gap)},
              ),
            ),
          if (gap > 0)
            note(
              t(
                'На {n} больше суммы на чеке: возможно, есть лишняя строка или скидка.',
                {'n': money(gap)},
              ),
            ),
          const SizedBox(height: 10),
          for (final r in _rows) _row(r),
          FlatBtn(
            t('Добавить позицию'),
            icon: Icons.add_rounded,
            color: blue1,
            onTap: _add,
          ),
          if (widget.onDelete != null) ...[
            const SizedBox(height: 16),
            if (_confirm)
              ConfirmBox(
                text: t('Удалить чек? Вернуть его не получится.'),
                no: t('Оставить'),
                yes: t('Удалить'),
                onNo: () => setState(() => _confirm = false),
                onYes: () {
                  Navigator.pop(context);
                  widget.onDelete!();
                },
              )
            else
              Press(
                onTap: () => setState(() => _confirm = true),
                child: Padding(
                  padding: const EdgeInsets.all(14),
                  child: Text(
                    t('Удалить чек'),
                    textAlign: TextAlign.center,
                    style: body(14, w: 700, color: bad),
                  ),
                ),
              ),
          ],
        ],
      ),
    );
  }

  Widget _row(_Row r) {
    final open = _open == r.key;
    final it = r.it;
    final fields = [
      (MetricId.sugar, (num v) => it.copyWith(s: v)),
      (MetricId.salt, (num v) => it.copyWith(t: v)),
      (MetricId.fat, (num v) => it.copyWith(f: v)),
      (MetricId.kcal, (num v) => it.copyWith(k: v)),
      (MetricId.carbs, (num v) => it.copyWith(c: v)),
      (MetricId.protein, (num v) => it.copyWith(b: v)),
    ];
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      decoration: BoxDecoration(
        color: it.q ? mid.withValues(alpha: .14) : tint,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Press(
            scale: .99,
            onTap: () => setState(() => _open = open ? null : r.key),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(14, 11, 10, 11),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          it.n.isEmpty ? t('Без названия') : it.n,
                          style: body(15, w: 700).copyWith(
                            decoration: r.off
                                ? TextDecoration.lineThrough
                                : null,
                          ),
                        ),
                        Text(
                          r.busy
                              ? t('Считаю…')
                              : r.off
                              ? t('не для нас')
                              : it.nf
                              ? t('не еда')
                              : '${t('сахар')} ${amountTxt(it.s, MetricId.sugar)}${it.weeks > 1 ? ' · ${t('на {n} нед.', {'n': it.weeks})}' : ''}',
                          style: body(13, color: mute),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 8),
                  Text(money(it.p), style: disp(14, w: 800, ls: -.02)),
                  AnimatedRotation(
                    turns: open ? .25 : 0,
                    duration: const Duration(milliseconds: 180),
                    child: const Icon(
                      Icons.chevron_right_rounded,
                      color: mute,
                      size: 22,
                    ),
                  ),
                ],
              ),
            ),
          ),
          if (open)
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Focus(
                    onFocusChange: (has) {
                      if (!has) _rename(r, r.pending ?? r.it.n);
                    },
                    child: Field(
                      key: ValueKey('n${r.key}'),
                      label: t('Название с весом или объёмом'),
                      hint: t('Кефир 2,5% 1 л'),
                      initial: it.n,
                      white: true,
                      maxLength: 120,
                      onChanged: (v) => r.pending = v,
                      onSubmitted: (v) => _rename(r, v),
                    ),
                  ),
                  if (it.raw != null && it.raw != it.n)
                    Padding(
                      padding: const EdgeInsets.fromLTRB(4, 4, 4, 0),
                      child: Text(
                        '${t('На чеке')}: ${it.raw}',
                        style: body(13, color: mute),
                      ),
                    ),
                  Field(
                    key: ValueKey('p${r.key}'),
                    label: '${t('Цена')}, ₸',
                    hint: '0',
                    initial: it.p == 0 ? '' : '${it.p}'.replaceAll('.', ','),
                    white: true,
                    keyboard: const TextInputType.numberWithOptions(
                      decimal: true,
                    ),
                    onChanged: (v) {
                      final n = parseNum(v);
                      if (n != null) {
                        _set(r, r.priced(n.round()));
                      }
                    },
                  ),
                  const SizedBox(height: 8),
                  SwitchRow(
                    t('Не для нас'),
                    hint: t('подарок, для соседей: не считать'),
                    value: r.off,
                    white: true,
                    onChanged: (v) => setState(() {
                      r.off = v;
                      r.touched = true;
                    }),
                  ),
                  SwitchRow(
                    t('Не еда'),
                    value: it.nf,
                    white: true,
                    onChanged: (v) =>
                        _set(r, r.it.copyWith(nf: v, src: 'user')),
                  ),
                  if (!it.nf) ...[
                    StepperRow(
                      label: t('Хватает, недель'),
                      hint: t('сахар и масло покупают впрок'),
                      value: it.weeks,
                      min: 1,
                      max: maxWeeks,
                      onChange: (v) => _set(
                        r,
                        r.it.copyWith(w: () => v > 1 ? v : null, src: 'user'),
                      ),
                    ),
                    Theme(
                      data: Theme.of(
                        context,
                      ).copyWith(dividerColor: Colors.transparent),
                      child: ExpansionTile(
                        tilePadding: const EdgeInsets.symmetric(horizontal: 6),
                        childrenPadding: EdgeInsets.zero,
                        title: Text(
                          t('Показатели на всю позицию'),
                          style: body(14, w: 700, color: blue1),
                        ),
                        children: [
                          for (final (m, apply) in fields)
                            Field(
                              key: ValueKey('${r.key}$m${it.n}${r.busy}'),
                              label:
                                  '${t(metrics[m]!.label)}, ${t(metrics[m]!.unit)}',
                              hint: '0',
                              initial: num1(it.valueOf(m)),
                              white: true,
                              keyboard: const TextInputType.numberWithOptions(
                                decimal: true,
                              ),
                              onChanged: (v) {
                                final n = parseNum(v);
                                if (n != null) {
                                  _set(r, apply(n).copyWith(src: 'user'));
                                }
                              },
                            ),
                        ],
                      ),
                    ),
                  ],
                  const SizedBox(height: 4),
                  FlatBtn(
                    t('Удалить строку'),
                    icon: Icons.delete_outline_rounded,
                    color: bad,
                    white: true,
                    onTap: () => setState(() {
                      _rows.remove(r);
                      _open = null;
                    }),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

class _AddItem extends StatefulWidget {
  const _AddItem();
  @override
  State<_AddItem> createState() => _AddItemState();
}

class _AddItemState extends State<_AddItem> {
  final _c = TextEditingController();
  late final List<Item> _usual = usualItems(store.history);

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  void _submit() {
    final n = _c.text.trim();
    if (n.isNotEmpty) Navigator.pop(context, Item(n: n, p: 0, s: 0));
  }

  @override
  Widget build(BuildContext context) {
    final q = _c.text.trim();
    final found = q.isEmpty
        ? const <CatalogItem>[]
        : searchCatalog(q, 'all').take(5).toList();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Field(
          controller: _c,
          hint: t('Кола 1 л, хлеб, яблоки 1,2 кг'),
          autofocus: true,
          maxLength: 120,
          onChanged: (_) => setState(() {}),
          onSubmitted: (_) => _submit(),
        ),
        const SizedBox(height: 8),
        FlatBtn(
          t('Добавить'),
          primary: true,
          onTap: q.isEmpty ? null : _submit,
        ),
        const SizedBox(height: 8),
        for (final c in found)
          RowBtn(
            t(c.name),
            hint: t(c.portion),
            onTap: () => Navigator.pop(
              context,
              Item(
                n: '${c.name}, ${c.portion.replaceFirst(RegExp(r'^(бутылка|пакет|банка|стаканчик|плитка|пачка|штука|порция|стакан) '), '')}',
                p: 0,
                s: 0,
              ),
            ),
          ),
        if (q.isEmpty && _usual.isNotEmpty) ...[
          Padding(
            padding: const EdgeInsets.fromLTRB(4, 8, 4, 6),
            child: Text(t('Как обычно'), style: body(13, w: 700, color: mute)),
          ),
          for (final it in _usual)
            RowBtn(
              it.n,
              trailing: Text(money(it.p), style: body(14, w: 700, color: mute)),
              onTap: () => Navigator.pop(context, it),
            ),
        ],
      ],
    );
  }
}

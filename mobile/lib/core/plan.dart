// План и факт (перенос web/src/lib/plan.ts). Замена на чеке — намерение; сработавшей считается, когда её подтвердил более поздний чек.
// Здесь же — поиск дублей чеков.
import 'calendar.dart';
import 'engine.dart';
import 'models.dart';

const _stop = {
  'без',
  'для',
  'или',
  'шт',
  'упак',
  'пак',
  'кг',
  'мл',
  'свежий',
  'свежая',
  'свежие',
  'целые',
  'сезонные', //
  'замороженные',
  'цельнозерновые',
  'натуральный',
  'питьевой',
  'питьевая',
  'сахара',
  'напиток',
  'вода',
};
final _amount = RegExp(
  r'[\d.,%×]+\s*(?:кг|г|гр|л|мл|шт|%)?(?![\p{L}])',
  unicode: true,
);
final _split = RegExp(r'[^\p{L}]+', unicode: true);

/// Смысловые слова названия, обрезанные до основы.
List<String> words(String name) => [
  for (final w
      in name
          .toLowerCase()
          .replaceAll('ё', 'е')
          .replaceAll(_amount, ' ')
          .split(_split))
    if (w.length >= 3 && !_stop.contains(w))
      w.length > 5 ? w.substring(0, 5) : w,
];

/// Похоже, что `bought` — это продукт `wanted`.
bool sameFood(String wanted, String bought) {
  final k = words(wanted).firstOrNull;
  return k != null && words(bought).contains(k);
}

const confirmDays = 45;

class ConfirmedSwap {
  final String planId, factId, date, from, to;
  final int i;
  final num money;
  final Map<MetricId, double> saved;
  const ConfirmedSwap({
    required this.planId,
    required this.i,
    required this.factId,
    required this.date,
    required this.from,
    required this.to,
    required this.money,
    required this.saved,
  });
}

typedef ReceiptOf = Receipt? Function(HistoryEntry);

List<ConfirmedSwap> confirmedSwaps(
  List<HistoryEntry> entries,
  ReceiptOf receiptOf,
) {
  final all =
      [
        for (final e in entries)
          if (receiptOf(e) case final Receipt r when !r.refund)
            (entry: e, receipt: r),
      ]..sort((a, b) {
        final d = a.entry.date.compareTo(b.entry.date);
        return d != 0 ? d : a.entry.id.compareTo(b.entry.id);
      });
  final used = <String>{};
  final out = <ConfirmedSwap>[];
  for (final plan in all) {
    if (!isIso(plan.entry.date)) continue;
    for (final i in [...plan.entry.swaps]..sort()) {
      if (i >= plan.receipt.items.length) continue;
      final from = plan.receipt.items[i], to = from.swap;
      if (to == null || plan.entry.off.contains(i)) continue;
      for (final fact in all) {
        if (!isIso(fact.entry.date)) continue;
        final gap = daysBetween(plan.entry.date, fact.entry.date);
        if (gap <= 0) continue;
        if (gap > confirmDays) break;
        final lines = [
          for (var k = 0; k < fact.receipt.items.length; k++)
            if (!fact.receipt.items[k].nf && !fact.entry.off.contains(k)) k,
        ];
        Item at(int k) => fact.receipt.items[k];
        final hit = lines
            .where(
              (k) =>
                  sameFood(to.n, at(k).n) &&
                  !used.contains('${fact.entry.id}:$k'),
            )
            .firstOrNull;
        if (hit == null ||
            lines.any((k) => k != hit && sameFood(from.n, at(k).n))) {
          continue;
        }
        used.add('${fact.entry.id}:$hit');
        out.add(
          ConfirmedSwap(
            planId: plan.entry.id,
            i: i,
            factId: fact.entry.id,
            date: fact.entry.date,
            from: from.n,
            to: at(hit).n,
            money: from.p - at(hit).p,
            saved: {
              for (final m in metricIds)
                m: ((from.valueOf(m) - at(hit).valueOf(m)) * 10).round() / 10,
            },
          ),
        );
        break;
      }
    }
  }
  return out;
}

String _norm(String s) => s
    .toLowerCase()
    .replaceAll('ё', 'е')
    .replaceAll(RegExp(r'[^\p{L}\p{N}]+', unicode: true), '');
int _total(Receipt r) =>
    (r.sum ?? r.items.fold<num>(0, (n, it) => n + it.p)).round();

/// Похожий чек в журнале: фискальный ключ, иначе день, сумма, магазин, время и большинство цен.
HistoryEntry? findDuplicate(
  Receipt receipt,
  List<HistoryEntry> entries,
  ReceiptOf receiptOf,
) {
  final total = _total(receipt);
  for (final e in entries) {
    final r = receiptOf(e);
    if (r == null || r.refund != receipt.refund) continue;
    if (r.id == receipt.id) return e;
    if (r.fiscal != null && receipt.fiscal != null) {
      if (r.fiscal == receipt.fiscal) return e;
      continue;
    }
    if (r.date != receipt.date) continue;
    if (r.time != null && receipt.time != null && r.time != receipt.time) {
      continue;
    }
    final a = _norm(r.store), b = _norm(receipt.store);
    bool unknown(String s) => s.isEmpty || s == 'магазин';
    if (!unknown(a) && !unknown(b) && !a.contains(b) && !b.contains(a)) {
      continue;
    }
    final slack = total * .01 > 10 ? total * .01 : 10;
    if ((_total(r) - total).abs() > slack) continue;
    final pool = [for (final it in r.items) it.p];
    var same = 0;
    for (final it in receipt.items) {
      if (pool.remove(it.p)) same++;
    }
    final most = receipt.items.length > r.items.length
        ? receipt.items.length
        : r.items.length;
    if (same >= (most * .7).ceil()) return e;
  }
  return null;
}

/// Факт по чеку: что куплено на самом деле, без включённых замен.
Analysis factOf(HistoryEntry e, Receipt r) => analyze(r, const [], e.off);

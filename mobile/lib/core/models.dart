// Общие типы «Чек-апа» (перенос web/src/lib/types.ts).

/// Позиция чека или замена: n — название, p — цена ₸, s — добавленный сахар, г на всю позицию.
class Item {
  final String n;
  final num p;
  final num s;
  final bool junk;
  final Item? swap;
  const Item({
    required this.n,
    required this.p,
    required this.s,
    this.junk = false,
    this.swap,
  });

  Map<String, dynamic> toJson() => {
    'n': n,
    'p': p,
    's': s,
    if (junk) 'junk': 1,
    if (swap != null) 'swap': swap!.toJson(),
  };

  /// Бросает FormatException, если данные не по схеме.
  factory Item.fromJson(Object? j) {
    if (j is! Map) throw const FormatException('item');
    final n = j['n'], p = j['p'], s = j['s'];
    if (n is! String || n.isEmpty || p is! num || s is! num || p < 0 || s < 0)
      throw const FormatException('item');
    return Item(
      n: n,
      p: p,
      s: s,
      junk: j['junk'] == 1 || j['junk'] == true,
      swap: j['swap'] == null ? null : Item.fromJson(j['swap']),
    );
  }
}

class Receipt {
  final String id, title, store;

  /// YYYY-MM-DD
  final String date;
  final List<Item> items;

  /// распознан по фото — цифры приблизительные
  final bool approx;
  const Receipt({
    required this.id,
    required this.title,
    required this.store,
    required this.date,
    required this.items,
    this.approx = false,
  });

  Map<String, dynamic> toJson() => {
    'id': id,
    'title': title,
    'store': store,
    'date': date,
    'items': [for (final i in items) i.toJson()],
    if (approx) 'approx': true,
  };

  factory Receipt.fromJson(Object? j) {
    if (j is! Map) throw const FormatException('receipt');
    final id = j['id'], date = j['date'], items = j['items'];
    if (id is! String ||
        id.isEmpty ||
        date is! String ||
        !RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(date) ||
        items is! List ||
        items.isEmpty) {
      throw const FormatException('receipt');
    }
    return Receipt(
      id: id,
      title: j['title'] is String ? j['title'] : '',
      store: j['store'] is String ? j['store'] : '',
      date: date,
      items: [for (final i in items) Item.fromJson(i)],
      approx: j['approx'] == true,
    );
  }
}

/// Позиция после расчёта: active — то, что реально лежит в корзине.
class AnalyzedItem {
  final Item item;
  final int i;
  final bool swapped;
  final Item active;
  final bool activeJunk;
  const AnalyzedItem(
    this.item,
    this.i,
    this.swapped,
    this.active,
    this.activeJunk,
  );
}

class Analysis {
  final List<AnalyzedItem> items;
  final num total, sugar, junk;
  final int cubes, junkCount, score;
  final double share, days;
  const Analysis({
    required this.items,
    required this.total,
    required this.sugar,
    required this.cubes,
    required this.junk,
    required this.junkCount,
    required this.share,
    required this.score,
    required this.days,
  });
}

enum Tone { good, mid, bad }

class Verdict {
  final String label;
  final Tone tone;
  const Verdict(this.label, this.tone);
}

/// Запись истории.
class HistoryEntry {
  final String id, receiptId, store, date;
  final int cubes, score, savedAt;
  final List<int> swaps;

  /// сам чек — для распознанных по фото; у демо-чеков null
  final Receipt? receipt;
  const HistoryEntry({
    required this.id,
    required this.receiptId,
    required this.store,
    required this.date,
    required this.cubes,
    required this.score,
    required this.swaps,
    required this.savedAt,
    this.receipt,
  });

  Map<String, dynamic> toJson() => {
    'id': id,
    'receiptId': receiptId,
    'store': store,
    'date': date,
    'cubes': cubes,
    'score': score,
    'swaps': swaps,
    'savedAt': savedAt,
    if (receipt != null) 'receipt': receipt!.toJson(),
  };

  static HistoryEntry? tryJson(Object? j) {
    try {
      if (j is! Map || j['id'] is! String || j['receiptId'] is! String)
        return null;
      return HistoryEntry(
        id: j['id'],
        receiptId: j['receiptId'],
        store: j['store'] is String ? j['store'] : '',
        date: j['date'] is String ? j['date'] : '',
        cubes: (j['cubes'] as num?)?.round() ?? 0,
        score: (j['score'] as num?)?.round() ?? 0,
        swaps: [
          for (final v in (j['swaps'] as List? ?? const []))
            if (v is num) v.toInt(),
        ],
        savedAt: (j['savedAt'] as num?)?.toInt() ?? 0,
        receipt: j['receipt'] == null ? null : Receipt.fromJson(j['receipt']),
      );
    } catch (_) {
      return null;
    }
  }
}

/// Профиль семьи.
class Profile {
  final int adults, kids;
  final bool onboarded;
  final List<String> seen;

  /// время последней правки (мс): по нему синхронизация решает, чья версия новее
  final int updatedAt;
  const Profile({
    this.adults = 1,
    this.kids = 0,
    this.onboarded = false,
    this.seen = const [],
    this.updatedAt = 0,
  });

  Profile copyWith({
    int? adults,
    int? kids,
    bool? onboarded,
    List<String>? seen,
    int? updatedAt,
  }) => Profile(
    adults: adults ?? this.adults,
    kids: kids ?? this.kids,
    onboarded: onboarded ?? this.onboarded,
    seen: seen ?? this.seen,
    updatedAt: updatedAt ?? this.updatedAt,
  );

  Map<String, dynamic> toJson() => {
    'adults': adults,
    'kids': kids,
    'onboarded': onboarded,
    'seen': seen,
    'updatedAt': updatedAt,
  };

  factory Profile.fromJson(Object? j) {
    if (j is! Map) return const Profile();
    int clamp(Object? v, int min, int max, int fb) =>
        v is num ? v.round().clamp(min, max) : fb;
    return Profile(
      adults: clamp(j['adults'], 1, 6, 1),
      kids: clamp(j['kids'], 0, 8, 0),
      onboarded: j['onboarded'] == true,
      seen: [
        for (final s in (j['seen'] as List? ?? const []))
          if (s is String) s,
      ],
      updatedAt: (j['updatedAt'] as num?)?.toInt() ?? 0,
    );
  }
}

/// Пункт списка «на следующий поход».
class ShopItem {
  final String name;

  /// вместо чего (может быть пусто — добавлено вручную)
  final String instead;
  final bool done;

  /// время последней правки (мс), для синхронизации
  final int updatedAt;
  const ShopItem({
    required this.name,
    this.instead = '',
    this.done = false,
    this.updatedAt = 0,
  });

  ShopItem toggled() => ShopItem(
    name: name,
    instead: instead,
    done: !done,
    updatedAt: DateTime.now().millisecondsSinceEpoch,
  );
  Map<String, dynamic> toJson() => {
    'name': name,
    'instead': instead,
    'done': done,
    'updatedAt': updatedAt,
  };

  static ShopItem? tryJson(Object? j) => j is Map && j['name'] is String
      ? ShopItem(
          name: j['name'],
          instead: j['instead'] is String ? j['instead'] : '',
          done: j['done'] == true,
          updatedAt: (j['updatedAt'] as num?)?.toInt() ?? 0,
        )
      : null;
}

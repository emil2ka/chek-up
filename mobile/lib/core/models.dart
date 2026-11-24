// Общие типы «Чек-апа» (перенос web/src/lib/types.ts).

/// Запас больше полугода не растягиваем.
const maxWeeks = 26;

enum MetricId { sugar, salt, fat, kcal, carbs, protein }

/// Позиция чека или замена. На всю позицию (с учётом количества): p — цена ₸, s — добавленный сахар, г,
/// t — соль, f — насыщенные жиры, k — ккал, c — углеводы, b — белки.
class Item {
  final String n;
  final num p, s, t, f, k;
  final num? c, b;
  final bool junk;

  /// алкоголь или энергетик: считаются отдельной строкой ('alcohol' | 'energy')
  final String? x;
  final Item? swap;

  /// не еда: в деньги входит, в оценку и показатели — нет
  final bool nf;

  /// на сколько недель хватает (запас); null — съедят сразу
  final int? w;

  /// строка сомнительная: стоит проверить
  final bool q;

  /// откуда показатели: ref, ai, user; null — неизвестно
  final String? src;

  /// как было напечатано на чеке, если название исправили
  final String? raw;
  const Item({
    required this.n,
    required this.p,
    required this.s,
    this.t = 0,
    this.f = 0,
    this.k = 0,
    this.c,
    this.b,
    this.junk = false,
    this.x,
    this.swap,
    this.nf = false,
    this.w,
    this.q = false,
    this.src,
    this.raw,
  });

  /// На сколько недель растягиваются показатели: 1 — съедят на этой неделе.
  int get weeks => (w ?? 1).clamp(1, maxWeeks);

  Item copyWith({
    String? n,
    num? p,
    num? s,
    num? t,
    num? f,
    num? k,
    num? c,
    num? b,
    bool? junk,
    bool? nf,
    int? Function()? w,
    bool? q,
    String? src,
    String? Function()? raw,
    Item? swap,
  }) => Item(
    n: n ?? this.n,
    p: p ?? this.p,
    s: s ?? this.s,
    t: t ?? this.t,
    f: f ?? this.f,
    k: k ?? this.k,
    c: c ?? this.c,
    b: b ?? this.b,
    junk: junk ?? this.junk,
    x: x,
    swap: swap ?? this.swap,
    nf: nf ?? this.nf,
    w: w == null ? this.w : w(),
    q: q ?? this.q,
    src: src ?? this.src,
    raw: raw == null ? this.raw : raw(),
  );

  /// Значение показателя у позиции.
  num valueOf(MetricId m) => switch (m) {
    MetricId.sugar => s,
    MetricId.salt => t,
    MetricId.fat => f,
    MetricId.kcal => k,
    MetricId.carbs => c ?? 0,
    MetricId.protein => b ?? 0,
  };

  Map<String, dynamic> toJson() => {
    'n': n,
    'p': p,
    's': s,
    if (t != 0) 't': t,
    if (f != 0) 'f': f,
    if (k != 0) 'k': k,
    if (c != null) 'c': c,
    if (b != null) 'b': b,
    if (junk) 'junk': 1,
    if (x != null) 'x': x,
    if (swap != null) 'swap': swap!.toJson(),
    if (nf) 'nf': 1,
    if (w != null) 'w': w,
    if (q) 'q': 1,
    if (src != null) 'src': src,
    if (raw != null) 'raw': raw,
  };

  /// Бросает FormatException, если данные не по схеме.
  factory Item.fromJson(Object? j) {
    if (j is! Map) throw const FormatException('item');
    final n = j['n'], p = j['p'], s = j['s'];
    if (n is! String || n.isEmpty || p is! num || s is! num || p < 0 || s < 0) {
      throw const FormatException('item');
    }
    num? opt(Object? v) => v is num && v.isFinite && v >= 0 ? v : null;
    return Item(
      n: n,
      p: p,
      s: s,
      t: opt(j['t']) ?? 0,
      f: opt(j['f']) ?? 0,
      k: opt(j['k']) ?? 0,
      c: opt(j['c']),
      b: opt(j['b']),
      junk: j['junk'] == 1 || j['junk'] == true,
      x: j['x'] == 'alcohol' || j['x'] == 'energy' ? j['x'] as String : null,
      swap: j['swap'] == null ? null : Item.fromJson(j['swap']),
      nf: j['nf'] == 1,
      w: j['w'] is num && j['w'] >= 1 && j['w'] <= maxWeeks
          ? (j['w'] as num).round()
          : null,
      q: j['q'] == 1,
      src: const ['ref', 'ai', 'user'].contains(j['src']) ? j['src'] : null,
      raw: j['raw'] is String ? j['raw'] : null,
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

  /// возврат: в итогах недели вычитается
  final bool refund;

  /// фискальный ключ из QR — по нему ловим дубли
  final String? fiscal;

  /// время покупки HH:MM
  final String? time;

  /// сумма, напечатанная на чеке, ₸
  final num? sum;

  /// откуда чек: photo, qr, manual
  final String? via;

  /// цены и алкоголь скрыты (так чужие чеки видит ребёнок)
  final bool masked;
  const Receipt({
    required this.id,
    required this.title,
    required this.store,
    required this.date,
    required this.items,
    this.approx = false,
    this.refund = false,
    this.fiscal,
    this.time,
    this.sum,
    this.via,
    this.masked = false,
  });

  Receipt copyWith({
    String? title,
    String? store,
    String? date,
    List<Item>? items,
    bool? refund,
  }) => Receipt(
    id: id,
    title: title ?? this.title,
    store: store ?? this.store,
    date: date ?? this.date,
    items: items ?? this.items,
    approx: approx,
    refund: refund ?? this.refund,
    fiscal: fiscal,
    time: time,
    sum: sum,
    via: via,
    masked: masked,
  );

  Map<String, dynamic> toJson() => {
    'id': id,
    'title': title,
    'store': store,
    'date': date,
    'items': [for (final i in items) i.toJson()],
    if (approx) 'approx': true,
    if (refund) 'refund': true,
    if (fiscal != null) 'fiscal': fiscal,
    if (time != null) 'time': time,
    if (sum != null) 'sum': sum,
    if (via != null) 'via': via,
    if (masked) 'masked': true,
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
    String? str(String k) => j[k] is String ? j[k] as String : null;
    return Receipt(
      id: id,
      title: j['title'] is String ? j['title'] : '',
      store: j['store'] is String ? j['store'] : '',
      date: date,
      items: [for (final i in items) Item.fromJson(i)],
      approx: j['approx'] == true,
      refund: j['refund'] == true,
      fiscal: str('fiscal'),
      time: str('time'),
      sum: j['sum'] is num ? j['sum'] as num : null,
      via: const ['photo', 'qr', 'manual'].contains(j['via']) ? j['via'] : null,
      masked: j['masked'] == true,
    );
  }
}

/// Позиция после расчёта: active — то, что лежало бы в корзине с заменой.
class AnalyzedItem {
  final Item item;
  final int i;
  final bool swapped;

  /// «не для нас»: в расчёты не входит
  final bool off;
  final Item active;
  const AnalyzedItem(this.item, this.i, this.swapped, this.off, this.active);

  /// участвует в показателях
  bool get counted => !off && !item.nf;
}

/// Причина, почему оценка ниже 100: sugar, fat, salt, junk, flagged.
class Why {
  final String k;
  final int pts;
  final double value;
  const Why(this.k, this.pts, this.value);
}

class Analysis {
  final List<AnalyzedItem> items;

  /// total — сумма учтённых позиций, food — из них еда
  final num total, food, sugar, junk;
  final int cubes, junkCount, score, offCount;
  final double share, days;
  final List<Why> why;

  /// всего по каждому показателю: г или ккал
  final Map<MetricId, double> totals;

  /// кубиков по каждому показателю (размер кубика у каждого свой)
  final Map<MetricId, int> cubesBy;

  /// алкоголь и энергетики: сколько позиций и на какую сумму, ₸
  final int flaggedCount;
  final num flaggedSum, alcoholSum, energySum;
  const Analysis({
    required this.items,
    required this.total,
    required this.food,
    required this.offCount,
    required this.sugar,
    required this.cubes,
    required this.junk,
    required this.junkCount,
    required this.share,
    required this.score,
    required this.why,
    required this.days,
    required this.totals,
    required this.cubesBy,
    required this.flaggedCount,
    required this.flaggedSum,
    required this.alcoholSum,
    required this.energySum,
  });
}

enum Tone { good, mid, bad }

class Verdict {
  final String label;
  final Tone tone;
  const Verdict(this.label, this.tone);
}

/// Запись журнала. swaps — план: какие замены взять в следующий раз (в факт не входит).
class HistoryEntry {
  final String id, receiptId, store, date;
  final int cubes, score, savedAt;
  final List<int> swaps;

  /// позиции «не для нас»
  final List<int> off;

  /// «гости»: деньги считаем, показатели — нет
  final bool guests;

  /// личный чек: виден только автору
  final bool priv;

  /// кто внёс (id участника семьи); null — я
  final String? by;

  /// сам чек — для внесённых; у демо-чеков null
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
    this.off = const [],
    this.guests = false,
    this.priv = false,
    this.by,
    this.receipt,
  });

  HistoryEntry copyWith({
    String? store,
    String? date,
    int? cubes,
    int? score,
    List<int>? swaps,
    List<int>? off,
    bool? guests,
    bool? priv,
    Receipt? receipt,
    int? savedAt,
  }) => HistoryEntry(
    id: id,
    receiptId: receiptId,
    store: store ?? this.store,
    date: date ?? this.date,
    cubes: cubes ?? this.cubes,
    score: score ?? this.score,
    swaps: swaps ?? this.swaps,
    savedAt: savedAt ?? this.savedAt,
    off: off ?? this.off,
    guests: guests ?? this.guests,
    priv: priv ?? this.priv,
    by: by,
    receipt: receipt ?? this.receipt,
  );

  Map<String, dynamic> toJson() => {
    'id': id,
    'receiptId': receiptId,
    'store': store,
    'date': date,
    'cubes': cubes,
    'score': score,
    'swaps': swaps,
    'savedAt': savedAt,
    if (off.isNotEmpty) 'off': off,
    if (guests) 'tag': 'guests',
    if (priv) 'priv': true,
    if (by != null) 'by': by,
    if (receipt != null) 'receipt': receipt!.toJson(),
  };

  static HistoryEntry? tryJson(Object? j) {
    try {
      if (j is! Map || j['id'] is! String || j['receiptId'] is! String) {
        return null;
      }
      List<int> ints(Object? v) => [
        for (final x in (v as List? ?? const []))
          if (x is num) x.toInt(),
      ];
      return HistoryEntry(
        id: j['id'],
        receiptId: j['receiptId'],
        store: j['store'] is String ? j['store'] : '',
        date: j['date'] is String ? j['date'] : '',
        cubes: (j['cubes'] as num?)?.round() ?? 0,
        score: (j['score'] as num?)?.round() ?? 0,
        swaps: ints(j['swaps']),
        off: ints(j['off']),
        guests: j['tag'] == 'guests',
        priv: j['priv'] == true,
        by: j['by'] is String ? j['by'] : null,
        savedAt: (j['savedAt'] as num?)?.toInt() ?? 0,
        receipt: j['receipt'] == null ? null : Receipt.fromJson(j['receipt']),
      );
    } catch (_) {
      return null;
    }
  }
}

/// Профиль: личное (знакомство, достижения, язык) и настройки семьи (состав, цель).
class Profile {
  final int adults, kids;

  /// цель семьи: на сколько процентов меньше сахара; 0 — не выбрана
  final int goal;
  final bool onboarded;
  final List<String> seen;

  /// 'ru' | 'kk'
  final String lang;

  /// время правки личного и семейного (мс): по ним сервер решает, чья версия новее
  final int updatedAt, familyAt;
  const Profile({
    this.adults = 1,
    this.kids = 0,
    this.goal = 0,
    this.onboarded = false,
    this.seen = const [],
    this.lang = 'ru',
    this.updatedAt = 0,
    this.familyAt = 0,
  });

  Profile copyWith({
    int? adults,
    int? kids,
    int? goal,
    bool? onboarded,
    List<String>? seen,
    String? lang,
    int? updatedAt,
    int? familyAt,
  }) => Profile(
    adults: adults ?? this.adults,
    kids: kids ?? this.kids,
    goal: goal ?? this.goal,
    onboarded: onboarded ?? this.onboarded,
    seen: seen ?? this.seen,
    lang: lang ?? this.lang,
    updatedAt: updatedAt ?? this.updatedAt,
    familyAt: familyAt ?? this.familyAt,
  );

  Map<String, dynamic> toJson() => {
    'adults': adults,
    'kids': kids,
    'goal': goal,
    'onboarded': onboarded,
    'seen': seen,
    'lang': lang,
    'updatedAt': updatedAt,
    'familyAt': familyAt,
  };

  factory Profile.fromJson(Object? j) {
    if (j is! Map) return const Profile();
    int clamp(Object? v, int min, int max, int fb) =>
        v is num ? v.round().clamp(min, max) : fb;
    final at = (j['updatedAt'] as num?)?.toInt() ?? 0;
    return Profile(
      adults: clamp(j['adults'], 1, 6, 1),
      kids: clamp(j['kids'], 0, 8, 0),
      goal: clamp(j['goal'], 0, 50, 0),
      onboarded: j['onboarded'] == true,
      seen: [
        for (final s in (j['seen'] as List? ?? const []))
          if (s is String) s,
      ],
      lang: j['lang'] == 'kk' ? 'kk' : 'ru',
      updatedAt: at,
      // у старых записей было одно время на всё
      familyAt: (j['familyAt'] as num?)?.toInt() ?? at,
    );
  }
}

/// Участник семьи: role — owner, adult, child.
class Member {
  final String id, name, role;
  final bool me;
  const Member(this.id, this.name, this.role, this.me);
  Map<String, dynamic> toJson() => {
    'id': id,
    'name': name,
    'role': role,
    'me': me,
  };
  static Member? tryJson(Object? j) => j is Map && j['id'] is String
      ? Member(
          j['id'],
          j['name'] is String ? j['name'] : '',
          j['role'] is String ? j['role'] : 'adult',
          j['me'] == true,
        )
      : null;
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

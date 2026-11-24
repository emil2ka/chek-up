// Чтение чека. Фото уходит на сервер «Чек-апа» (тот же POST /api/scan, что у сайта): ключи ИИ живут только там.
// Сервер отвечает, как только прочитал позиции; показатели неизвестных — вторым запросом (enrich).
// Без адреса сервера приложение честно работает в демо-режиме.
import 'dart:typed_data';

import 'api.dart';
import 'catalog.dart';
import 'insights.dart';
import 'models.dart';
import 'store.dart';

const demoNotice =
    'Демо-режим: распознавание чеков ещё не подключено, показываю пример';

const cartDemoNotice =
    'Демо-режим: распознавание ещё не подключено, показываю пример корзины';

const scanErrors = {
  'not_cart':
      'Не вижу здесь продуктов. Сфоткай корзину сверху или пришли скриншот заказа',
  'is_receipt': 'Это уже чек, а не корзина',
  'cart_empty':
      'Не получилось узнать товары. Поверни упаковки названиями к камере',
  'not_receipt': 'Похоже, на фото не чек. Сфоткай кассовый чек целиком',
  'unreadable':
      'Не получилось прочитать чек. Расправь его, включи свет и сними ближе',
  'empty': 'В чеке не нашлось товаров. Попробуй сфоткать ещё раз',
  'too_large': 'Фото слишком большое. Попробуй ещё раз',
  'bad_request': 'Не получилось отправить фото. Попробуй ещё раз',
  'rate_limit': 'Слишком много фото подряд. Подожди минуту и попробуй снова',
  'daily_limit':
      'На сегодня сканов достаточно. Продолжим завтра, чек можно внести вручную',
  'qr_no_items':
      'По этому QR список товаров не открывается. Сфоткай чек целиком',
  'unavailable': 'Сервис распознавания сейчас недоступен. Попробуй позже',
};

class ScanError implements Exception {
  final String code;
  ScanError(String c) : code = scanErrors.containsKey(c) ? c : 'unavailable';
  String get message => scanErrors[code]!;
}

typedef ScanResult = ({Receipt receipt, String? notice, List<int> pending});

Future<ScanResult> recognize(List<Uint8List> photos, String? qr) async {
  if (!store.syncEnabled) {
    return (
      receipt: demoById('week')!,
      notice: demoNotice,
      pending: const <int>[],
    );
  }
  if (photos.any((b) => b.length > 7 * 1024 * 1024)) {
    throw ScanError('too_large');
  }
  try {
    final r = await store.authed((token) => Api.scan(photos, qr, token: token));
    return (
      receipt: Receipt.fromJson(r['receipt']),
      notice: r['notice'] as String?,
      pending: [
        for (final i in (r['pending'] as List? ?? const []))
          if (i is num) i.toInt(),
      ],
    );
  } on ApiException catch (e) {
    throw ScanError(
      scanErrors.containsKey(e.code)
          ? e.code
          : e.status == 413
          ? 'too_large'
          : e.status == 429
          ? 'rate_limit'
          : 'unavailable',
    );
  } on FormatException {
    throw ScanError('unavailable');
  }
}

/// Показатели строк по названию и цене: справочник сервера, а чего там нет — модель. null — не вышло.
Future<List<Item?>?> enrichItems(List<({String n, num p})> list) async {
  if (!store.syncEnabled || list.isEmpty) return null;
  try {
    final r = await store.call('POST', '/api/scan/enrich', {
      'items': [
        for (final x in list.take(40)) {'n': x.n, 'p': x.p},
      ],
    });
    return [
      for (final j in (r['items'] as List? ?? const []))
        j == null ? null : Item.fromJson(j),
    ];
  } catch (_) {
    return null;
  }
}

/// Уточнить показатели уже показанного чека. Меняем только то, что человек за это время не трогал.
Future<void> refineEntry(String entryId, Receipt r, List<int> pending) async {
  final list = [
    for (final i in pending)
      if (i < r.items.length) (n: r.items[i].n, p: r.items[i].p),
  ];
  final got = await enrichItems(list);
  final cur = store.entry(entryId);
  if (got == null || cur?.receipt == null) return;
  final by = {
    for (final (i, x) in list.take(40).indexed)
      if (i < got.length && got[i] != null) '${x.n}|${x.p}': got[i]!,
  };
  if (by.isEmpty) return;
  final next = cur!.receipt!.copyWith(
    items: [
      for (final it in cur.receipt!.items)
        it.src == null && !it.nf && by.containsKey('${it.n}|${it.p}')
            ? by['${it.n}|${it.p}']!.copyWith(q: it.q)
            : it,
    ],
  );
  store.editReceipt(cur, next, cur.off);
}

/// Позиция, введённая руками, когда сервера нет: показатели порции из встроенного справочника.
Item localItem(String name, num price) {
  final q = name.toLowerCase().replaceAll('ё', 'е');
  for (final c in catalog) {
    final words = c.name.toLowerCase().replaceAll('ё', 'е').split(' ');
    if (words.every(q.contains)) {
      return Item(
        n: name,
        p: price,
        s: c.g,
        t: c.t,
        f: c.f,
        k: c.k,
        c: c.c,
        b: c.b,
        x: c.x,
        junk: c.x != null,
        src: 'ref',
      );
    }
  }
  return Item(n: name, p: price, s: 0);
}

/// Позиция по названию и цене.
Future<Item> itemByName(String name, num price) async {
  final got = await enrichItems([(n: name, p: price)]);
  return got?.firstOrNull ?? localItem(name, price);
}

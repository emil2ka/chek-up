// Распознавание чека по фото. Фото уходит на сервер «Чек-апа» (тот же POST /api/scan, что у веб-версии):
// ключи ИИ живут только там. Адрес сервера — API_URL (см. api.dart).
// Без адреса приложение честно работает в демо-режиме.
import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart';
import 'package:image_picker/image_picker.dart';

import 'api.dart';
import 'insights.dart';
import 'models.dart';

const _demoNotice =
    'Демо-режим: распознавание чеков ещё не подключено, показываю пример';

const _errors = {
  'not_receipt': 'Похоже, на фото не чек. Сфоткай кассовый чек целиком',
  'unreadable':
      'Не получилось прочитать чек. Расправь его, включи свет и сними ближе',
  'empty': 'В чеке не нашлось товаров. Попробуй сфоткать ещё раз',
  'too_large': 'Фото слишком большое. Попробуй ещё раз',
  'bad_request': 'Не получилось отправить фото. Попробуй ещё раз',
  'rate_limit': 'Слишком много чеков подряд. Подожди минуту и попробуй снова',
  'unavailable': 'Сервис распознавания сейчас недоступен. Попробуй позже',
};

class ScanError implements Exception {
  final String message;
  ScanError(String code) : message = _errors[code] ?? _errors['unavailable']!;
}

/// Чек и уведомление для пользователя (или null).
Future<(Receipt, String?)> recognize(XFile photo) async {
  if (apiUrl.isEmpty) return (demoById('week')!, _demoNotice);

  final bytes = await photo.readAsBytes();
  if (bytes.length > 7 * 1024 * 1024) throw ScanError('too_large');
  final req = http.MultipartRequest('POST', Uri.parse('$apiUrl/api/scan'))
    ..files.add(
      http.MultipartFile.fromBytes(
        'photo',
        bytes,
        filename: 'receipt.jpg',
        contentType: MediaType('image', 'jpeg'),
      ),
    );

  http.Response res;
  try {
    res = await http.Response.fromStream(
      await req.send().timeout(const Duration(seconds: 60)),
    );
  } catch (_) {
    throw ScanError('unavailable');
  }
  Object? data;
  try {
    data = jsonDecode(utf8.decode(res.bodyBytes));
  } catch (_) {}
  if (res.statusCode != 200) {
    final code = data is Map && data['error'] is Map
        ? data['error']['code']
        : null;
    throw ScanError(
      code is String
          ? code
          : res.statusCode == 429
          ? 'rate_limit'
          : 'unavailable',
    );
  }
  try {
    final m = data as Map;
    return (Receipt.fromJson(m['receipt']), m['notice'] as String?);
  } catch (_) {
    throw ScanError('unavailable');
  }
}

// Клиент сервера «Чек-апа» (тот же сервер и та же БД, что у веб-версии).
// Адрес сервера задаётся при сборке:
//   flutter run --dart-define=API_URL=https://твой-сайт
// Без адреса приложение работает только локально: данные остаются на телефоне, а чеки — в демо-режиме.
import 'dart:convert';

import 'package:http/http.dart' as http;

/// SCAN_URL — старое имя, оставлено, чтобы прежние команды запуска не ломались.
const apiUrl = String.fromEnvironment(
  'API_URL',
  defaultValue: String.fromEnvironment('SCAN_URL'),
);

class ApiException implements Exception {
  final int status;
  final String code, message;
  const ApiException(this.status, this.code, this.message);
  @override
  String toString() => message;
}

class Api {
  static const _timeout = Duration(seconds: 25);

  static Future<Map<String, dynamic>> get(String path, {String? token}) =>
      _send('GET', path, token: token);
  static Future<Map<String, dynamic>> post(
    String path, {
    Object? body,
    String? token,
  }) => _send('POST', path, body: body, token: token);

  static Future<Map<String, dynamic>> _send(
    String method,
    String path, {
    Object? body,
    String? token,
  }) async {
    final req = http.Request(method, Uri.parse('$apiUrl$path'))
      ..headers['content-type'] = 'application/json'
      ..headers.addAll({if (token != null) 'authorization': 'Bearer $token'});
    if (body != null) req.body = jsonEncode(body);

    http.Response res;
    try {
      res = await http.Response.fromStream(await req.send().timeout(_timeout));
    } catch (_) {
      throw const ApiException(0, 'offline', 'Нет связи с сервером Чек-апа');
    }
    Object? data;
    try {
      data = jsonDecode(utf8.decode(res.bodyBytes));
    } catch (_) {}
    if (res.statusCode >= 200 &&
        res.statusCode < 300 &&
        data is Map<String, dynamic>)
      return data;
    final err = data is Map ? data['error'] : null;
    throw ApiException(
      res.statusCode,
      err is Map && err['code'] is String ? err['code'] : 'error',
      err is Map && err['message'] is String
          ? err['message']
          : 'Сервер ответил ошибкой (${res.statusCode})',
    );
  }
}

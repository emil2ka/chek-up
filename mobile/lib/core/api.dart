// Клиент сервера «Чек-апа» (тот же сервер и та же БД, что у веб-версии).
// Адрес сервера задаётся при сборке:
//   flutter run --dart-define=API_URL=https://твой-сайт
// Без адреса приложение работает только локально: данные остаются на телефоне, а чеки — в демо-режиме.
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart';

/// SCAN_URL — старое имя, оставлено, чтобы прежние команды запуска не ломались.
const _builtIn = String.fromEnvironment(
  'API_URL',
  defaultValue: String.fromEnvironment('SCAN_URL'),
);

@visibleForTesting
String? apiUrlOverride;
String get apiUrl => apiUrlOverride ?? _builtIn;

class ApiException implements Exception {
  final int status;
  final String code, message;
  const ApiException(this.status, this.code, this.message);
  @override
  String toString() => message;
}

class Api {
  static const _timeout = Duration(seconds: 25);

  static Future<Map<String, dynamic>> send(
    String method,
    String path, {
    Object? body,
    String? token,
  }) async {
    final req = http.Request(method, Uri.parse('$apiUrl$path'))
      ..headers['content-type'] = 'application/json'
      ..headers.addAll({if (token != null) 'authorization': 'Bearer $token'});
    if (body != null) req.body = jsonEncode(body);
    return _read(req, _timeout);
  }

  /// Чек: до трёх кадров и/или строка из QR.
  static Future<Map<String, dynamic>> scan(
    List<Uint8List> photos,
    String? qr, {
    String? token,
  }) {
    final req = http.MultipartRequest('POST', Uri.parse('$apiUrl/api/scan'))
      ..headers.addAll({if (token != null) 'authorization': 'Bearer $token'});
    for (final (i, b) in photos.indexed) {
      req.files.add(
        http.MultipartFile.fromBytes(
          'photo',
          b,
          filename: 'receipt-$i.jpg',
          contentType: MediaType('image', 'jpeg'),
        ),
      );
    }
    if (qr != null) req.fields['qr'] = qr;
    return _read(req, const Duration(seconds: 60));
  }

  static Future<Map<String, dynamic>> _read(
    http.BaseRequest req,
    Duration timeout,
  ) async {
    http.Response res;
    try {
      res = await http.Response.fromStream(
        await req.send().timeout(timeout),
      ).timeout(timeout);
    } catch (_) {
      throw const ApiException(0, 'offline', 'Нет связи с сервером');
    }
    Object? data;
    try {
      data = jsonDecode(utf8.decode(res.bodyBytes));
    } catch (_) {}
    if (res.statusCode >= 200 && res.statusCode < 300) {
      return data is Map<String, dynamic> ? data : const {};
    }
    final err = data is Map ? data['error'] : null;
    throw ApiException(
      res.statusCode,
      err is Map && err['code'] is String ? err['code'] : 'error',
      err is Map && err['message'] is String
          ? err['message']
          : 'Что-то пошло не так. Попробуй ещё раз',
    );
  }
}

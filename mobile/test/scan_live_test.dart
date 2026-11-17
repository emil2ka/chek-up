// Живая проверка распознавания через сервер «Чек-апа». Запуск:
//   flutter test test/scan_live_test.dart --dart-define=API_URL=http://localhost:5197 --dart-define=PHOTO=/путь/к/чеку.jpg
// Без API_URL тест пропускается.
import 'dart:io';

import 'package:chek_up/core/engine.dart';
import 'package:chek_up/core/api.dart';
import 'package:chek_up/core/scan.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image_picker/image_picker.dart';

const _photo = String.fromEnvironment('PHOTO');

void main() {
  test(
    'фото чека → чек с сахаром',
    () async {
      HttpOverrides.global =
          null; // в тестах Flutter сеть по умолчанию заглушена
      final (r, notice) = await recognize(XFile(_photo));
      final a = analyze(r);
      // ignore: avoid_print
      print(
        '${r.store}: ${r.items.length} позиций, ${money(a.total)}, ${a.cubes} кубиков, оценка ${a.score}, approx=${r.approx}, notice=$notice',
      );
      expect(r.items, isNotEmpty);
      expect(r.approx, isTrue);
      expect(notice, isNull);
    },
    skip: apiUrl.isEmpty || _photo.isEmpty ? 'нужны API_URL и PHOTO' : false,
    timeout: const Timeout(Duration(seconds: 90)),
  );
}

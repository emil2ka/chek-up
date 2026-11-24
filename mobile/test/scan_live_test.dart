// Живая проверка распознавания: фото → сервер → чек. Нужны работающий сервер с ключом и фото:
//   flutter test test/scan_live_test.dart --dart-define=API_URL=http://localhost:5197 --dart-define=PHOTO=/путь/к/чеку.jpg
import 'dart:io';

import 'package:chek_up/core/api.dart';
import 'package:chek_up/core/engine.dart';
import 'package:chek_up/core/scan.dart';
import 'package:chek_up/core/store.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

const _photo = String.fromEnvironment('PHOTO');

void main() {
  test(
    'чек читается через общий сервер, ручная позиция получает показатели',
    () async {
      SharedPreferences.setMockInitialValues({});
      await store.load();
      final r = await recognize([await File(_photo).readAsBytes()], null);
      final a = analyze(r.receipt);
      debugPrint(
        '${r.receipt.store}: ${r.receipt.items.length} поз., ${a.cubes} куб., оценка ${a.score}, ждут уточнения ${r.pending.length}',
      );
      expect(r.receipt.items, isNotEmpty);
      expect(r.receipt.approx, isTrue);
      final it = await itemByName('Кола 1 л', 600);
      expect((it.s, it.src), (106, 'ref'));
    },
    skip: apiUrl.isEmpty || _photo.isEmpty ? 'нужны API_URL и PHOTO' : false,
    timeout: const Timeout(Duration(seconds: 90)),
  );
}

// Язык интерфейса. Ключ перевода — сама русская строка (как в web/src/lib/i18n.ts), словарь общий с сайтом.
import 'kk.dart';

enum Lang { ru, kk }

Lang lang = Lang.ru;

final _var = RegExp(r'\{(\w+)\}');
String t(String ru, [Map<String, Object>? vars]) {
  final s = lang == Lang.kk ? (kk[ru] ?? ru) : ru;
  return vars == null
      ? s
      : s.replaceAllMapped(_var, (m) => '${vars[m[1]] ?? m[0]}');
}

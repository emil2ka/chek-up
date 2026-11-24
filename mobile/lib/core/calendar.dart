// Даты и недели (перенос web/src/lib/calendar.ts). Неделя — с понедельника по воскресенье по времени Казахстана (UTC+5),
// чтобы у всех участников семьи и на сервере границы недели совпадали.
import 'i18n.dart';

const _offset = Duration(hours: 5);

int nowMs() => DateTime.now().millisecondsSinceEpoch;

DateTime _utc(String iso) => DateTime.utc(
  int.parse(iso.substring(0, 4)),
  int.parse(iso.substring(5, 7)),
  int.parse(iso.substring(8, 10)),
);
String _iso(DateTime d) =>
    '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

/// YYYY-MM-DD в Казахстане для момента времени.
String todayIso([int? ms]) => _iso(
  DateTime.fromMillisecondsSinceEpoch(ms ?? nowMs(), isUtc: true).add(_offset),
);

final _isoRe = RegExp(r'^\d{4}-\d{2}-\d{2}$');
bool isIso(String s) => _isoRe.hasMatch(s) && _iso(_utc(s)) == s;
String addDays(String iso, int n) =>
    _iso(DateTime.utc(_utc(iso).year, _utc(iso).month, _utc(iso).day + n));

/// Сколько дней от a до b (b − a).
int daysBetween(String a, String b) => _utc(b).difference(_utc(a)).inDays;

/// 0 — понедельник … 6 — воскресенье.
int dowOf(String iso) => _utc(iso).weekday - 1;

/// Понедельник недели, в которую входит дата.
String weekOf(String iso) => addDays(iso, -dowOf(iso));
List<String> weekDays(String week) => [
  for (var i = 0; i < 7; i++) addDays(week, i),
];
String nextWeek(String w) => addDays(w, 7);

/// Момент (мс), когда заканчивается день в Казахстане.
int endOfDay(String iso) => _utc(
  iso,
).add(const Duration(days: 1)).subtract(_offset).millisecondsSinceEpoch;

const dowShort = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];
const monthsGen = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня', //
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];
const monthNames = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', //
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];

/// «16 ноября»
String dayTxt(String iso) => isIso(iso)
    ? '${int.parse(iso.substring(8, 10))} ${t(monthsGen[int.parse(iso.substring(5, 7)) - 1])}'
    : iso;

/// «16–22 ноября», «30 ноября – 6 декабря»
String weekTxt(String week) {
  final end = addDays(week, 6);
  return week.substring(0, 7) == end.substring(0, 7)
      ? '${int.parse(week.substring(8, 10))}–${dayTxt(end)}'
      : '${dayTxt(week)} – ${dayTxt(end)}';
}

String monthOf(String iso) => iso.substring(0, 7);

/// «Ноябрь 2026» из YYYY-MM
String monthTxt(String ym) {
  final m = t(monthNames[int.parse(ym.substring(5, 7)) - 1]);
  return lang == Lang.kk
      ? '${ym.substring(0, 4)} ж. ${m.toLowerCase()}'
      : '$m ${ym.substring(0, 4)}';
}

String addMonths(String ym, int n) => _iso(
  DateTime.utc(
    int.parse(ym.substring(0, 4)),
    int.parse(ym.substring(5, 7)) + n,
    1,
  ),
).substring(0, 7);
int daysInMonth(String ym) => DateTime.utc(
  int.parse(ym.substring(0, 4)),
  int.parse(ym.substring(5, 7)) + 1,
  0,
).day;

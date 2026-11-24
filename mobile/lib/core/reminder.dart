// Одно напоминание: в воскресенье в 18:00 по Казахстану, только если неделя ещё не закрыта. По умолчанию выключено.
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:timezone/data/latest_10y.dart' as tzdata;
import 'package:timezone/timezone.dart' as tz;

import 'calendar.dart';
import 'i18n.dart';
import 'store.dart';

const _key = 'chekup.reminder';
const _id = 1;

/// Когда напомнить: ближайшее воскресенье 18:00 (UTC+5), у которого неделя не закрыта. Время в мс UTC.
int nextReminder(int now, bool Function(String week) closed) {
  var week = weekOf(todayIso(now));
  for (;;) {
    // воскресенье 18:00 = конец воскресенья минус 6 часов
    final at = endOfDay(addDays(week, 6)) - 6 * 3600000;
    if (at > now && !closed(week)) return at;
    week = nextWeek(week);
  }
}

class Reminder extends ChangeNotifier {
  final _plugin = FlutterLocalNotificationsPlugin();
  bool on = false;
  bool _ready = false;
  int? _scheduled;

  bool get supported =>
      !kIsWeb &&
      (defaultTargetPlatform == TargetPlatform.iOS ||
          defaultTargetPlatform == TargetPlatform.android);

  Future<void> load() async {
    if (!supported) return;
    try {
      on = (await SharedPreferences.getInstance()).getBool(_key) ?? false;
    } catch (_) {
      /* останется выключенным */
    }
    store.addListener(refresh);
    await refresh();
  }

  Future<void> _init() async {
    if (_ready) return;
    tzdata.initializeTimeZones();
    await _plugin.initialize(
      settings: const InitializationSettings(
        android: AndroidInitializationSettings('@mipmap/ic_launcher'),
        iOS: DarwinInitializationSettings(
          requestAlertPermission: false,
          requestBadgePermission: false,
          requestSoundPermission: false,
        ),
      ),
    );
    _ready = true;
  }

  /// Включить: спрашиваем разрешение. false — человек отказал.
  Future<bool> set(bool value) async {
    if (value) {
      await _init();
      final ok =
          await _plugin
              .resolvePlatformSpecificImplementation<
                IOSFlutterLocalNotificationsPlugin
              >()
              ?.requestPermissions(alert: true, sound: true) ??
          await _plugin
              .resolvePlatformSpecificImplementation<
                AndroidFlutterLocalNotificationsPlugin
              >()
              ?.requestNotificationsPermission() ??
          false;
      if (!ok) return false;
    }
    on = value;
    (await SharedPreferences.getInstance()).setBool(_key, value);
    _scheduled = null;
    await refresh();
    notifyListeners();
    return true;
  }

  Future<void> refresh() async {
    if (!supported) return;
    try {
      if (!on) {
        if (_scheduled != null || _ready) {
          await _init();
          await _plugin.cancel(id: _id);
          _scheduled = null;
        }
        return;
      }
      final at = nextReminder(
        nowMs(),
        (w) => store.marks.any((m) => m.week == w && m.state != 'open'),
      );
      if (at == _scheduled) return;
      _scheduled = at;
      await _init();
      await _plugin.zonedSchedule(
        id: _id,
        title: t('Неделя почти закончилась'),
        body: t('Внеси оставшиеся чеки и закрой неделю. Это меньше минуты.'),
        scheduledDate: tz.TZDateTime.fromMillisecondsSinceEpoch(tz.UTC, at),
        notificationDetails: NotificationDetails(
          android: AndroidNotificationDetails(
            'week',
            t('Закрытие недели'),
            importance: Importance.defaultImportance,
          ),
          iOS: const DarwinNotificationDetails(),
        ),
        androidScheduleMode: AndroidScheduleMode.inexactAllowWhileIdle,
      );
    } catch (e) {
      debugPrint('Напоминание не поставилось: $e');
    }
  }
}

final reminder = Reminder();

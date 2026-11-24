// Оболочка: разделы с нижней навигацией, переходы «скан → результат», очередь чеков, правка.
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../core/i18n.dart';
import '../core/insights.dart';
import '../core/models.dart';
import '../core/outbox.dart';
import '../core/store.dart';
import '../ui/forms.dart';
import '../ui/kit.dart';
import 'account.dart';
import 'barcode.dart';
import 'catalog.dart';
import 'edit.dart';
import 'home.dart';
import 'onboarding.dart';
import 'profile.dart';
import 'result.dart';
import 'scan.dart';
import 'shop_list.dart';
import 'week.dart';

double tabBarSpace(BuildContext context) =>
    88 + MediaQuery.paddingOf(context).bottom;

Route<T> _route<T>(Widget page) => PageRouteBuilder<T>(
  transitionDuration: const Duration(milliseconds: 280),
  reverseTransitionDuration: const Duration(milliseconds: 220),
  pageBuilder: (_, _, _) => page,
  transitionsBuilder: (_, a, _, child) {
    final c = CurvedAnimation(parent: a, curve: const Cubic(.2, .8, .2, 1));
    return FadeTransition(
      opacity: c,
      child: SlideTransition(
        position: Tween(
          begin: const Offset(0, .04),
          end: Offset.zero,
        ).animate(c),
        child: child,
      ),
    );
  },
);

/// Главный навигатор: нужен уведомлениям о чеках, прочитанных в фоне.
final rootNav = GlobalKey<NavigatorState>();

// ── Переходы (их вызывают все экраны) ──
const _side = 2000.0; // px: текст чека читается, а файл в разы легче

Future<XFile?> _shoot() async {
  final picker = ImagePicker();
  try {
    return await picker.pickImage(
      source: ImageSource.camera,
      maxWidth: _side,
      maxHeight: _side,
      imageQuality: 85,
    );
  } catch (_) {
    // камеры нет (симулятор, компьютер) — берём фото из галереи
    try {
      return await picker.pickImage(
        source: ImageSource.gallery,
        maxWidth: _side,
        maxHeight: _side,
        imageQuality: 85,
      );
    } catch (_) {
      showToast(t('Не получилось открыть камеру'));
      return null;
    }
  }
}

void _scan(NavigatorState nav, List<XFile> photos) {
  nav.popUntil((r) => r.isFirst);
  nav.push(_route(ScanPage(photos: photos)));
}

Future<void> openCamera(BuildContext context) async {
  final nav = Navigator.of(context);
  final file = await _shoot();
  if (file != null) _scan(nav, [file]);
}

/// Доснять кадр длинного чека.
Future<XFile?> shootMore() => _shoot();

void scanAgain(NavigatorState nav, List<XFile> photos) => _scan(nav, photos);

Future<void> openGallery(BuildContext context) async {
  final nav = Navigator.of(context);
  List<XFile> files;
  try {
    files = await ImagePicker().pickMultiImage(
      maxWidth: _side,
      maxHeight: _side,
      imageQuality: 85,
    );
  } catch (_) {
    showToast(t('Не получилось открыть галерею'));
    return;
  }
  if (files.isEmpty) return;
  if (files.length == 1) {
    _scan(nav, files);
    return;
  }
  if (!context.mounted) return;
  final one = await showSheet<bool>(
    context,
    title: t('Выбрано фото: {n}', {'n': files.length}),
    builder: (context) => Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        FlatBtn(
          t('Это разные чеки'),
          primary: true,
          onTap: () => Navigator.pop(context, false),
        ),
        const SizedBox(height: 8),
        FlatBtn(
          t('Это один длинный чек'),
          onTap: files.length > 3 ? null : () => Navigator.pop(context, true),
        ),
        if (files.length > 3)
          Padding(
            padding: const EdgeInsets.all(8),
            child: Text(
              t('Длинный чек: до трёх кадров. Разных чеков за раз: до десяти.'),
              style: body(13, color: mute),
            ),
          ),
      ],
    ),
  );
  if (one == null) return;
  if (one) {
    _scan(nav, files);
    return;
  }
  for (final f in files.take(10)) {
    await outbox.enqueue([f.path], [await f.readAsBytes()]);
  }
  showToast(t('Чеки в очереди: читаю по одному, можно закрыть телефон'));
}

/// Внести чек руками; jobId — чек из очереди, который не прочитался.
Future<void> openManual(BuildContext context, {String? jobId}) async {
  final r = await editReceipt(context, receipt: blankReceipt(), manual: true);
  if (r == null) return;
  final s = store.saveReceipt(r.receipt, off: r.off);
  if (jobId != null) await outbox.remove(jobId);
  if (context.mounted) openSaved(context, s.id);
  if (s.duplicate) {
    showToast(t('Этот чек уже есть в журнале, второй раз не считаем'));
  }
}

void openDemo(BuildContext context, Receipt receipt) =>
    Navigator.of(context).push(_route(ScanPage(receipt: receipt)));

void openResult(NavigatorState nav, String id, {bool replace = false}) {
  final e = store.entry(id);
  if (e == null || receiptOf(e) == null) {
    showToast(t('Этот чек не получилось открыть'));
    return;
  }
  final route = _route<void>(ResultPage(entryId: id));
  replace ? nav.pushReplacement(route) : nav.push(route);
}

void openSaved(BuildContext context, String id) =>
    openResult(Navigator.of(context), id);

void openBarcode(BuildContext context) =>
    Navigator.of(context).push(_route(const BarcodePage()));
void openShopList(BuildContext context) =>
    Navigator.of(context).push(_route(const ShopListPage()));

const _asked = 'chekup.askedLogin';

/// после какого чека предлагаем войти
const _askAfter = 3;

class Shell extends StatefulWidget {
  const Shell({super.key});
  @override
  State<Shell> createState() => _ShellState();
}

class _ShellState extends State<Shell> {
  int _tab = 0;
  bool _replayIntro = false, _asking = false;

  static const _tabs = [
    (Icons.photo_camera_rounded, 'Чек'),
    (Icons.bar_chart_rounded, 'Неделя'),
    (Icons.search_rounded, 'Продукты'),
    (Icons.person_rounded, 'Профиль'),
  ];

  @override
  void initState() {
    super.initState();
    outbox.onBackground = (o) {
      if (o.kind == 'error') {
        showToast(scanErrorText(o.code));
      } else if (o.kind == 'demo') {
        showToast(t(o.notice ?? ''));
      } else {
        showToast(
          o.kind == 'duplicate'
              ? t('Этот чек уже есть в журнале')
              : t('Чек прочитан: {s}', {'s': o.receipt!.store}),
          action: (
            label: t('Открыть'),
            run: () {
              final nav = rootNav.currentState;
              if (nav != null) openResult(nav, o.entryId!);
            },
          ),
        );
      }
    };
    store.addListener(_maybeAsk);
  }

  @override
  void dispose() {
    store.removeListener(_maybeAsk);
    super.dispose();
  }

  /// После третьего чека один раз предлагаем войти, если вход подключён.
  Future<void> _maybeAsk() async {
    if (_asking ||
        !store.syncEnabled ||
        !store.profile.onboarded ||
        store.family.id.isEmpty ||
        store.family.me.email.isNotEmpty ||
        store.real.length < _askAfter) {
      return;
    }
    _asking = true;
    try {
      final sp = await SharedPreferences.getInstance();
      if (sp.getBool(_asked) ?? false) return;
      if (!await store.emailSignInAvailable()) return;
      // не перебиваем другой экран: спросим, когда человек на главной
      await Future<void>.delayed(const Duration(seconds: 2));
      if (!mounted || _tab != 0 || rootNav.currentState?.canPop() == true) {
        _asking = false;
        return;
      }
      await sp.setBool(_asked, true);
      if (mounted) await openSignIn(context);
    } catch (_) {
      _asking = false; // спросим в другой раз
    }
  }

  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: store,
    builder: (context, _) {
      final intro = !store.profile.onboarded || _replayIntro;
      final screen = switch (_tab) {
        0 => HomeScreen(onWeek: () => setState(() => _tab = 1)),
        1 => WeekScreen(onProfile: () => setState(() => _tab = 3)),
        2 => const CatalogScreen(),
        _ => ProfileScreen(
          onReplayIntro: () => setState(() => _replayIntro = true),
        ),
      };
      return Scaffold(
        resizeToAvoidBottomInset: false,
        body: DecoratedBox(
          decoration: const BoxDecoration(gradient: sky),
          child: Stack(
            children: [
              Positioned.fill(
                child: AnimatedSwitcher(
                  duration: const Duration(milliseconds: 240),
                  switchInCurve: const Cubic(.2, .8, .2, 1),
                  transitionBuilder: (child, a) => FadeTransition(
                    opacity: a,
                    child: SlideTransition(
                      position: Tween(
                        begin: const Offset(0, .03),
                        end: Offset.zero,
                      ).animate(a),
                      child: child,
                    ),
                  ),
                  child: KeyedSubtree(
                    key: ValueKey((_tab, store.profile.lang)),
                    child: screen,
                  ),
                ),
              ),
              Positioned(
                left: 12,
                right: 12,
                bottom: 10 + MediaQuery.paddingOf(context).bottom,
                child: _tabBar(),
              ),
              if (intro)
                Positioned.fill(
                  child: Onboarding(
                    onDone: () {
                      store.updateMe(onboarded: true);
                      setState(() => _replayIntro = false);
                    },
                  ),
                ),
            ],
          ),
        ),
      );
    },
  );

  Widget _tabBar() => Container(
    padding: const EdgeInsets.all(6),
    decoration: BoxDecoration(
      color: Colors.white,
      borderRadius: BorderRadius.circular(26),
      border: Border.all(color: line),
      boxShadow: [
        BoxShadow(
          color: ink.withValues(alpha: .5),
          blurRadius: 40,
          offset: const Offset(0, 16),
          spreadRadius: -10,
        ),
      ],
    ),
    child: Row(
      children: [
        for (var i = 0; i < _tabs.length; i++)
          Expanded(
            child: Press(
              scale: .93,
              label: t(_tabs[i].$2),
              onTap: () => setState(() => _tab = i),
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 220),
                curve: Curves.easeOutCubic,
                height: 52,
                decoration: BoxDecoration(
                  color: i == _tab ? tint : Colors.white,
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(
                      _tabs[i].$1,
                      size: 24,
                      color: i == _tab ? blue1 : mute,
                    ),
                    Text(
                      t(_tabs[i].$2),
                      maxLines: 1,
                      style: body(
                        12,
                        w: 800,
                        color: i == _tab ? blue1 : mute,
                        h: 1.2,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
      ],
    ),
  );
}

/// Прочитать снимки в память.
Future<List<Uint8List>> bytesOf(List<XFile> files) async => [
  for (final f in files) await f.readAsBytes(),
];

// Оболочка: разделы с нижней навигацией и переходы «скан → результат».
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../core/insights.dart';
import '../core/models.dart';
import '../core/store.dart';
import '../ui/kit.dart';
import 'barcode.dart';
import 'catalog.dart';
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
  pageBuilder: (_, __, ___) => page,
  transitionsBuilder: (_, a, __, child) {
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

// ── Переходы (их вызывают все экраны) ──
Future<void> openCamera(BuildContext context) async {
  final nav = Navigator.of(context);
  XFile? file;
  final picker = ImagePicker();
  try {
    file = await picker.pickImage(
      source: ImageSource.camera,
      maxWidth: 1600,
      maxHeight: 1600,
      imageQuality: 85,
    );
  } catch (_) {
    // камеры нет (симулятор, компьютер) — берём фото из галереи
    try {
      file = await picker.pickImage(
        source: ImageSource.gallery,
        maxWidth: 1600,
        maxHeight: 1600,
        imageQuality: 85,
      );
    } catch (_) {
      showToast('Не получилось открыть камеру');
    }
  }
  if (file == null) return;
  nav.popUntil((r) => r.isFirst);
  nav.push(_route(ScanPage(photo: file)));
}

void openDemo(BuildContext context, Receipt receipt) =>
    Navigator.of(context).push(_route(ScanPage(receipt: receipt)));

void openResult(
  NavigatorState nav,
  Receipt receipt,
  String id,
  List<int> swaps, {
  bool replace = false,
}) {
  final route = _route(ResultPage(receipt: receipt, entryId: id, swaps: swaps));
  replace ? nav.pushReplacement(route) : nav.push(route);
}

void openSaved(BuildContext context, String id) {
  final e = store.entry(id);
  final receipt = e == null ? null : receiptOf(e);
  if (e == null || receipt == null) {
    showToast('Этот чек не получилось открыть');
    return;
  }
  openResult(Navigator.of(context), receipt, e.id, e.swaps);
}

void openBarcode(BuildContext context) =>
    Navigator.of(context).push(_route(const BarcodePage()));
void openShopList(BuildContext context) =>
    Navigator.of(context).push(_route(const ShopListPage()));

class Shell extends StatefulWidget {
  const Shell({super.key});
  @override
  State<Shell> createState() => _ShellState();
}

class _ShellState extends State<Shell> {
  int _tab = 0;
  bool _replayIntro = false;

  static const _tabs = [
    (Icons.photo_camera_rounded, 'Чек'),
    (Icons.bar_chart_rounded, 'Неделя'),
    (Icons.search_rounded, 'Продукты'),
    (Icons.person_rounded, 'Профиль'),
  ];

  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: store,
    builder: (context, _) {
      final intro = !store.profile.onboarded || _replayIntro;
      final screen = switch (_tab) {
        0 => const HomeScreen(),
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
                  child: KeyedSubtree(key: ValueKey(_tab), child: screen),
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
                      store.updateProfile(
                        store.profile.copyWith(onboarded: true),
                      );
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
              label: _tabs[i].$2,
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
                      _tabs[i].$2,
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

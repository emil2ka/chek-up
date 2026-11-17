// «Проверь до кассы»: наведи камеру на штрихкод товара — увидишь его сахар кубиками ещё в магазине.
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import '../core/engine.dart';
import '../core/models.dart';
import '../core/off.dart';
import '../core/store.dart';
import '../ui/kit.dart';
import '../ui/pile.dart';
import '../ui/pile_hero.dart';

class BarcodePage extends StatefulWidget {
  const BarcodePage({super.key});
  @override
  State<BarcodePage> createState() => _BarcodePageState();
}

class _BarcodePageState extends State<BarcodePage> {
  final _code = TextEditingController();
  final _cam = MobileScannerController(
    formats: const [
      BarcodeFormat.ean13,
      BarcodeFormat.ean8,
      BarcodeFormat.upcA,
      BarcodeFormat.upcE,
    ],
  );
  bool _busy = false;
  String? _last;

  @override
  void dispose() {
    _code.dispose();
    _cam.dispose();
    super.dispose();
  }

  Future<void> _check(String code) async {
    code = code.trim();
    if (_busy || code.isEmpty) return;
    FocusScope.of(context).unfocus();
    setState(() => _busy = true);
    try {
      final p = await lookupBarcode(code);
      if (!mounted) return;
      thud();
      store.countBarcode();
      await showModalBottomSheet<void>(
        context: context,
        backgroundColor: Colors.transparent,
        barrierColor: ink.withValues(alpha: .58),
        isScrollControlled: true,
        builder: (_) => _ProductSheet(p),
      );
    } on ShelfError catch (e) {
      showToast(e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
      // тот же код можно будет считать снова через пару секунд
      Future.delayed(const Duration(seconds: 2), () => _last = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final mq = MediaQuery.of(context);
    final side = min(mq.size.width.clamp(0, 430) - 40.0, mq.size.height * .36);

    return Scaffold(
      resizeToAvoidBottomInset: false,
      body: DecoratedBox(
        decoration: const BoxDecoration(gradient: sky),
        child: Stack(
          fit: StackFit.expand,
          children: [
            const Glow(),
            SingleChildScrollView(
              padding: EdgeInsets.fromLTRB(
                20,
                mq.padding.top + 8,
                20,
                mq.viewInsets.bottom + mq.padding.bottom + 24,
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      BarButton(
                        Icons.arrow_back_ios_new_rounded,
                        'Назад',
                        () => Navigator.of(context).pop(),
                      ),
                      const SizedBox(width: 12),
                      Text(
                        'До кассы',
                        style: disp(22, w: 800, color: Colors.white),
                      ),
                    ],
                  ),
                  const SizedBox(height: 20),
                  Rise(
                    child: FittedBox(
                      fit: BoxFit.scaleDown,
                      alignment: Alignment.centerLeft,
                      child: Text(
                        'Проверь товар',
                        style: disp(34, color: Colors.white, h: 1, ls: -.045),
                      ),
                    ),
                  ),
                  Rise(
                    delay: 60,
                    child: FittedBox(
                      fit: BoxFit.scaleDown,
                      alignment: Alignment.centerLeft,
                      child: Row(
                        children: [
                          Text(
                            'по ',
                            style: disp(
                              34,
                              color: Colors.white,
                              h: 1,
                              ls: -.045,
                            ),
                          ),
                          Hl('штрихкоду', disp(34, h: 1, ls: -.045)),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 12),
                  Rise(
                    delay: 120,
                    child: Text(
                      'Наведи камеру на штрихкод прямо у полки — покажем сахар кубиками до покупки.',
                      style: body(
                        16,
                        color: Colors.white.withValues(alpha: .9),
                        h: 1.42,
                      ),
                    ),
                  ),
                  const SizedBox(height: 20),
                  Center(
                    child: Container(
                      width: side,
                      height: side * .72,
                      clipBehavior: Clip.antiAlias,
                      decoration: BoxDecoration(
                        color: ink,
                        borderRadius: BorderRadius.circular(28),
                        border: Border.all(color: Colors.white, width: 3),
                        boxShadow: [
                          BoxShadow(
                            color: ink.withValues(alpha: .45),
                            blurRadius: 30,
                            offset: const Offset(0, 20),
                            spreadRadius: -10,
                          ),
                        ],
                      ),
                      child: Stack(
                        fit: StackFit.expand,
                        children: [
                          MobileScanner(
                            controller: _cam,
                            onDetect: (cap) {
                              final v = cap.barcodes.isEmpty
                                  ? null
                                  : cap.barcodes.first.rawValue;
                              if (v == null || v == _last || _busy) return;
                              _last = v;
                              _check(v);
                            },
                            errorBuilder: (_, __) => Padding(
                              padding: const EdgeInsets.all(20),
                              child: Column(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  Icon(
                                    Icons.no_photography_rounded,
                                    color: Colors.white.withValues(alpha: .7),
                                    size: 34,
                                  ),
                                  const SizedBox(height: 10),
                                  Text(
                                    'Камера недоступна. Введи цифры под штрихкодом вручную.',
                                    textAlign: TextAlign.center,
                                    style: body(
                                      14,
                                      color: Colors.white.withValues(
                                        alpha: .85,
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                          if (_busy)
                            ColoredBox(
                              color: ink.withValues(alpha: .6),
                              child: const Center(
                                child: CircularProgressIndicator(
                                  color: Colors.white,
                                ),
                              ),
                            ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 22),
                  Text(
                    'Или введи цифры под штрихкодом',
                    style: body(
                      14,
                      w: 700,
                      color: Colors.white.withValues(alpha: .85),
                    ),
                  ),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      Expanded(
                        child: Container(
                          height: 56,
                          padding: const EdgeInsets.symmetric(horizontal: 16),
                          alignment: Alignment.center,
                          decoration: BoxDecoration(
                            color: Colors.white,
                            borderRadius: BorderRadius.circular(20),
                          ),
                          child: TextField(
                            controller: _code,
                            keyboardType: TextInputType.number,
                            inputFormatters: [
                              FilteringTextInputFormatter.digitsOnly,
                              LengthLimitingTextInputFormatter(14),
                            ],
                            onSubmitted: _check,
                            style: disp(17, w: 700, ls: .04),
                            cursorColor: blue1,
                            decoration: InputDecoration(
                              border: InputBorder.none,
                              isCollapsed: true,
                              hintText: '5449000000996',
                              hintStyle: disp(
                                17,
                                w: 500,
                                color: const Color(0xFFB0B7D2),
                                ls: .04,
                              ),
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Press(
                        scale: .92,
                        label: 'Проверить',
                        onTap: _busy ? null : () => _check(_code.text),
                        child: Container(
                          width: 56,
                          height: 56,
                          decoration: BoxDecoration(
                            color: Colors.white,
                            borderRadius: BorderRadius.circular(20),
                          ),
                          child: const Icon(
                            Icons.arrow_forward_rounded,
                            color: blue1,
                            size: 26,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 14),
                  Text(
                    'База — Open Food Facts. В ней сахар с этикетки целиком: и добавленный, и природный.',
                    style: body(
                      12,
                      color: Colors.white.withValues(alpha: .75),
                      h: 1.5,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ProductSheet extends StatelessWidget {
  final ShelfProduct p;
  const _ProductSheet(this.p);

  @override
  Widget build(BuildContext context) {
    final cubes = cubesOf(p.grams);
    final shown = min(cubes, 80);
    final tone = cubes <= 1
        ? Tone.good
        : cubes <= 5
        ? Tone.mid
        : Tone.bad;
    final say = switch (tone) {
      Tone.good => 'Можно брать',
      Tone.mid => 'Терпимо, но не каждый день',
      Tone.bad => 'Лучше оставить на полке',
    };
    final pct = (p.grams / dailyG * 100).round();
    final sub = [p.brand, p.quantity].where((s) => s.isNotEmpty).join(' · ');

    return Sheet(
      padding: EdgeInsets.fromLTRB(
        16,
        10,
        16,
        22 + MediaQuery.paddingOf(context).bottom,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Center(
            child: Container(
              width: 44,
              height: 5,
              decoration: BoxDecoration(
                color: line,
                borderRadius: BorderRadius.circular(3),
              ),
            ),
          ),
          const SizedBox(height: 16),
          Text(
            p.name,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: disp(22, h: 1.1, ls: -.035),
          ),
          if (sub.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text(sub, style: body(14, color: mute)),
            ),
          const SizedBox(height: 14),
          Container(
            height: 210,
            clipBehavior: Clip.antiAlias,
            decoration: BoxDecoration(
              gradient: sky,
              borderRadius: BorderRadius.circular(26),
            ),
            child: Stack(
              children: [
                Positioned.fill(
                  child: SugarPile(
                    target: shown,
                    cubeSize: (s) =>
                        cubeSize(s.width, s.height - 60, max(1, shown)),
                  ),
                ),
                Positioned(
                  left: 18,
                  top: 14,
                  child: IgnorePointer(
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Text(
                          '$cubes',
                          style: disp(54, color: Colors.white, ls: -.06),
                        ),
                        const SizedBox(width: 8),
                        Padding(
                          padding: const EdgeInsets.only(bottom: 8),
                          child: Text(
                            '${capOf(cubes)}\n${p.basis}',
                            style: body(
                              13,
                              w: 700,
                              color: Colors.white.withValues(alpha: .9),
                              h: 1.2,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
            decoration: BoxDecoration(
              color: toneColor(tone).withValues(alpha: .13),
              borderRadius: BorderRadius.circular(18),
            ),
            child: Row(
              children: [
                ToneDot(tone),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(say, style: body(16, w: 800)),
                      Text(
                        '${p.grams.round()} г сахара ${p.basis} — $pct% дневной нормы взрослого',
                        style: body(13, color: mute),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 10),
          Press(
            onTap: () => Navigator.pop(context),
            child: Container(
              height: 56,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: blue1,
                borderRadius: BorderRadius.circular(18),
              ),
              child: Text(
                'Проверить ещё товар',
                style: disp(15, w: 700, color: Colors.white, ls: -.01),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// Главный экран: заголовок, кнопки, живые кубики внизу, примеры и «Мои чеки».
import 'package:flutter/material.dart';

import '../core/data.dart';
import '../core/engine.dart';
import '../core/insights.dart';
import '../core/models.dart';
import '../core/store.dart';
import '../ui/kit.dart';
import '../ui/pile.dart';
import 'shell.dart';

const _homeCubes = 9;

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});
  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  final _pile = GlobalKey<SugarPileState>();
  final _hero = GlobalKey();
  bool _hint = false;

  void _tapStage(TapUpDetails d) {
    final box = _hero.currentContext?.findRenderObject() as RenderBox?;
    if (box != null)
      _pile.currentState?.tossAt(box.globalToLocal(d.globalPosition));
  }

  Future<void> _demo() async {
    final r = await showModalBottomSheet<Receipt>(
      context: context,
      backgroundColor: Colors.transparent,
      barrierColor: ink.withValues(alpha: .58),
      isScrollControlled: true,
      builder: (_) => const _DemoSheet(),
    );
    if (r != null && mounted) openDemo(context, r);
  }

  @override
  Widget build(BuildContext context) {
    final mq = MediaQuery.of(context);
    final entries = store.history;
    final has = entries.isNotEmpty;
    final left = store.shop.where((s) => !s.done).length;

    return LayoutBuilder(
      builder: (context, box) {
        final w = box.maxWidth;
        final cube = (w.clamp(0, 430) / 7.2).roundToDouble();
        final heroH = box.maxHeight - tabBarSpace(context) - (has ? 58 : 0);
        final short = heroH < 690;
        final h1 = disp(
          (w * (short ? .105 : .122)).clamp(
            short ? 34.0 : 38.0,
            short ? 46.0 : 53.0,
          ),
          color: Colors.white,
          h: .98,
          ls: -.045,
        );

        Widget headBtn(
          IconData icon,
          String label,
          VoidCallback onTap, {
          int badge = 0,
        }) => Press(
          scale: .9,
          label: label,
          onTap: onTap,
          child: Stack(
            clipBehavior: Clip.none,
            children: [
              Container(
                width: 46,
                height: 46,
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: .16),
                  borderRadius: BorderRadius.circular(15),
                  border: Border.all(
                    color: Colors.white.withValues(alpha: .35),
                    width: 1.5,
                  ),
                ),
                child: Icon(icon, color: Colors.white, size: 23),
              ),
              if (badge > 0)
                Positioned(
                  top: -5,
                  right: -5,
                  child: Container(
                    constraints: const BoxConstraints(minWidth: 20),
                    height: 20,
                    padding: const EdgeInsets.symmetric(horizontal: 5),
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Text(
                      '$badge',
                      style: disp(11, w: 800, color: blue1, ls: 0),
                    ),
                  ),
                ),
            ],
          ),
        );

        final hero = ConstrainedBox(
          constraints: BoxConstraints(minHeight: heroH),
          child: IntrinsicHeight(
            child: Stack(
              key: _hero,
              clipBehavior: Clip.none,
              children: [
                const Glow(),
                Positioned.fill(
                  child: SugarPile(
                    key: _pile,
                    // кубики четырёх цветов вперемешку: сахар, соль, жиры, калории
                    palettes: const [pileSugar, pileSalt, pileFat, pileKcal],
                    target: _homeCubes,
                    cubeSize: (_) => cube,
                    interactive: false,
                    onCount: (n) {
                      if (n >= _homeCubes && !_hint && mounted)
                        setState(() => _hint = true);
                    },
                  ),
                ),
                Padding(
                  padding: EdgeInsets.fromLTRB(20, mq.padding.top + 10, 20, 0),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      SizedBox(
                        height: 48,
                        child: Row(
                          children: [
                            const CubeIcon(30, angle: -8),
                            const SizedBox(width: 9),
                            Text(
                              'чек-ап',
                              style: disp(21, w: 800, color: Colors.white),
                            ),
                            const Spacer(),
                            headBtn(
                              Icons.qr_code_scanner_rounded,
                              'Проверить товар по штрихкоду',
                              () => openBarcode(context),
                            ),
                            const SizedBox(width: 8),
                            headBtn(
                              Icons.checklist_rounded,
                              'Список на следующий поход',
                              () => openShopList(context),
                              badge: left,
                            ),
                          ],
                        ),
                      ),
                      SizedBox(height: short ? 10 : 22),
                      Rise(child: Text('Что', style: h1)),
                      Rise(delay: 60, child: Hl('прячется', h1)),
                      Rise(delay: 120, child: Text('в твоём', style: h1)),
                      Rise(delay: 180, child: Text('чеке?', style: h1)),
                      SizedBox(height: short ? 12 : 18),
                      Rise(
                        delay: 220,
                        child: Text(
                          'Сфоткай чек из магазина. Покажем сахар, соль, жиры и калории кубиками, во сколько тебе обошлось вредное, и подскажем, чем заменить.',
                          style: body(
                            short ? 16 : 17,
                            color: Colors.white.withValues(alpha: .9),
                            h: 1.42,
                          ),
                        ),
                      ),
                      const SizedBox(height: 16),
                      Rise(
                        delay: 280,
                        child: Container(
                          padding: const EdgeInsets.fromLTRB(6, 6, 14, 6),
                          decoration: BoxDecoration(
                            color: ink.withValues(alpha: .18),
                            borderRadius: BorderRadius.circular(30),
                            border: Border.all(
                              color: Colors.white.withValues(alpha: .18),
                            ),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              const CubeIcon(24),
                              const SizedBox(width: 8),
                              Flexible(
                                child: Text(
                                  'Норма — около 10 кубиков в день по каждому показателю',
                                  style: body(
                                    13,
                                    color: Colors.white.withValues(alpha: .92),
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                      const Spacer(),
                      const SizedBox(height: 18),
                      Rise(
                        delay: 320,
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            WhiteButton(
                              'Сканировать чек',
                              icon: Icons.photo_camera_rounded,
                              badge: true,
                              onTap: () => openCamera(context),
                            ),
                            const SizedBox(height: 10),
                            GlassButton(
                              'Показать на примере',
                              icon: Icons.receipt_long_rounded,
                              onTap: _demo,
                            ),
                          ],
                        ),
                      ),
                      // сцена для кубиков: тап подбрасывает
                      GestureDetector(
                        behavior: HitTestBehavior.opaque,
                        onTapUp: _tapStage,
                        child: SizedBox(
                          height: cube * 2 + 46,
                          width: double.infinity,
                          child: Align(
                            alignment: Alignment.topCenter,
                            child: Padding(
                              padding: const EdgeInsets.only(top: 12),
                              child: AnimatedOpacity(
                                opacity: _hint ? 1 : 0,
                                duration: const Duration(milliseconds: 400),
                                child: Text(
                                  'Тапни по кубикам, наклони или встряхни телефон',
                                  style: body(
                                    13,
                                    color: Colors.white.withValues(alpha: .8),
                                  ),
                                ),
                              ),
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        );

        return SingleChildScrollView(
          padding: EdgeInsets.only(bottom: has ? 0 : tabBarSpace(context)),
          child: Column(
            children: [
              hero,
              if (has)
                _MyChecks(entries: entries, bottom: tabBarSpace(context)),
            ],
          ),
        );
      },
    );
  }
}

class _MyChecks extends StatelessWidget {
  final List<HistoryEntry> entries;
  final double bottom;
  const _MyChecks({required this.entries, required this.bottom});

  @override
  Widget build(BuildContext context) => Sheet(
    padding: EdgeInsets.fromLTRB(16, 22, 16, bottom + 16),
    child: Column(
      children: [
        SecTitle('Мои чеки', trailing: CountPill('${entries.length}')),
        for (final (i, e) in entries.indexed) ...[
          if (i > 0) const Divider(height: 1, color: line),
          Press(
            scale: .985,
            onTap: () => openSaved(context, e.id),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 12),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          e.store,
                          style: disp(16, w: 700, ls: -.02, h: 1.25),
                        ),
                        Text(
                          [
                            dateRu(e.date),
                            receiptOf(e)?.title ?? '',
                          ].where((s) => s.isNotEmpty).join(' · '),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: body(13, color: mute),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 12),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Text('${e.cubes}', style: disp(22)),
                      Text(
                        pl(e.cubes, cubesF),
                        style: body(12, w: 700, color: mute, h: 1.2),
                      ),
                    ],
                  ),
                  const SizedBox(width: 12),
                  Container(
                    height: 32,
                    padding: const EdgeInsets.symmetric(horizontal: 11),
                    decoration: BoxDecoration(
                      color: tint,
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: Row(
                      children: [
                        ToneDot(verdict(e.score).tone),
                        const SizedBox(width: 8),
                        Text('${e.score}', style: disp(14, w: 800, ls: 0)),
                      ],
                    ),
                  ),
                  const SizedBox(width: 6),
                  const Icon(
                    Icons.chevron_right_rounded,
                    color: mute,
                    size: 20,
                  ),
                ],
              ),
            ),
          ),
        ],
        const SizedBox(height: 14),
        Text(
          store.syncEnabled
              ? 'Хранится на этом телефоне и в твоём аккаунте'
              : 'Хранится только на этом телефоне',
          style: body(12, color: mute),
        ),
      ],
    ),
  );
}

class _DemoSheet extends StatelessWidget {
  const _DemoSheet();

  @override
  Widget build(BuildContext context) => Sheet(
    padding: EdgeInsets.fromLTRB(
      16,
      10,
      16,
      22 + MediaQuery.paddingOf(context).bottom,
    ),
    child: Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
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
        Padding(
          padding: const EdgeInsets.fromLTRB(4, 16, 0, 16),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'ДЕМО-ЧЕКИ',
                      style: body(
                        12,
                        w: 800,
                        color: blue1,
                      ).copyWith(letterSpacing: 1),
                    ),
                    const SizedBox(height: 6),
                    Text('Выбери пример', style: disp(27, ls: -.045)),
                  ],
                ),
              ),
              Press(
                scale: .92,
                label: 'Закрыть',
                onTap: () => Navigator.pop(context),
                child: Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    color: tint,
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: const Icon(Icons.close_rounded, color: ink, size: 22),
                ),
              ),
            ],
          ),
        ),
        for (final (i, r) in demoReceipts.indexed)
          Rise(
            delay: 80 + i * 60,
            ms: 420,
            child: Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: Builder(
                builder: (context) {
                  final a = analyze(r);
                  final v = verdict(a.score);
                  return Press(
                    scale: .975,
                    onTap: () => Navigator.pop(context, r),
                    child: Container(
                      padding: const EdgeInsets.fromLTRB(10, 10, 12, 10),
                      decoration: BoxDecoration(
                        color: tint,
                        borderRadius: BorderRadius.circular(24),
                      ),
                      child: Row(
                        children: [
                          Container(
                            width: 86,
                            height: 86,
                            decoration: BoxDecoration(
                              gradient: sky,
                              borderRadius: BorderRadius.circular(18),
                            ),
                            child: Column(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                Text(
                                  '${a.cubes}',
                                  style: disp(
                                    30,
                                    color: Colors.white,
                                    ls: -.05,
                                  ),
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  pl(a.cubes, cubesF),
                                  style: body(
                                    12,
                                    w: 700,
                                    color: Colors.white.withValues(alpha: .88),
                                    h: 1.1,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(width: 14),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  r.title,
                                  style: disp(16, w: 700, ls: -.02, h: 1.2),
                                ),
                                const SizedBox(height: 2),
                                Text(
                                  '${r.store} · ${dateRu(r.date)}',
                                  style: body(13, color: mute),
                                ),
                                const SizedBox(height: 6),
                                Row(
                                  children: [
                                    ToneDot(v.tone),
                                    const SizedBox(width: 8),
                                    Text(
                                      '${a.score}',
                                      style: disp(14, w: 800, ls: 0),
                                    ),
                                    Flexible(
                                      child: Text(
                                        '/100 · ${v.label}',
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                        style: body(12, w: 700, color: mute),
                                      ),
                                    ),
                                  ],
                                ),
                              ],
                            ),
                          ),
                          const Icon(
                            Icons.chevron_right_rounded,
                            color: blue1,
                            size: 24,
                          ),
                        ],
                      ),
                    ),
                  );
                },
              ),
            ),
          ),
      ],
    ),
  );
}

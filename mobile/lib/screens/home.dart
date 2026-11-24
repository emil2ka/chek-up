// Главный экран: заголовок, кнопки, живые кубики внизу, примеры и «Мои чеки».
import 'package:flutter/material.dart';

import '../core/data.dart';
import '../core/engine.dart';
import '../core/i18n.dart';
import '../core/insights.dart';
import '../core/models.dart';
import '../core/outbox.dart';
import '../core/plan.dart';
import '../core/store.dart';
import '../ui/forms.dart';
import '../ui/kit.dart';
import '../ui/metric_icon.dart';
import '../ui/pile.dart';
import '../ui/streak_view.dart';
import 'shell.dart';

const _homeCubes = 11;

class HomeScreen extends StatefulWidget {
  final VoidCallback onWeek;
  const HomeScreen({super.key, required this.onWeek});
  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  final _pile = GlobalKey<SugarPileState>();
  final _hero = GlobalKey();
  bool _hint = false;

  void _tapStage(TapUpDetails d) {
    final box = _hero.currentContext?.findRenderObject() as RenderBox?;
    if (box != null) {
      _pile.currentState?.tossAt(box.globalToLocal(d.globalPosition));
    }
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
    final entries = store.shown;
    final has = entries.isNotEmpty, mine = store.real.isNotEmpty;
    final left = store.shop.where((s) => !s.done).length;

    return LayoutBuilder(
      builder: (context, box) {
        final w = box.maxWidth;
        final cube = (w.clamp(0, 430) / 7.2).roundToDouble();
        final heroH = box.maxHeight - tabBarSpace(context) - (has ? 58 : 0);
        final short = heroH < 690;
        final h1 = disp(
          (w * (mine ? .08 : .114)).clamp(26.0, mine ? 33.0 : 49.0),
          color: Colors.white,
          h: 1,
          ls: -.045,
        );
        final week = weekStats(store.real, store.profile);
        final bought = week.metrics.values.any((m) => m.total > 0);

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
                    // все шесть фигурок
                    palettes: [
                      skinFor(store.streak.level),
                      for (final m in metricIds.skip(1)) pilePalettes[m]!,
                    ],
                    target: _homeCubes,
                    cubeSize: (_) => cube,
                    interactive: false,
                    onCount: (n) {
                      if (n >= _homeCubes && !_hint && mounted) {
                        setState(() => _hint = true);
                      }
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
                              t('Проверить товар по штрихкоду'),
                              () => openBarcode(context),
                            ),
                            const SizedBox(width: 8),
                            headBtn(
                              Icons.checklist_rounded,
                              t('Список на следующий поход'),
                              () => openShopList(context),
                              badge: left,
                            ),
                          ],
                        ),
                      ),
                      SizedBox(height: short ? 10 : 22),
                      Rise(
                        child: Wrap(
                          crossAxisAlignment: WrapCrossAlignment.center,
                          children: [
                            Text('${t('Узнай')} ', style: h1),
                            Hl(t('всё,'), h1),
                          ],
                        ),
                      ),
                      Rise(
                        delay: 90,
                        child: Text(t('что в твоих чеках'), style: h1),
                      ),
                      if (mine) ...[
                        const SizedBox(height: 14),
                        StreakPill(onTap: widget.onWeek),
                        if (bought) ...[
                          const SizedBox(height: 10),
                          Press(
                            scale: .985,
                            onTap: widget.onWeek,
                            child: SixRow(
                              totals: {
                                for (final m in metricIds)
                                  m: week.metrics[m]!.total,
                              },
                            ),
                          ),
                        ],
                      ] else ...[
                        SizedBox(height: short ? 12 : 18),
                        Rise(
                          delay: 220,
                          child: Text(
                            t(
                              'Сфоткай чек: покажем, что внутри покупок, сколько ушло денег и что взять вместо.',
                            ),
                            style: body(
                              short ? 16 : 17,
                              color: Colors.white.withValues(alpha: .9),
                              h: 1.42,
                            ),
                          ),
                        ),
                        const SizedBox(height: 16),
                        const Rise(delay: 280, child: SixRow()),
                      ],
                      const _Queue(),
                      const Spacer(),
                      const SizedBox(height: 18),
                      Rise(
                        delay: 320,
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            WhiteButton(
                              t('Сфоткать чек'),
                              icon: Icons.photo_camera_rounded,
                              badge: true,
                              onTap: () => openCamera(context),
                            ),
                            const SizedBox(height: 10),
                            Row(
                              children: [
                                Expanded(
                                  child: GlassButton(
                                    t('Из галереи'),
                                    icon: Icons.photo_library_rounded,
                                    height: 52,
                                    onTap: () => openGallery(context),
                                  ),
                                ),
                                const SizedBox(width: 10),
                                Expanded(
                                  child: GlassButton(
                                    t('Вручную'),
                                    icon: Icons.edit_rounded,
                                    height: 52,
                                    onTap: () => openManual(context),
                                  ),
                                ),
                              ],
                            ),
                            if (!mine)
                              Press(
                                onTap: _demo,
                                child: Padding(
                                  padding: const EdgeInsets.only(
                                    top: 13,
                                    bottom: 8,
                                  ),
                                  child: Text(
                                    t('Показать на примере'),
                                    textAlign: TextAlign.center,
                                    style: body(15, w: 700, color: Colors.white)
                                        .copyWith(
                                          decoration: TextDecoration.underline,
                                          decorationColor: Colors.white54,
                                        ),
                                  ),
                                ),
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
                                  t('Тапни по фигуркам или наклони телефон'),
                                  textAlign: TextAlign.center,
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
                _MyChecks(
                  entries: entries,
                  bottom: tabBarSpace(context),
                  onAll: widget.onWeek,
                ),
            ],
          ),
        );
      },
    );
  }
}

/// Очередь чеков: читается, ждёт сети, не прочитался.
class _Queue extends StatelessWidget {
  const _Queue();
  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: outbox,
    builder: (context, _) => Column(
      children: [
        for (final j in outbox.jobs)
          Container(
            margin: const EdgeInsets.only(top: 10),
            padding: const EdgeInsets.fromLTRB(14, 10, 8, 10),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(20),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  children: [
                    Icon(
                      j.status == 'work'
                          ? Icons.receipt_long_rounded
                          : Icons.schedule_rounded,
                      color: j.status == 'error' ? bad : blue1,
                      size: 22,
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Text(
                        j.status == 'work'
                            ? t('Читаю чек…')
                            : j.status == 'error'
                            ? scanErrorText(j.error)
                            : j.error != null
                            ? t('Чек в очереди: прочитаем, когда появится связь')
                            : t('Чек в очереди'),
                        style: body(14, w: 700),
                      ),
                    ),
                    if (j.status != 'work')
                      IconButton(
                        onPressed: () => outbox.remove(j.id),
                        tooltip: t('Убрать чек из очереди'),
                        icon: const Icon(
                          Icons.delete_outline_rounded,
                          color: mute,
                          size: 21,
                        ),
                      ),
                  ],
                ),
                if (j.status != 'work' && j.error != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 6, right: 6),
                    child: Row(
                      children: [
                        Expanded(
                          child: FlatBtn(
                            t('Повторить'),
                            primary: true,
                            height: 44,
                            onTap: () => outbox.retry(j.id),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: FlatBtn(
                            t('Внести вручную'),
                            height: 44,
                            onTap: () => openManual(context, jobId: j.id),
                          ),
                        ),
                      ],
                    ),
                  ),
              ],
            ),
          ),
      ],
    ),
  );
}

class _MyChecks extends StatelessWidget {
  static const _limit = 6;
  final List<HistoryEntry> entries;
  final double bottom;
  final VoidCallback onAll;
  const _MyChecks({
    required this.entries,
    required this.bottom,
    required this.onAll,
  });

  @override
  Widget build(BuildContext context) {
    final list = [...entries]
      ..sort((a, b) {
        final d = b.date.compareTo(a.date);
        return d != 0 ? d : b.savedAt - a.savedAt;
      });
    return Sheet(
      padding: EdgeInsets.fromLTRB(16, 22, 16, bottom + 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SecTitle(t('Мои чеки'), trailing: CountPill('${entries.length}')),
          for (final (i, e) in list.take(_limit).indexed) ...[
            if (i > 0) const Divider(height: 1, color: line),
            _row(context, e),
          ],
          if (entries.length > _limit) ...[
            const SizedBox(height: 8),
            FlatBtn(t('Все чеки в журнале'), color: blue1, onTap: onAll),
          ],
        ],
      ),
    );
  }

  Widget _row(BuildContext context, HistoryEntry e) {
    final r = receiptOf(e);
    final a = r == null ? null : factOf(e, r);
    final score = a == null || r!.masked ? e.score : a.score;
    return Press(
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
                  Row(
                    children: [
                      Flexible(
                        child: Text(
                          e.store,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: disp(16, w: 700, ls: -.02, h: 1.25),
                        ),
                      ),
                      if (e.priv)
                        const Padding(
                          padding: EdgeInsets.only(left: 5),
                          child: Icon(
                            Icons.lock_rounded,
                            color: mute,
                            size: 15,
                          ),
                        ),
                    ],
                  ),
                  Text(
                    [
                      dateRu(e.date),
                      if (isDemo(e))
                        t('пример')
                      else if (r?.refund ?? false)
                        t('возврат')
                      else if (a != null && !store.isChild && !r!.masked)
                        money(a.total),
                    ].join(' · '),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: body(13, color: mute),
                  ),
                  if (a != null) ...[
                    const SizedBox(height: 2),
                    MetricLine(a.totals),
                  ],
                ],
              ),
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
                  ToneDot(verdict(score).tone),
                  const SizedBox(width: 8),
                  Text('$score', style: disp(14, w: 800, ls: 0)),
                ],
              ),
            ),
            const SizedBox(width: 6),
            const Icon(Icons.chevron_right_rounded, color: mute, size: 20),
          ],
        ),
      ),
    );
  }
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
                      t('Демо-чеки').toUpperCase(),
                      style: body(
                        12,
                        w: 800,
                        color: blue1,
                      ).copyWith(letterSpacing: 1),
                    ),
                    const SizedBox(height: 6),
                    Text(t('Выбери пример'), style: disp(27, ls: -.045)),
                  ],
                ),
              ),
              Press(
                scale: .92,
                label: t('Закрыть'),
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

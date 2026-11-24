// «Профиль»: состав семьи и норма, достижения, справка и очистка истории.
import 'package:flutter/material.dart';

import '../core/cart.dart';
import '../core/engine.dart';
import '../core/i18n.dart';
import '../core/insights.dart';
import '../core/models.dart';
import '../core/reminder.dart';
import '../core/store.dart';
import '../ui/forms.dart';
import '../ui/kit.dart';
import '../ui/metric_icon.dart';
import 'account.dart';
import 'shell.dart';

const _badgeIcons = {
  'receipt': Icons.receipt_long_rounded,
  'stack': Icons.layers_rounded,
  'swap': Icons.swap_horiz_rounded,
  'leaf': Icons.eco_rounded,
  'flame': Icons.local_fire_department_rounded,
  'coin': Icons.savings_rounded,
  'minus': Icons.remove_circle_outline_rounded,
  'shield': Icons.verified_user_rounded,
  'crown': Icons.workspace_premium_rounded,
  'barcode': Icons.qr_code_scanner_rounded,
  'list': Icons.checklist_rounded,
};

class ProfileScreen extends StatefulWidget {
  final VoidCallback onReplayIntro;
  const ProfileScreen({super.key, required this.onReplayIntro});
  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  String? _picked;
  bool _how = false, _confirm = false;

  Widget _normTile(Profile p, MetricId m) => Container(
    padding: const EdgeInsets.all(10),
    decoration: BoxDecoration(
      color: Colors.white.withValues(alpha: .12),
      borderRadius: BorderRadius.circular(16),
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        FittedBox(
          child: Text(
            bigNum(familyDaily(p, m), m),
            style: disp(20, color: Colors.white, ls: -.05),
          ),
        ),
        const SizedBox(height: 4),
        Row(
          children: [
            MetricIcon(m, 20),
            const SizedBox(width: 5),
            Expanded(
              child: Text(
                m == MetricId.kcal
                    ? t('Ккал')
                    : '${t(m == MetricId.carbs ? 'Углев.' : metrics[m]!.label)}, ${isCubeMetric(m) ? t('куб.') : t(metrics[m]!.unit)}',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: body(
                  13,
                  w: 700,
                  color: Colors.white.withValues(alpha: .88),
                ),
              ),
            ),
          ],
        ),
      ],
    ),
  );

  @override
  Widget build(BuildContext context) {
    final mq = MediaQuery.of(context);
    final p = store.profile;
    final list = store.badgeList;
    final done = list.where((b) => b.done).length;
    final week = familyDailyCubes(p) * 7;
    final child = store.isChild;
    final picked = list.where((b) => b.id == _picked).firstOrNull;
    final n = store.history.where((e) => store.isMine(e) || isDemo(e)).length;

    return SingleChildScrollView(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          ClipRect(
            child: Stack(
              children: [
                const Glow(),
                Padding(
                  padding: EdgeInsets.fromLTRB(20, mq.padding.top + 16, 20, 28),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Rise(
                        child: Text(
                          store.family.me.name.isEmpty
                              ? t('Профиль')
                              : store.family.me.name,
                          style: disp(22, w: 800, color: Colors.white),
                        ),
                      ),
                      const SizedBox(height: 20),
                      Rise(
                        delay: 60,
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.end,
                          children: [
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    t('Ориентиры на день для семьи'),
                                    style: body(
                                      15,
                                      color: Colors.white.withValues(
                                        alpha: .85,
                                      ),
                                    ),
                                  ),
                                  const SizedBox(height: 12),
                                  for (final row in [
                                    metricIds.take(3),
                                    metricIds.skip(3),
                                  ])
                                    Padding(
                                      padding: const EdgeInsets.only(bottom: 8),
                                      child: Row(
                                        children: [
                                          for (final (i, m) in row.indexed) ...[
                                            if (i > 0) const SizedBox(width: 8),
                                            Expanded(child: _normTile(p, m)),
                                          ],
                                        ],
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
                ),
              ],
            ),
          ),
          Sheet(
            padding: EdgeInsets.fromLTRB(14, 24, 14, tabBarSpace(context) + 16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // ── состав ──
                SecTitle(t('Кто ест из корзины')),
                IgnorePointer(
                  ignoring: child,
                  child: Opacity(
                    opacity: child ? .6 : 1,
                    child: Column(
                      children: [
                        StepperRow(
                          label: t('Взрослые'),
                          hint: t('до {a} г сахара и {b} г соли в день', {
                            'a': metrics[MetricId.sugar]!.adult.round(),
                            'b': metrics[MetricId.salt]!.adult.round(),
                          }),
                          value: p.adults,
                          min: 1,
                          max: maxAdults,
                          onChange: (v) => store.updateFamily(adults: v),
                        ),
                        const SizedBox(height: 8),
                        StepperRow(
                          label: t('Дети'),
                          hint: t('до {a} г сахара и {b} г соли в день', {
                            'a': metrics[MetricId.sugar]!.kid.round(),
                            'b': metrics[MetricId.salt]!.kid.round(),
                          }),
                          value: p.kids,
                          min: 0,
                          max: maxKids,
                          onChange: (v) => store.updateFamily(kids: v),
                        ),
                      ],
                    ),
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(4, 12, 4, 0),
                  child: Text(
                    child
                        ? t('Состав семьи меняет взрослый.')
                        : t('На неделю это до {n} {w} сахара.', {
                            'n': week,
                            'w': pl(week, cubesF),
                          }),
                    style: body(14, color: mute),
                  ),
                ),
                // ── достижения ──
                const SizedBox(height: 32),
                SecTitle(
                  t('Достижения'),
                  trailing: CountPill('$done ${t('из')} ${list.length}'),
                ),
                GridView.count(
                  crossAxisCount: 3,
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  padding: EdgeInsets.zero,
                  mainAxisSpacing: 8,
                  crossAxisSpacing: 8,
                  childAspectRatio: .86,
                  children: [
                    for (final b in list)
                      Press(
                        scale: .95,
                        label:
                            '${t(b.title)}: ${b.done ? t('получено') : t('ещё нет')}. ${t(b.desc)}',
                        onTap: () => setState(
                          () => _picked = _picked == b.id ? null : b.id,
                        ),
                        child: AnimatedContainer(
                          duration: const Duration(milliseconds: 180),
                          padding: const EdgeInsets.fromLTRB(6, 14, 6, 8),
                          decoration: BoxDecoration(
                            color: _picked == b.id ? tintHi : tint,
                            borderRadius: BorderRadius.circular(24),
                          ),
                          child: Column(
                            children: [
                              Container(
                                width: 56,
                                height: 56,
                                decoration: BoxDecoration(
                                  gradient: b.done ? sky : null,
                                  color: b.done ? null : Colors.white,
                                  borderRadius: BorderRadius.circular(18),
                                  border: b.done
                                      ? null
                                      : Border.all(color: line, width: 1.5),
                                  boxShadow: b.done
                                      ? [
                                          BoxShadow(
                                            color: blue1.withValues(alpha: .5),
                                            blurRadius: 18,
                                            offset: const Offset(0, 10),
                                            spreadRadius: -8,
                                          ),
                                        ]
                                      : null,
                                ),
                                child: Icon(
                                  _badgeIcons[b.icon],
                                  size: 28,
                                  color: b.done
                                      ? Colors.white
                                      : const Color(0xFFB0B7D2),
                                ),
                              ),
                              const SizedBox(height: 8),
                              Expanded(
                                child: Text(
                                  t(b.title),
                                  textAlign: TextAlign.center,
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                  style: body(
                                    12,
                                    w: 800,
                                    color: b.done ? ink : mute,
                                    h: 1.2,
                                  ),
                                ),
                              ),
                              if (b.progress != null && !b.done)
                                ClipRRect(
                                  borderRadius: BorderRadius.circular(3),
                                  child: SizedBox(
                                    width: 48,
                                    height: 6,
                                    child: LinearProgressIndicator(
                                      value: b.progress!.$1 / b.progress!.$2,
                                      backgroundColor: Colors.white,
                                      color: blue2,
                                    ),
                                  ),
                                ),
                            ],
                          ),
                        ),
                      ),
                  ],
                ),
                Container(
                  margin: const EdgeInsets.only(top: 12),
                  padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
                  constraints: const BoxConstraints(minHeight: 44),
                  decoration: BoxDecoration(
                    color: tint,
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: picked == null
                      ? Text(
                          t('Нажми на значок, чтобы узнать, как его получить.'),
                          style: body(14, color: mute),
                        )
                      : Text.rich(
                          TextSpan(
                            children: [
                              TextSpan(
                                text: '${t(picked.title)}. ',
                                style: body(14, w: 800),
                              ),
                              TextSpan(
                                text:
                                    '${t(picked.desc)}. ${picked.done
                                        ? t('Получено.')
                                        : picked.progress != null
                                        ? t('Сейчас {a} из {b}.', {'a': picked.progress!.$1, 'b': picked.progress!.$2})
                                        : ''}',
                              ),
                            ],
                          ),
                          style: body(14),
                        ),
                ),
                const SizedBox(height: 32),
                const AccountSection(),
                // ── приложение ──
                const SizedBox(height: 28),
                SecTitle(t('Приложение')),
                Segmented(
                  value: p.lang,
                  options: const [('ru', 'Русский'), ('kk', 'Қазақша')],
                  onChange: (v) => store.updateMe(lang: v),
                ),
                const SizedBox(height: 8),
                if (reminder.supported)
                  ListenableBuilder(
                    listenable: reminder,
                    builder: (context, _) => SwitchRow(
                      t('Напомнить закрыть неделю'),
                      hint: t('в воскресенье в 18:00, если она ещё открыта'),
                      value: reminder.on,
                      onChanged: (v) async {
                        if (!await reminder.set(v)) {
                          showToast(
                            t('Разреши уведомления в настройках телефона'),
                          );
                        }
                      },
                    ),
                  ),
                RowBtn(
                  t('Список на следующий поход'),
                  icon: Icons.checklist_rounded,
                  onTap: () => openShopList(context),
                ),
                RowBtn(
                  t('Как считаем'),
                  icon: Icons.info_outline_rounded,
                  onTap: () => setState(() => _how = !_how),
                  trailing: AnimatedRotation(
                    turns: _how ? .25 : 0,
                    duration: const Duration(milliseconds: 200),
                    child: const Icon(
                      Icons.chevron_right_rounded,
                      color: mute,
                      size: 22,
                    ),
                  ),
                ),
                AnimatedSize(
                  duration: const Duration(milliseconds: 240),
                  curve: Curves.easeOutCubic,
                  alignment: Alignment.topCenter,
                  child: !_how
                      ? const SizedBox(width: double.infinity)
                      : Padding(
                          padding: const EdgeInsets.fromLTRB(14, 4, 14, 12),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              for (final text in [
                                t(
                                  'Оценка от 0 до 100 не зависит от размера корзины: сахар, соль и жиры сравниваем с калориями, вредное и алкоголь с суммой на еду. Запасы вроде сахара и масла делим на недели.',
                                ),
                                t(
                                  'Замены в чеке это план. В экономию и минус кубиков они попадут, когда следующий чек подтвердит покупку.',
                                ),
                                t(
                                  'Стрик: неделя засчитана, если отмечено, что внесены все чеки или что покупок не было. Прошлую неделю можно закрыть до вечера понедельника. За четыре недели даётся заморозка на пропуск, запас до двух.',
                                ),
                                '${t(unitsNote)} ${t('Сахар только добавленный, из цельных фруктов не считаем.')}',
                                t(
                                  'Цифры примерные: это ориентир для покупок, а не медицинская рекомендация.',
                                ),
                              ])
                                Padding(
                                  padding: const EdgeInsets.only(bottom: 8),
                                  child: Text(text, style: body(15)),
                                ),
                            ],
                          ),
                        ),
                ),
                RowBtn(
                  t('Показать знакомство заново'),
                  icon: Icons.replay_rounded,
                  onTap: widget.onReplayIntro,
                ),
                if (_confirm)
                  ConfirmBox(
                    text: t('Удалить {n} {w}? Вернуть их не получится.', {
                      'n': n,
                      'w': pl(n, receiptsF),
                    }),
                    no: t('Оставить'),
                    yes: t('Удалить'),
                    onNo: () => setState(() => _confirm = false),
                    onYes: () {
                      setState(() => _confirm = false);
                      store.clearMine();
                      carts.clear();
                      showToast(t('Твои чеки удалены'));
                    },
                  )
                else
                  RowBtn(
                    t('Удалить все мои чеки'),
                    icon: Icons.delete_outline_rounded,
                    iconColor: bad,
                    onTap: n == 0
                        ? null
                        : () => setState(() => _confirm = true),
                    trailing: const SizedBox.shrink(),
                  ),
                const SizedBox(height: 18),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 4),
                  child: Text(
                    t(
                      'Чек-ап, версия {v}. Чеки и профиль хранятся на этом устройстве и в твоём аккаунте на сервере. Фото чеков не храним. Оценки примерные и не заменяют консультацию врача.',
                      {'v': '0.2'},
                    ),
                    style: body(12, color: mute, h: 1.5),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

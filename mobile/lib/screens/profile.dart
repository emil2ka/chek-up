// «Профиль»: состав семьи и норма, достижения, справка и очистка истории.
import 'package:flutter/material.dart';

import '../core/engine.dart';
import '../core/store.dart';
import '../ui/kit.dart';
import 'shell.dart';
import 'sync_section.dart';

const _badgeIcons = {
  'receipt': Icons.receipt_long_rounded,
  'stack': Icons.layers_rounded,
  'swap': Icons.swap_horiz_rounded,
  'leaf': Icons.eco_rounded,
  'bomb': Icons.local_fire_department_rounded,
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

  @override
  Widget build(BuildContext context) {
    final mq = MediaQuery.of(context);
    final p = store.profile;
    final list = store.badgeList;
    final done = list.where((b) => b.done).length;
    final normCubes = familyDailyCubes(p), normG = familyDailyG(p);
    final picked = list.where((b) => b.id == _picked).firstOrNull;
    final n = store.history.length;

    Widget row(
      IconData icon,
      String text,
      VoidCallback? onTap, {
      Color iconColor = blue1,
      Widget? trailing,
    }) => Press(
      scale: .985,
      onTap: onTap,
      child: Container(
        constraints: const BoxConstraints(minHeight: 60),
        padding: const EdgeInsets.symmetric(horizontal: 14),
        decoration: BoxDecoration(
          color: tint,
          borderRadius: BorderRadius.circular(20),
        ),
        child: Row(
          children: [
            Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Icon(icon, color: iconColor, size: 21),
            ),
            const SizedBox(width: 12),
            Expanded(child: Text(text, style: body(16, w: 700))),
            trailing ??
                const Icon(Icons.chevron_right_rounded, color: mute, size: 22),
          ],
        ),
      ),
    );

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
                          'Профиль',
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
                                    'Норма твоей семьи',
                                    style: body(
                                      15,
                                      color: Colors.white.withValues(
                                        alpha: .85,
                                      ),
                                    ),
                                  ),
                                  const SizedBox(height: 4),
                                  Text(
                                    '$normCubes',
                                    style: disp(
                                      84,
                                      color: Colors.white,
                                      h: .95,
                                      ls: -.06,
                                    ),
                                  ),
                                  const SizedBox(height: 6),
                                  Text(
                                    '${pl(normCubes, cubesF)} в день',
                                    style: disp(
                                      17,
                                      w: 500,
                                      color: Colors.white,
                                      ls: -.01,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            const Padding(
                              padding: EdgeInsets.only(bottom: 8),
                              child: CubeIcon(96, angle: 12),
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
                // ── семья ──
                const SecTitle('Кто ест из корзины'),
                StepperRow(
                  label: 'Взрослые',
                  hint: 'до $adultG г сахара в день',
                  value: p.adults,
                  min: 1,
                  max: maxAdults,
                  onChange: (v) => store.updateProfile(p.copyWith(adults: v)),
                ),
                const SizedBox(height: 8),
                StepperRow(
                  label: 'Дети',
                  hint: 'до $kidG г в день',
                  value: p.kids,
                  min: 0,
                  max: maxKids,
                  onChange: (v) => store.updateProfile(p.copyWith(kids: v)),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(4, 12, 4, 0),
                  child: Text(
                    'На всю семью выходит до $normG г добавленного сахара в день, или ${normCubes * 7} ${pl(normCubes * 7, cubesF)} в неделю. С этой нормой сравнивается раздел «Неделя».',
                    style: body(14, color: mute),
                  ),
                ),
                // ── достижения ──
                const SizedBox(height: 32),
                SecTitle(
                  'Достижения',
                  trailing: CountPill('$done из ${list.length}'),
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
                            '${b.title}: ${b.done ? 'получено' : 'ещё нет'}. ${b.desc}',
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
                                  b.title,
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
                          'Нажми на значок, чтобы узнать, как его получить.',
                          style: body(14, color: mute),
                        )
                      : Text.rich(
                          TextSpan(
                            children: [
                              TextSpan(
                                text: '${picked.title}. ',
                                style: body(14, w: 800),
                              ),
                              TextSpan(
                                text:
                                    '${picked.desc}${picked.progress != null && !picked.done ? ' — ${picked.progress!.$1} из ${picked.progress!.$2}' : ''}${picked.done ? ' — получено.' : '.'}',
                              ),
                            ],
                          ),
                          style: body(14),
                        ),
                ),
                // ── один аккаунт ──
                const SizedBox(height: 32),
                const SecTitle('Один аккаунт'),
                const SyncSection(),
                // ── приложение ──
                const SizedBox(height: 32),
                const SecTitle('Приложение'),
                row(
                  Icons.checklist_rounded,
                  'Список на следующий поход',
                  () => openShopList(context),
                ),
                const SizedBox(height: 8),
                row(
                  Icons.info_outline_rounded,
                  'Как считается оценка',
                  () => setState(() => _how = !_how),
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
                          padding: const EdgeInsets.fromLTRB(14, 12, 14, 4),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'Оценка корзины — от 0 до 100. Её снижают две вещи: доля вредных товаров в сумме чека и количество добавленного сахара.',
                                style: body(15),
                              ),
                              const SizedBox(height: 6),
                              Text(
                                'Сахар показываем кубиками: 1 кубик = $cubeG г. Считается только добавленный сахар; сахар в целых фруктах, овощах и молоке не учитывается.',
                                style: body(15),
                              ),
                              const SizedBox(height: 6),
                              Text(
                                'Цифры примерные: это ориентир для покупок, а не медицинская рекомендация.',
                                style: body(15, color: mute),
                              ),
                            ],
                          ),
                        ),
                ),
                const SizedBox(height: 8),
                row(
                  Icons.replay_rounded,
                  'Показать знакомство заново',
                  widget.onReplayIntro,
                ),
                const SizedBox(height: 8),
                if (_confirm)
                  Container(
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: bad.withValues(alpha: .1),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Text(
                          'Удалить $n ${pl(n, receiptsF)} из истории? Вернуть их не получится.',
                          style: body(15, w: 700),
                        ),
                        const SizedBox(height: 12),
                        Row(
                          children: [
                            Expanded(
                              child: Press(
                                onTap: () => setState(() => _confirm = false),
                                child: Container(
                                  height: 48,
                                  alignment: Alignment.center,
                                  decoration: BoxDecoration(
                                    color: Colors.white,
                                    borderRadius: BorderRadius.circular(16),
                                    border: Border.all(color: line, width: 1.5),
                                  ),
                                  child: Text(
                                    'Оставить',
                                    style: body(15, w: 700),
                                  ),
                                ),
                              ),
                            ),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Press(
                                onTap: () {
                                  setState(() => _confirm = false);
                                  store.clearHistory();
                                  showToast('История очищена');
                                },
                                child: Container(
                                  height: 48,
                                  alignment: Alignment.center,
                                  decoration: BoxDecoration(
                                    color: bad,
                                    borderRadius: BorderRadius.circular(16),
                                  ),
                                  child: Text(
                                    'Удалить',
                                    style: body(
                                      15,
                                      w: 700,
                                      color: Colors.white,
                                    ),
                                  ),
                                ),
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  )
                else
                  row(
                    Icons.delete_outline_rounded,
                    'Очистить историю чеков',
                    n == 0 ? null : () => setState(() => _confirm = true),
                    iconColor: bad,
                    trailing: const SizedBox.shrink(),
                  ),
                const SizedBox(height: 26),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 4),
                  child: Text(
                    'Чек-ап, версия 0.2. Чеки и профиль хранятся на этом телефоне и, если подключён сервер, в твоём аккаунте на нём (без фото чеков). Оценки примерные и не заменяют консультацию врача.',
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

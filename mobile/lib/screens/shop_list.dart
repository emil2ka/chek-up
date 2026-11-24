// «Список на следующий поход»: замены из чеков превращаются в список покупок с галочками.
import 'package:flutter/material.dart';
import 'package:share_plus/share_plus.dart';

import '../core/i18n.dart';
import '../core/models.dart';
import '../core/store.dart';
import '../ui/kit.dart';
import '../ui/pile_hero.dart';

class ShopListPage extends StatefulWidget {
  const ShopListPage({super.key});
  @override
  State<ShopListPage> createState() => _ShopListPageState();
}

class _ShopListPageState extends State<ShopListPage> {
  final _add = TextEditingController();

  @override
  void dispose() {
    _add.dispose();
    super.dispose();
  }

  void _submit() {
    final t = _add.text.trim();
    if (t.isEmpty) return;
    if (store.addToShop([ShopItem(name: t)]) == 0) {
      showToast('Это уже есть в списке');
    }
    _add.clear();
  }

  void _share() {
    final left = store.shop.where((s) => !s.done).toList();
    if (left.isEmpty) return;
    final text =
        '${t('Список покупок из «Чек-ап»')}:\n${left.map((s) => '• ${s.name}${s.instead.isEmpty ? '' : ' (${t('вместо')}: ${s.instead})'}').join('\n')}';
    SharePlus.instance.share(ShareParams(text: text)).catchError((_) {
      showToast('Не получилось поделиться');
      return const ShareResult('', ShareResultStatus.unavailable);
    });
  }

  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: store,
    builder: (context, _) {
      final mq = MediaQuery.of(context);
      final list = store.shop;
      final left = list.where((s) => !s.done).length, done = list.length - left;

      return Scaffold(
        resizeToAvoidBottomInset: false,
        body: DecoratedBox(
          decoration: const BoxDecoration(gradient: sky),
          child: LayoutBuilder(
            builder: (context, box) => SingleChildScrollView(
              keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  ClipRect(
                    child: Stack(
                      children: [
                        const Glow(),
                        Padding(
                          padding: EdgeInsets.fromLTRB(
                            20,
                            mq.padding.top + 8,
                            20,
                            24,
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  BarButton(
                                    Icons.arrow_back_ios_new_rounded,
                                    t('Назад'),
                                    () => Navigator.of(context).pop(),
                                  ),
                                  const Spacer(),
                                  if (left > 0)
                                    BarButton(
                                      Icons.ios_share_rounded,
                                      t('Отправить список'),
                                      _share,
                                    ),
                                ],
                              ),
                              const SizedBox(height: 20),
                              Rise(
                                child: FittedBox(
                                  fit: BoxFit.scaleDown,
                                  alignment: Alignment.centerLeft,
                                  child: Text(
                                    t('В следующий'),
                                    style: disp(
                                      34,
                                      color: Colors.white,
                                      h: 1,
                                      ls: -.045,
                                    ),
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
                                      Hl(t('поход'), disp(34, h: 1, ls: -.045)),
                                      Text(
                                        ' ${t('возьми')}',
                                        style: disp(
                                          34,
                                          color: Colors.white,
                                          h: 1,
                                          ls: -.045,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              ),
                              const SizedBox(height: 12),
                              Rise(
                                delay: 120,
                                child: Text(
                                  list.isEmpty
                                      ? t(
                                          'Отметь замены в чеке и нажми «В список», они появятся здесь.',
                                        )
                                      : left == 0
                                      ? t('Всё куплено, отличный поход.')
                                      : t(
                                          'Осталось купить: {n}. Отмечай прямо в магазине.',
                                          {'n': left},
                                        ),
                                  style: body(
                                    16,
                                    color: Colors.white.withValues(alpha: .9),
                                    h: 1.42,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                  ConstrainedBox(
                    constraints: BoxConstraints(
                      minHeight: (box.maxHeight - mq.padding.top - 230).clamp(
                        0,
                        double.infinity,
                      ),
                    ),
                    child: Sheet(
                      padding: EdgeInsets.fromLTRB(
                        14,
                        20,
                        14,
                        mq.padding.bottom + mq.viewInsets.bottom + 24,
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Row(
                            children: [
                              Expanded(
                                child: Container(
                                  height: 54,
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 16,
                                  ),
                                  alignment: Alignment.center,
                                  decoration: BoxDecoration(
                                    color: tint,
                                    borderRadius: BorderRadius.circular(18),
                                  ),
                                  child: TextField(
                                    controller: _add,
                                    onSubmitted: (_) => _submit(),
                                    textCapitalization:
                                        TextCapitalization.sentences,
                                    style: body(16),
                                    cursorColor: blue1,
                                    decoration: InputDecoration(
                                      border: InputBorder.none,
                                      isCollapsed: true,
                                      hintText: t(
                                        'Добавить своё: молоко, хлеб…',
                                      ),
                                      hintStyle: body(16, color: mute),
                                    ),
                                  ),
                                ),
                              ),
                              const SizedBox(width: 8),
                              Press(
                                scale: .92,
                                label: t('Добавить в список'),
                                onTap: _submit,
                                child: Container(
                                  width: 54,
                                  height: 54,
                                  decoration: BoxDecoration(
                                    color: blue1,
                                    borderRadius: BorderRadius.circular(18),
                                  ),
                                  child: const Icon(
                                    Icons.add_rounded,
                                    color: Colors.white,
                                    size: 26,
                                  ),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 14),
                          if (list.isEmpty)
                            Container(
                              padding: const EdgeInsets.all(20),
                              decoration: BoxDecoration(
                                color: tint,
                                borderRadius: BorderRadius.circular(24),
                              ),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    t('Список пока пустой'),
                                    style: disp(20, h: 1.2, ls: -.03),
                                  ),
                                  const SizedBox(height: 6),
                                  Text(
                                    t(
                                      'Открой любой чек, отметь замены и одной кнопкой отправь их сюда. Список общий на всю семью.',
                                    ),
                                    style: body(15, color: mute),
                                  ),
                                ],
                              ),
                            )
                          else
                            for (final (i, s) in list.indexed)
                              Padding(
                                padding: const EdgeInsets.only(bottom: 8),
                                child: Dismissible(
                                  key: ValueKey('${s.name}|${s.instead}'),
                                  direction: DismissDirection.endToStart,
                                  onDismissed: (_) => store.removeShop(i),
                                  background: Container(
                                    alignment: Alignment.centerRight,
                                    padding: const EdgeInsets.only(right: 20),
                                    decoration: BoxDecoration(
                                      color: bad,
                                      borderRadius: BorderRadius.circular(22),
                                    ),
                                    child: const Icon(
                                      Icons.delete_outline_rounded,
                                      color: Colors.white,
                                    ),
                                  ),
                                  child: Semantics(
                                    checked: s.done,
                                    child: Press(
                                      scale: .985,
                                      onTap: () => store.toggleShop(i),
                                      child: AnimatedContainer(
                                        duration: const Duration(
                                          milliseconds: 200,
                                        ),
                                        padding: const EdgeInsets.fromLTRB(
                                          12,
                                          12,
                                          14,
                                          12,
                                        ),
                                        decoration: BoxDecoration(
                                          color: s.done
                                              ? good.withValues(alpha: .1)
                                              : tint,
                                          borderRadius: BorderRadius.circular(
                                            22,
                                          ),
                                        ),
                                        child: Row(
                                          children: [
                                            AnimatedContainer(
                                              duration: const Duration(
                                                milliseconds: 200,
                                              ),
                                              width: 30,
                                              height: 30,
                                              decoration: BoxDecoration(
                                                color: s.done
                                                    ? good
                                                    : Colors.white,
                                                borderRadius:
                                                    BorderRadius.circular(10),
                                                border: Border.all(
                                                  color: s.done ? good : line,
                                                  width: 2,
                                                ),
                                              ),
                                              child: s.done
                                                  ? const Icon(
                                                      Icons.check_rounded,
                                                      color: Colors.white,
                                                      size: 20,
                                                    )
                                                  : null,
                                            ),
                                            const SizedBox(width: 12),
                                            Expanded(
                                              child: Column(
                                                crossAxisAlignment:
                                                    CrossAxisAlignment.start,
                                                children: [
                                                  Text(
                                                    s.name,
                                                    style:
                                                        body(
                                                          16,
                                                          w: 800,
                                                          color: s.done
                                                              ? mute
                                                              : ink,
                                                          h: 1.3,
                                                        ).copyWith(
                                                          decoration: s.done
                                                              ? TextDecoration
                                                                    .lineThrough
                                                              : null,
                                                        ),
                                                  ),
                                                  if (s.instead.isNotEmpty)
                                                    Text(
                                                      '${t('вместо')}: ${s.instead}',
                                                      style: body(
                                                        13,
                                                        color: mute,
                                                      ),
                                                    ),
                                                ],
                                              ),
                                            ),
                                          ],
                                        ),
                                      ),
                                    ),
                                  ),
                                ),
                              ),
                          if (done > 0)
                            Press(
                              onTap: store.clearDoneShop,
                              child: Padding(
                                padding: const EdgeInsets.symmetric(
                                  vertical: 12,
                                ),
                                child: Text(
                                  '${t('Убрать купленное')} ($done)',
                                  textAlign: TextAlign.center,
                                  style: body(14, w: 700, color: blue1),
                                ),
                              ),
                            ),
                          if (list.isNotEmpty)
                            Padding(
                              padding: const EdgeInsets.only(top: 6),
                              child: Text(
                                t('Смахни пункт влево, чтобы удалить.'),
                                textAlign: TextAlign.center,
                                style: body(12, color: mute),
                              ),
                            ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      );
    },
  );
}

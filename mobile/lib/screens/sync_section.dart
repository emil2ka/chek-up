// Профиль → «Один аккаунт»: состояние синхронизации и связывание с другим устройством (сайт, второй телефон).
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../core/api.dart';
import '../core/store.dart';
import '../ui/kit.dart';

class SyncSection extends StatefulWidget {
  const SyncSection({super.key});
  @override
  State<SyncSection> createState() => _SyncSectionState();
}

class _SyncSectionState extends State<SyncSection> {
  final _input = TextEditingController();
  String? _code;
  bool _busy = false, _enter = false;

  @override
  void dispose() {
    _input.dispose();
    super.dispose();
  }

  Future<void> _run(Future<void> Function() job) async {
    setState(() => _busy = true);
    try {
      await job();
    } on ApiException catch (e) {
      showToast(e.message);
    } catch (_) {
      showToast('Что-то пошло не так. Попробуй ещё раз');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  String _ago(DateTime t) {
    final m = DateTime.now().difference(t).inMinutes;
    return m < 1
        ? 'только что'
        : m < 60
        ? '$m мин назад'
        : '${(m / 60).floor()} ч назад';
  }

  Widget _row(
    IconData icon,
    String text,
    VoidCallback? onTap, {
    bool open = false,
  }) => Press(
    scale: .985,
    onTap: _busy ? null : onTap,
    child: Container(
      constraints: const BoxConstraints(minHeight: 56),
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
            child: Icon(icon, color: blue1, size: 21),
          ),
          const SizedBox(width: 12),
          Expanded(child: Text(text, style: body(15, w: 700))),
          AnimatedRotation(
            turns: open ? .25 : 0,
            duration: const Duration(milliseconds: 200),
            child: const Icon(
              Icons.chevron_right_rounded,
              color: mute,
              size: 22,
            ),
          ),
        ],
      ),
    ),
  );

  @override
  Widget build(BuildContext context) {
    if (!store.syncEnabled) {
      return Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: tint,
          borderRadius: BorderRadius.circular(22),
        ),
        child: Text(
          'Сервер не подключён: чеки и профиль хранятся только на этом телефоне. Чтобы они были и на сайте, собери приложение с адресом сервера (API_URL).',
          style: body(14, color: mute),
        ),
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        ValueListenableBuilder<SyncStatus>(
          valueListenable: store.syncStatus,
          builder: (_, s, __) {
            final (color, text) = switch (s) {
              SyncStatus.syncing => (mid, 'Синхронизирую…'),
              SyncStatus.error => (
                bad,
                store.syncError ?? 'Не получилось синхронизировать',
              ),
              _ => (
                good,
                store.lastSync == null
                    ? 'Синхронизация включена'
                    : 'Синхронизировано · ${_ago(store.lastSync!)}',
              ),
            };
            return Container(
              padding: const EdgeInsets.fromLTRB(14, 12, 6, 12),
              decoration: BoxDecoration(
                color: tint,
                borderRadius: BorderRadius.circular(20),
              ),
              child: Row(
                children: [
                  Container(
                    width: 10,
                    height: 10,
                    decoration: BoxDecoration(
                      color: color,
                      shape: BoxShape.circle,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(child: Text(text, style: body(14, w: 700))),
                  Press(
                    scale: .92,
                    label: 'Синхронизировать сейчас',
                    onTap: s == SyncStatus.syncing ? null : () => store.sync(),
                    child: const SizedBox(
                      width: 44,
                      height: 44,
                      child: Icon(Icons.sync_rounded, color: blue1, size: 22),
                    ),
                  ),
                ],
              ),
            );
          },
        ),
        const SizedBox(height: 8),
        _row(
          Icons.devices_rounded,
          'Код для другого устройства',
          _code != null
              ? () => setState(() => _code = null)
              : () => _run(() async => _code = await store.linkCode()),
          open: _code != null,
        ),
        AnimatedSize(
          duration: const Duration(milliseconds: 240),
          curve: Curves.easeOutCubic,
          alignment: Alignment.topCenter,
          child: _code == null
              ? const SizedBox(width: double.infinity)
              : Padding(
                  padding: const EdgeInsets.fromLTRB(4, 12, 4, 4),
                  child: Column(
                    children: [
                      Press(
                        onTap: () {
                          Clipboard.setData(ClipboardData(text: _code!));
                          showToast('Код скопирован');
                        },
                        label: 'Скопировать код $_code',
                        child: Container(
                          width: double.infinity,
                          padding: const EdgeInsets.symmetric(vertical: 18),
                          decoration: BoxDecoration(
                            gradient: sky,
                            borderRadius: BorderRadius.circular(22),
                          ),
                          child: Text(
                            _code!,
                            textAlign: TextAlign.center,
                            style: disp(34, color: Colors.white, ls: .08),
                          ),
                        ),
                      ),
                      const SizedBox(height: 10),
                      Text(
                        'Введи его на втором устройстве в течение 10 минут: в веб-версии или в другом телефоне. Код одноразовый.',
                        textAlign: TextAlign.center,
                        style: body(13, color: mute),
                      ),
                    ],
                  ),
                ),
        ),
        const SizedBox(height: 8),
        _row(
          Icons.login_rounded,
          'У меня есть код',
          () => setState(() => _enter = !_enter),
          open: _enter,
        ),
        AnimatedSize(
          duration: const Duration(milliseconds: 240),
          curve: Curves.easeOutCubic,
          alignment: Alignment.topCenter,
          child: !_enter
              ? const SizedBox(width: double.infinity)
              : Padding(
                  padding: const EdgeInsets.fromLTRB(4, 12, 4, 4),
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
                                controller: _input,
                                textCapitalization:
                                    TextCapitalization.characters,
                                autocorrect: false,
                                inputFormatters: [
                                  LengthLimitingTextInputFormatter(9),
                                ],
                                onSubmitted: (_) => _join(),
                                style: disp(18, w: 700, ls: .08),
                                cursorColor: blue1,
                                decoration: InputDecoration(
                                  border: InputBorder.none,
                                  isCollapsed: true,
                                  hintText: 'ABCD-EFGH',
                                  hintStyle: disp(
                                    18,
                                    w: 500,
                                    color: const Color(0xFFB0B7D2),
                                    ls: .08,
                                  ),
                                ),
                              ),
                            ),
                          ),
                          const SizedBox(width: 8),
                          Press(
                            scale: .92,
                            label: 'Войти по коду',
                            onTap: _busy ? null : _join,
                            child: Container(
                              width: 54,
                              height: 54,
                              decoration: BoxDecoration(
                                color: blue1,
                                borderRadius: BorderRadius.circular(18),
                              ),
                              child: _busy
                                  ? const Padding(
                                      padding: EdgeInsets.all(16),
                                      child: CircularProgressIndicator(
                                        strokeWidth: 2.5,
                                        color: Colors.white,
                                      ),
                                    )
                                  : const Icon(
                                      Icons.arrow_forward_rounded,
                                      color: Colors.white,
                                      size: 26,
                                    ),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      Text(
                        'Чеки, профиль и список с обоих устройств объединятся.',
                        style: body(13, color: mute),
                      ),
                    ],
                  ),
                ),
        ),
      ],
    );
  }

  Future<void> _join() async {
    final code = _input.text.trim();
    if (code.length < 8) {
      showToast('Код из 8 символов, например K7F2-M9XQ');
      return;
    }
    await _run(() async {
      await store.redeemLinkCode(code);
      _input.clear();
      if (mounted) setState(() => _enter = false);
      showToast('Готово: устройства связаны');
    });
  }
}

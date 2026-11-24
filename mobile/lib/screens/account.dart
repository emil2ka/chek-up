// Профиль → аккаунт: вход по почте, семья и роли, приглашения, устройства, выгрузка и удаление данных.
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:share_plus/share_plus.dart';

import '../core/api.dart';
import '../core/i18n.dart';
import '../core/models.dart';
import '../core/store.dart';
import '../ui/forms.dart';
import '../ui/kit.dart';

String roleTxt(String r) => switch (r) {
  'owner' => t('владелец'),
  'child' => t('ребёнок'),
  _ => t('взрослый'),
};

String _err(Object e) => e is ApiException
    ? t(e.message)
    : t('Что-то пошло не так. Попробуй ещё раз');

String ago(DateTime d) {
  final m = DateTime.now().difference(d).inMinutes;
  return m < 2
      ? t('только что')
      : m < 60
      ? t('{n} мин назад', {'n': m})
      : m < 1440
      ? t('{n} ч назад', {'n': m ~/ 60})
      : t('{n} дн. назад', {'n': m ~/ 1440});
}

/// Занятость и сообщение об ошибке для экранов с запросами.
mixin _Busy<T extends StatefulWidget> on State<T> {
  bool busy = false;
  String msg = '';
  Future<void> go(Future<void> Function() job) async {
    setState(() {
      busy = true;
      msg = '';
    });
    try {
      await job();
    } catch (e) {
      if (mounted) setState(() => msg = _err(e));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Widget get message => msg.isEmpty
      ? const SizedBox.shrink()
      : Padding(
          padding: const EdgeInsets.fromLTRB(4, 8, 4, 4),
          child: Semantics(
            liveRegion: true,
            child: Text(msg, style: body(14, w: 700)),
          ),
        );
}

Widget _p(String text, {Color color = mute, double bottom = 12}) => Padding(
  padding: EdgeInsets.fromLTRB(4, 0, 4, bottom),
  child: Text(text, style: body(14, color: color)),
);

Future<void> openSignIn(BuildContext context) =>
    showSheet<void>(context, title: t('Вход'), builder: (_) => const _SignIn());

class AccountSection extends StatefulWidget {
  const AccountSection({super.key});
  @override
  State<AccountSection> createState() => _AccountSectionState();
}

class _AccountSectionState extends State<AccountSection>
    with _Busy<AccountSection> {
  String? _name;
  bool _leave = false;

  void _sheet(String title, Widget child) =>
      showSheet<void>(context, title: title, builder: (_) => child);

  @override
  Widget build(BuildContext context) {
    if (!store.syncEnabled) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SecTitle(t('Аккаунт')),
          _p(t('Сервер не подключён: чеки хранятся только на этом телефоне.')),
        ],
      );
    }
    final f = store.family, me = f.me;
    final alone = f.members.length < 2;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SecTitle(t('Аккаунт')),
        if (me.email.isNotEmpty)
          RowBtn(
            me.email,
            icon: Icons.person_rounded,
            trailing: const SizedBox.shrink(),
          )
        else
          RowBtn(
            t('Войти'),
            hint: t('чтобы не потерять чеки вместе с телефоном'),
            icon: Icons.person_rounded,
            onTap: () => openSignIn(context),
          ),
        Row(
          children: [
            Expanded(
              child: Field(
                key: ValueKey(me.name),
                initial: me.name,
                hint: t('Имя для семьи'),
                maxLength: 40,
                onChanged: (v) => setState(() => _name = v),
              ),
            ),
            if (_name != null && _name!.trim() != me.name) ...[
              const SizedBox(width: 8),
              SizedBox(
                width: 70,
                child: FlatBtn(
                  'OK',
                  primary: true,
                  onTap: busy
                      ? null
                      : () => go(() async {
                          await store.rename(_name!);
                          _name = null;
                          showToast(t('Имя сохранено'));
                        }),
                ),
              ),
            ],
          ],
        ),
        const SizedBox(height: 8),
        const _SyncRow(),
        message,
        const SizedBox(height: 28),
        SecTitle(t('Семья')),
        if (alone)
          _p(
            t(
              'Один журнал, один стрик и общая норма на всех, кто ходит в магазин.',
            ),
          )
        else
          for (final m in f.members)
            RowBtn(
              m.name.isEmpty
                  ? (m.me ? t('Я') : t('Участник'))
                  : m.me
                  ? '${m.name} (${t('я')})'
                  : m.name,
              hint: roleTxt(m.role),
              icon: Icons.person_rounded,
              onTap: m.me || me.role != 'owner'
                  ? null
                  : () => _sheet(
                      m.name.isEmpty ? t('Участник') : m.name,
                      _MemberSheet(m),
                    ),
              trailing: m.me || me.role != 'owner'
                  ? const SizedBox.shrink()
                  : null,
            ),
        if (me.role != 'child')
          RowBtn(
            t('Пригласить в семью'),
            icon: Icons.group_add_rounded,
            onTap: () => _sheet(t('Пригласить в семью'), const _Invite()),
          ),
        RowBtn(
          t('У меня есть приглашение'),
          icon: Icons.mail_rounded,
          onTap: () => _sheet(t('Вступить в семью'), const _Join()),
        ),
        if (!alone)
          _leave
              ? ConfirmBox(
                  text: t(
                    'Выйти из семьи? Твои чеки останутся с тобой, общие копии останутся у семьи.',
                  ),
                  no: t('Остаться'),
                  yes: t('Выйти'),
                  onNo: () => setState(() => _leave = false),
                  onYes: () => go(() async {
                    await store.leaveFamily();
                    _leave = false;
                    showToast(t('Теперь у тебя своя семья'));
                  }),
                )
              : FlatBtn(
                  t('Выйти из семьи'),
                  color: bad,
                  white: true,
                  onTap: () => setState(() => _leave = true),
                ),
        const SizedBox(height: 28),
        SecTitle(t('Устройства и данные')),
        RowBtn(
          t('Открыть на другом устройстве'),
          icon: Icons.devices_rounded,
          onTap: () => _sheet(t('Код для своего устройства'), const _Link()),
        ),
        RowBtn(
          t('У меня есть код устройства'),
          icon: Icons.pin_rounded,
          onTap: () => _sheet(t('Код устройства'), const _Redeem()),
        ),
        RowBtn(
          t('Мои устройства и выход'),
          icon: Icons.phonelink_lock_rounded,
          onTap: () => _sheet(t('Мои устройства'), const _Devices()),
        ),
        RowBtn(
          t('Выгрузить или удалить данные'),
          icon: Icons.shield_rounded,
          onTap: () => _sheet(t('Мои данные'), const _Data()),
        ),
      ],
    );
  }
}

class _SyncRow extends StatelessWidget {
  const _SyncRow();
  @override
  Widget build(BuildContext context) => ValueListenableBuilder(
    valueListenable: store.syncStatus,
    builder: (context, s, _) => Container(
      constraints: const BoxConstraints(minHeight: 54),
      padding: const EdgeInsets.only(left: 16, right: 4),
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
              color: s == SyncStatus.error
                  ? bad
                  : s == SyncStatus.syncing
                  ? mid
                  : good,
              shape: BoxShape.circle,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              s == SyncStatus.error
                  ? t(store.syncError ?? 'Не получилось синхронизировать')
                  : s == SyncStatus.syncing
                  ? t('Сохраняю…')
                  : store.lastSync != null
                  ? '${t('Сохранено')} · ${ago(store.lastSync!)}'
                  : t('Синхронизация включена'),
              style: body(14, w: 700),
            ),
          ),
          IconButton(
            onPressed: s == SyncStatus.syncing ? null : store.sync,
            tooltip: t('Синхронизировать сейчас'),
            icon: const Icon(Icons.sync_rounded, color: blue1),
          ),
        ],
      ),
    ),
  );
}

class _SignIn extends StatefulWidget {
  const _SignIn();
  @override
  State<_SignIn> createState() => _SignInState();
}

class _SignInState extends State<_SignIn> with _Busy<_SignIn> {
  bool? _can;
  bool _sent = false;
  final _email = TextEditingController(), _code = TextEditingController();

  @override
  void initState() {
    super.initState();
    store
        .emailSignInAvailable()
        .then((v) => mounted ? setState(() => _can = v) : null)
        .catchError((_) => mounted ? setState(() => _can = false) : null);
  }

  @override
  void dispose() {
    _email.dispose();
    _code.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      _p(t('Чеки с этого телефона сохранятся в аккаунте. Пароль не нужен.')),
      if (_can == null)
        _p(t('Загружаю…'))
      else if (_can == false)
        _p(
          t(
            'Вход на этом сервере ещё не подключён. Перенести чеки на другое устройство можно по коду.',
          ),
          color: ink,
        )
      else if (!_sent) ...[
        Field(
          controller: _email,
          hint: t('Почта'),
          keyboard: TextInputType.emailAddress,
          autofocus: true,
          onChanged: (_) => setState(() {}),
        ),
        const SizedBox(height: 8),
        FlatBtn(
          busy ? t('Отправляю…') : t('Получить код'),
          primary: true,
          onTap: busy || !_email.text.contains('@')
              ? null
              : () => go(() async {
                  await store.emailStart(_email.text.trim());
                  if (mounted) setState(() => _sent = true);
                }),
        ),
      ] else ...[
        _p(
          t('Код отправлен на {e}. Он действует 10 минут.', {
            'e': _email.text.trim(),
          }),
          color: ink,
        ),
        Field(
          controller: _code,
          hint: '000000',
          big: true,
          autofocus: true,
          keyboard: TextInputType.number,
          maxLength: 6,
          onChanged: (_) => setState(() {}),
        ),
        const SizedBox(height: 8),
        FlatBtn(
          busy ? t('Вхожу…') : t('Войти'),
          primary: true,
          onTap: busy || _code.text.trim().length != 6
              ? null
              : () => go(() async {
                  await store.emailVerify(
                    _email.text.trim(),
                    _code.text.trim(),
                  );
                  if (!context.mounted) return;
                  Navigator.pop(context);
                  showToast(t('Готово, чеки сохранены в аккаунте'));
                }),
        ),
        const SizedBox(height: 8),
        FlatBtn(
          t('Другая почта или новый код'),
          onTap: () => setState(() {
            _sent = false;
            _code.clear();
            msg = '';
          }),
        ),
      ],
      message,
    ],
  );
}

class _Invite extends StatefulWidget {
  const _Invite();
  @override
  State<_Invite> createState() => _InviteState();
}

class _InviteState extends State<_Invite> with _Busy<_Invite> {
  String _role = 'adult', _code = '', _own = '';
  @override
  Widget build(BuildContext context) {
    final named = store.family.me.name.isNotEmpty;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: _code.isEmpty
          ? [
              Segmented(
                value: _role,
                options: [('adult', t('Взрослый')), ('child', t('Ребёнок'))],
                onChange: (v) => setState(() => _role = v),
              ),
              const SizedBox(height: 12),
              _p(
                _role == 'adult'
                    ? t('Видит и вносит все общие чеки, закрывает недели.')
                    : t(
                        'Видит гору и стрик, вносит свои чеки. Цены и алкоголь в чужих чеках скрыты.',
                      ),
              ),
              if (!named) ...[
                Field(
                  hint: t('Твоё имя, чтобы тебя узнали'),
                  maxLength: 40,
                  onChanged: (v) => _own = v,
                ),
                const SizedBox(height: 8),
              ],
              FlatBtn(
                t('Создать приглашение'),
                primary: true,
                onTap: busy
                    ? null
                    : () => go(() async {
                        if (!named && _own.trim().isNotEmpty) {
                          await store.rename(_own);
                        }
                        final c = await store.createInvite(_role);
                        if (mounted) setState(() => _code = c);
                      }),
              ),
              message,
            ]
          : [
              _CodeBox(_code),
              const SizedBox(height: 10),
              _p(t('Код одноразовый и действует двое суток.')),
              FlatBtn(
                t('Отправить ссылку'),
                primary: true,
                onTap: () => SharePlus.instance.share(
                  ShareParams(
                    text:
                        '${t('Присоединяйся к нашей семье в «Чек-ап»')}: $apiUrl/?join=$_code',
                  ),
                ),
              ),
            ],
    );
  }
}

class _CodeBox extends StatelessWidget {
  final String code;
  const _CodeBox(this.code);
  @override
  Widget build(BuildContext context) => Press(
    scale: .98,
    label: code,
    onTap: () {
      Clipboard.setData(ClipboardData(text: code));
      showToast(t('Код скопирован'));
    },
    child: Container(
      padding: const EdgeInsets.symmetric(vertical: 20, horizontal: 12),
      alignment: Alignment.center,
      decoration: BoxDecoration(
        gradient: sky,
        borderRadius: BorderRadius.circular(22),
      ),
      child: FittedBox(
        child: Text(
          code.isEmpty ? '· · · ·' : code,
          style: disp(30, color: Colors.white, ls: .06),
        ),
      ),
    ),
  );
}

class _Join extends StatefulWidget {
  const _Join();
  @override
  State<_Join> createState() => _JoinState();
}

class _JoinState extends State<_Join> with _Busy<_Join> {
  final _code = TextEditingController();
  InvitePreview? _info;
  bool _share = true;
  String _own = '';

  @override
  void dispose() {
    _code.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final info = _info;
    final named = store.family.me.name.isNotEmpty;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (info == null) ...[
          Field(
            controller: _code,
            hint: 'ABCDE-FGHJK',
            big: true,
            caps: true,
            autofocus: true,
            maxLength: 14,
            onChanged: (_) => setState(() {}),
          ),
          const SizedBox(height: 8),
          FlatBtn(
            busy ? t('Проверяю…') : t('Дальше'),
            primary: true,
            onTap:
                busy ||
                    _code.text.replaceAll(RegExp('[^A-Za-z0-9]'), '').length <
                        10
                ? null
                : () => go(() async {
                    final i = await store.previewInvite(_code.text);
                    if (mounted) setState(() => _info = i);
                  }),
          ),
        ] else ...[
          Tile(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  info.invitedBy.isEmpty
                      ? t('Тебя зовут в семью')
                      : t('{n} зовёт тебя в семью', {'n': info.invitedBy}),
                  style: body(16, w: 700),
                ),
                const SizedBox(height: 4),
                Text(
                  '${t('Участников')}: ${info.members}. ${t('Твоя роль')}: ${roleTxt(info.role)}.',
                  style: body(14, color: mute),
                ),
              ],
            ),
          ),
          const SizedBox(height: 8),
          SwitchRow(
            t('Показать семье мои прошлые чеки'),
            hint: _share
                ? t('они станут общими')
                : t('они останутся у тебя, но личными'),
            value: _share,
            onChanged: (v) => setState(() => _share = v),
          ),
          if (!named) ...[
            Field(
              hint: t('Твоё имя, чтобы тебя узнали'),
              maxLength: 40,
              onChanged: (v) => _own = v,
            ),
            const SizedBox(height: 8),
          ],
          _p(
            t(
              'Стрик и норма будут общими, семейными. Твой личный рекорд сохранится.',
            ),
          ),
          FlatBtn(
            busy ? t('Вступаю…') : t('Вступить'),
            primary: true,
            onTap: busy
                ? null
                : () => go(() async {
                    if (!named && _own.trim().isNotEmpty) {
                      await store.rename(_own);
                    }
                    await store.joinFamily(_code.text, share: _share);
                    if (!context.mounted) return;
                    Navigator.pop(context);
                    showToast(t('Добро пожаловать в семью'));
                  }),
          ),
        ],
        message,
      ],
    );
  }
}

class _MemberSheet extends StatefulWidget {
  final Member m;
  const _MemberSheet(this.m);
  @override
  State<_MemberSheet> createState() => _MemberSheetState();
}

class _MemberSheetState extends State<_MemberSheet> with _Busy<_MemberSheet> {
  String? _ask;
  Future<void> _do(Future<void> Function() job) => go(() async {
    await job();
    if (mounted) Navigator.pop(context);
  });
  @override
  Widget build(BuildContext context) {
    final m = widget.m;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Segmented(
          value: m.role == 'child' ? 'child' : 'adult',
          options: [('adult', t('Взрослый')), ('child', t('Ребёнок'))],
          onChange: (v) => _do(() => store.setRole(m.id, v)),
        ),
        const SizedBox(height: 12),
        if (_ask != null)
          ConfirmBox(
            text: _ask == 'owner'
                ? t('Передать владение? Ты станешь взрослым участником.')
                : t(
                    'Убрать из семьи? Личные чеки уйдут вместе с участником, общие копии останутся у вас.',
                  ),
            no: t('Отмена'),
            yes: t('Да'),
            onNo: () => setState(() => _ask = null),
            onYes: () => _do(
              () => _ask == 'owner'
                  ? store.setRole(m.id, 'owner')
                  : store.removeMember(m.id),
            ),
          )
        else ...[
          if (m.role == 'adult') ...[
            FlatBtn(
              t('Сделать владельцем'),
              onTap: () => setState(() => _ask = 'owner'),
            ),
            const SizedBox(height: 8),
          ],
          FlatBtn(
            t('Убрать из семьи'),
            color: bad,
            onTap: () => setState(() => _ask = 'remove'),
          ),
        ],
        message,
      ],
    );
  }
}

class _Link extends StatefulWidget {
  const _Link();
  @override
  State<_Link> createState() => _LinkState();
}

class _LinkState extends State<_Link> with _Busy<_Link> {
  String _code = '';
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback(
      (_) => go(() async {
        final c = await store.linkCode();
        if (mounted) setState(() => _code = c);
      }),
    );
  }

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      _CodeBox(_code),
      const SizedBox(height: 10),
      _p(
        t(
          'Введи его на другом устройстве в течение 10 минут. Никому не показывай: код открывает твой аккаунт.',
        ),
      ),
      message,
    ],
  );
}

class _Redeem extends StatefulWidget {
  const _Redeem();
  @override
  State<_Redeem> createState() => _RedeemState();
}

class _RedeemState extends State<_Redeem> with _Busy<_Redeem> {
  final _code = TextEditingController();
  @override
  void dispose() {
    _code.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      Field(
        controller: _code,
        hint: 'ABCD-EFGH',
        big: true,
        caps: true,
        autofocus: true,
        maxLength: 9,
        onChanged: (_) => setState(() {}),
      ),
      const SizedBox(height: 8),
      _p(t('Чеки с обоих устройств объединятся.')),
      FlatBtn(
        busy ? t('Связываю…') : t('Связать'),
        primary: true,
        onTap:
            busy ||
                _code.text.replaceAll(RegExp('[^A-Za-z0-9]'), '').length != 8
            ? null
            : () => go(() async {
                await store.redeemLinkCode(_code.text);
                if (!context.mounted) return;
                Navigator.pop(context);
                showToast(t('Устройства связаны'));
              }),
      ),
      message,
    ],
  );
}

class _Devices extends StatefulWidget {
  const _Devices();
  @override
  State<_Devices> createState() => _DevicesState();
}

class _DevicesState extends State<_Devices> with _Busy<_Devices> {
  List<DeviceInfo>? _list;
  String? _ask;

  Future<void> _load() async {
    final l = await store.devices();
    if (mounted) setState(() => _list = l);
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => go(_load));
  }

  @override
  Widget build(BuildContext context) {
    final list = _list;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (list == null && msg.isEmpty) _p(t('Загружаю…')),
        for (final d in list ?? const <DeviceInfo>[])
          RowBtn(
            d.label.isEmpty ? t('Устройство') : d.label,
            hint: d.current
                ? t('это устройство')
                : '${t('был в сети')} ${ago(d.seen)}',
            trailing: d.current
                ? const SizedBox.shrink()
                : Press(
                    onTap: () => go(() async {
                      await store.signOut(d.id);
                      await _load();
                    }),
                    child: Padding(
                      padding: const EdgeInsets.all(8),
                      child: Text(
                        t('Отключить'),
                        style: body(14, w: 700, color: bad),
                      ),
                    ),
                  ),
          ),
        if (list != null && list.length > 1) ...[
          FlatBtn(
            t('Отключить все остальные'),
            onTap: () => go(() async {
              await store.signOut('others');
              await _load();
            }),
          ),
          const SizedBox(height: 8),
        ],
        if (list != null)
          _ask != null
              ? ConfirmBox(
                  text: store.family.me.email.isNotEmpty
                      ? t(
                          'Чеки останутся в аккаунте, с этого устройства они исчезнут.',
                        )
                      : t(
                          'Вход не подключён: после выхода открыть эти чеки будет нельзя. Сначала войди.',
                        ),
                  no: t('Отмена'),
                  yes: t('Выйти'),
                  onNo: () => setState(() => _ask = null),
                  onYes: () => go(() async {
                    await store.signOut(_ask!);
                    if (!context.mounted) return;
                    Navigator.pop(context);
                    showToast(t('Выход выполнен'));
                  }),
                )
              : Row(
                  children: [
                    Expanded(
                      child: FlatBtn(
                        t('Выйти здесь'),
                        onTap: () => setState(() => _ask = 'this'),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: FlatBtn(
                        t('Выйти везде'),
                        onTap: () => setState(() => _ask = 'all'),
                      ),
                    ),
                  ],
                ),
        message,
      ],
    );
  }
}

class _Data extends StatefulWidget {
  const _Data();
  @override
  State<_Data> createState() => _DataState();
}

class _DataState extends State<_Data> with _Busy<_Data> {
  String _sure = '';
  @override
  Widget build(BuildContext context) {
    final word = t('УДАЛИТЬ');
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _p(
          t(
            'Храним позиции чеков, цены, состав семьи и отметки недель. Фото чеков не храним.',
          ),
        ),
        FlatBtn(
          t('Скачать всё одним файлом'),
          icon: Icons.download_rounded,
          onTap: busy
              ? null
              : () => go(() async {
                  final data = utf8.encode(await store.exportData());
                  await SharePlus.instance.share(
                    ShareParams(
                      files: [
                        XFile.fromData(
                          data,
                          mimeType: 'application/json',
                          name: 'chek-up-data.json',
                        ),
                      ],
                      fileNameOverrides: ['chek-up-data.json'],
                    ),
                  );
                }),
        ),
        const SizedBox(height: 12),
        Tile(
          color: bad.withValues(alpha: .09),
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(t('Удалить аккаунт навсегда'), style: body(15, w: 700)),
              const SizedBox(height: 4),
              Text(
                t(
                  'Личные чеки сотрутся. Если в семье есть другие, общие чеки останутся им без твоего имени. Отменить нельзя.',
                ),
                style: body(14, color: mute),
              ),
              Field(
                label: t('Чтобы подтвердить, напиши {w}', {'w': word}),
                hint: word,
                white: true,
                onChanged: (v) => setState(() => _sure = v),
              ),
              const SizedBox(height: 10),
              FlatBtn(
                t('Удалить аккаунт'),
                danger: true,
                onTap: busy || _sure.trim().toUpperCase() != word
                    ? null
                    : () => go(() async {
                        await store.deleteAccount();
                        if (!context.mounted) return;
                        Navigator.pop(context);
                        showToast(t('Аккаунт и данные удалены'));
                      }),
              ),
            ],
          ),
        ),
        message,
      ],
    );
  }
}

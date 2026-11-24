// Поля, кнопки, переключатели и нижние шторки белых карточек.
import 'package:flutter/material.dart';

import '../core/i18n.dart';
import 'kit.dart';

/// Нижняя шторка: заголовок, прокручиваемое содержимое, закреплённый низ.
Future<T?> showSheet<T>(
  BuildContext context, {
  required String title,
  required Widget Function(BuildContext) builder,
}) => showModalBottomSheet<T>(
  context: context,
  isScrollControlled: true,
  useSafeArea: true,
  backgroundColor: Colors.transparent,
  barrierColor: ink.withValues(alpha: .58),
  constraints: const BoxConstraints(maxWidth: 430),
  builder: (context) => SheetFrame(title: title, child: builder(context)),
);

class SheetFrame extends StatelessWidget {
  final String title;
  final Widget child;
  final Widget? footer;
  const SheetFrame({
    super.key,
    required this.title,
    required this.child,
    this.footer,
  });
  @override
  Widget build(BuildContext context) {
    final mq = MediaQuery.of(context);
    return Padding(
      padding: EdgeInsets.only(bottom: mq.viewInsets.bottom),
      child: Material(
        color: Colors.white,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(rSheet)),
        clipBehavior: Clip.antiAlias,
        child: ConstrainedBox(
          constraints: BoxConstraints(maxHeight: mq.size.height * .9),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const SizedBox(height: 10),
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
                padding: const EdgeInsets.fromLTRB(20, 14, 16, 12),
                child: Row(
                  children: [
                    Expanded(child: Text(title, style: disp(22, h: 1.1))),
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
                        child: const Icon(
                          Icons.close_rounded,
                          color: ink,
                          size: 22,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              Flexible(
                child: SingleChildScrollView(
                  keyboardDismissBehavior:
                      ScrollViewKeyboardDismissBehavior.onDrag,
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                  child: child,
                ),
              ),
              if (footer != null)
                Container(
                  padding: EdgeInsets.fromLTRB(
                    16,
                    12,
                    16,
                    12 + mq.padding.bottom,
                  ),
                  decoration: const BoxDecoration(
                    border: Border(top: BorderSide(color: line)),
                  ),
                  child: footer,
                )
              else
                SizedBox(height: mq.padding.bottom),
            ],
          ),
        ),
      ),
    );
  }
}

/// Кнопка на белом: primary — синяя, danger — красная, иначе тихая.
class FlatBtn extends StatelessWidget {
  final String text;
  final VoidCallback? onTap;
  final bool primary, danger, white;
  final IconData? icon;
  final Color? color;
  final double height;
  const FlatBtn(
    this.text, {
    super.key,
    this.onTap,
    this.primary = false,
    this.danger = false,
    this.white = false,
    this.icon,
    this.color,
    this.height = 50,
  });
  @override
  Widget build(BuildContext context) {
    final fg = primary || danger ? Colors.white : color ?? ink;
    return Press(
      scale: .97,
      onTap: onTap,
      child: Container(
        constraints: BoxConstraints(minHeight: height),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: primary
              ? blue1
              : danger
              ? bad
              : white
              ? Colors.white
              : tint,
          borderRadius: BorderRadius.circular(17),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            if (icon != null) ...[
              Icon(icon, color: fg, size: 21),
              const SizedBox(width: 8),
            ],
            Flexible(
              child: Text(
                text,
                textAlign: TextAlign.center,
                style: primary
                    ? disp(14, w: 700, color: fg, ls: -.01, h: 1.2)
                    : body(14, w: 700, color: fg, h: 1.2),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Строка-переход или строка с действием.
class RowBtn extends StatelessWidget {
  final IconData? icon;
  final String text;
  final String? hint;
  final VoidCallback? onTap;
  final Widget? trailing;
  final Color iconColor;
  const RowBtn(
    this.text, {
    super.key,
    this.icon,
    this.hint,
    this.onTap,
    this.trailing,
    this.iconColor = blue1,
  });
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 8),
    child: Press(
      scale: .985,
      onTap: onTap,
      child: Container(
        constraints: const BoxConstraints(minHeight: 56),
        padding: const EdgeInsets.fromLTRB(14, 9, 12, 9),
        decoration: BoxDecoration(
          color: tint,
          borderRadius: BorderRadius.circular(20),
        ),
        child: Row(
          children: [
            if (icon != null) ...[
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
            ],
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(text, style: body(15, w: 700)),
                  if (hint != null) Text(hint!, style: body(13, color: mute)),
                ],
              ),
            ),
            trailing ??
                const Icon(Icons.chevron_right_rounded, color: mute, size: 22),
          ],
        ),
      ),
    ),
  );
}

/// Переключатель «да/нет» строкой.
class SwitchRow extends StatelessWidget {
  final String text;
  final String? hint;
  final bool value;
  final ValueChanged<bool>? onChanged;
  final bool white;
  const SwitchRow(
    this.text, {
    super.key,
    this.hint,
    required this.value,
    this.onChanged,
    this.white = false,
  });
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 8),
    child: Semantics(
      toggled: value,
      child: Press(
        scale: .985,
        onTap: onChanged == null ? null : () => onChanged!(!value),
        child: Container(
          constraints: const BoxConstraints(minHeight: 56),
          padding: const EdgeInsets.fromLTRB(14, 9, 10, 9),
          decoration: BoxDecoration(
            color: white ? Colors.white : tint,
            borderRadius: BorderRadius.circular(20),
          ),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(text, style: body(15, w: 700)),
                    if (hint != null) Text(hint!, style: body(13, color: mute)),
                  ],
                ),
              ),
              ExcludeSemantics(
                child: IgnorePointer(
                  child: Switch(
                    value: value,
                    onChanged: (_) {},
                    activeTrackColor: blue1,
                    inactiveTrackColor: const Color(0xFFC7D2F4),
                    inactiveThumbColor: Colors.white,
                    trackOutlineColor: const WidgetStatePropertyAll(
                      Colors.transparent,
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    ),
  );
}

class Segmented<T> extends StatelessWidget {
  final T value;
  final List<(T, String)> options;
  final ValueChanged<T> onChange;
  const Segmented({
    super.key,
    required this.value,
    required this.options,
    required this.onChange,
  });
  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(4),
    decoration: BoxDecoration(
      color: tint,
      borderRadius: BorderRadius.circular(26),
    ),
    child: Row(
      children: [
        for (final (v, text) in options)
          Expanded(
            child: Semantics(
              selected: v == value,
              child: Press(
                scale: .97,
                onTap: () => onChange(v),
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 180),
                  height: 44,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: v == value ? Colors.white : tint,
                    borderRadius: BorderRadius.circular(22),
                  ),
                  child: Text(
                    text,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: body(14, w: 800, color: v == value ? blue1 : mute),
                  ),
                ),
              ),
            ),
          ),
      ],
    ),
  );
}

/// Поле ввода.
class Field extends StatelessWidget {
  final TextEditingController? controller;
  final String hint;
  final String? label, initial;
  final ValueChanged<String>? onChanged, onSubmitted;
  final TextInputType? keyboard;
  final bool autofocus, white, big, caps;
  final int? maxLength;
  const Field({
    super.key,
    this.controller,
    required this.hint,
    this.label,
    this.initial,
    this.onChanged,
    this.onSubmitted,
    this.keyboard,
    this.autofocus = false,
    this.white = false,
    this.big = false,
    this.caps = false,
    this.maxLength,
  });
  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      if (label != null)
        Padding(
          padding: const EdgeInsets.fromLTRB(4, 4, 4, 4),
          child: Text(label!, style: body(13, w: 700, color: mute)),
        ),
      TextFormField(
        controller: controller,
        initialValue: controller == null ? initial : null,
        autofocus: autofocus,
        keyboardType: keyboard,
        maxLength: maxLength,
        onChanged: onChanged,
        onFieldSubmitted: onSubmitted,
        textAlign: big ? TextAlign.center : TextAlign.start,
        textCapitalization: caps
            ? TextCapitalization.characters
            : TextCapitalization.sentences,
        style: big ? disp(22, ls: .06, h: 1.2) : body(16),
        decoration: InputDecoration(
          hintText: hint,
          hintStyle: big
              ? disp(22, ls: .06, h: 1.2, color: const Color(0xFFB0B7D2))
              : body(16, color: mute.withValues(alpha: .7)),
          counterText: '',
          filled: true,
          fillColor: white ? Colors.white : tint,
          contentPadding: const EdgeInsets.symmetric(
            horizontal: 16,
            vertical: 15,
          ),
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(17),
            borderSide: BorderSide.none,
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(17),
            borderSide: const BorderSide(color: blue1, width: 2),
          ),
        ),
      ),
    ],
  );
}

/// «Точно?» — две кнопки на месте.
class ConfirmBox extends StatelessWidget {
  final String text, no, yes;
  final VoidCallback onNo, onYes;
  final bool danger;
  const ConfirmBox({
    super.key,
    required this.text,
    required this.no,
    required this.yes,
    required this.onNo,
    required this.onYes,
    this.danger = true,
  });
  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(14),
    margin: const EdgeInsets.only(bottom: 8),
    decoration: BoxDecoration(
      color: danger ? bad.withValues(alpha: .1) : tint,
      borderRadius: BorderRadius.circular(20),
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(text, style: body(15, w: 700)),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(child: FlatBtn(no, white: true, onTap: onNo)),
            const SizedBox(width: 8),
            Expanded(
              child: FlatBtn(
                yes,
                danger: danger,
                primary: !danger,
                onTap: onYes,
              ),
            ),
          ],
        ),
      ],
    ),
  );
}

/// Светлая карточка.
class Tile extends StatelessWidget {
  final Widget child;
  final Color color;
  final EdgeInsets padding;
  const Tile({
    super.key,
    required this.child,
    this.color = tint,
    this.padding = const EdgeInsets.all(16),
  });
  @override
  Widget build(BuildContext context) => Container(
    padding: padding,
    decoration: BoxDecoration(
      color: color,
      borderRadius: BorderRadius.circular(24),
    ),
    child: child,
  );
}

/// Число с подписью.
Widget stat(String label, String value, String hint) => Column(
  crossAxisAlignment: CrossAxisAlignment.start,
  children: [
    Text(label, style: body(13, w: 700, color: mute)),
    const SizedBox(height: 4),
    FittedBox(
      fit: BoxFit.scaleDown,
      alignment: Alignment.centerLeft,
      child: Text(value, style: disp(22)),
    ),
    const SizedBox(height: 8),
    Text(hint, style: body(13, color: mute, h: 1.25)),
  ],
);

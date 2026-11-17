// Картинка-карточка для «Поделиться»: рисуется на Canvas и уходит в системное меню вместе с текстом.
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:share_plus/share_plus.dart';

import '../core/engine.dart';
import '../core/models.dart';
import 'kit.dart';

Future<Uint8List> _render({
  required int cubes,
  required int score,
  required String verdictLow,
  required Tone tone,
  required String where,
}) async {
  const w = 1080.0, h = 1350.0;
  final rec = ui.PictureRecorder();
  final c = Canvas(rec, const Rect.fromLTWH(0, 0, w, h));
  c.drawRect(
    const Rect.fromLTWH(0, 0, w, h),
    Paint()..shader = sky.createShader(const Rect.fromLTWH(0, 0, w, h)),
  );
  c.drawCircle(
    const Offset(w + 60, -40),
    520,
    Paint()
      ..shader =
          RadialGradient(
            colors: [blue3.withValues(alpha: .6), blue3.withValues(alpha: 0)],
          ).createShader(
            Rect.fromCircle(center: const Offset(w + 60, -40), radius: 520),
          ),
  );

  double text(
    String s,
    TextStyle st,
    double y, {
    double x = 80,
    double maxW = w - 160,
  }) {
    final tp = TextPainter(
      text: TextSpan(text: s, style: st),
      textDirection: TextDirection.ltr,
    )..layout(maxWidth: maxW);
    tp.paint(c, Offset(x, y));
    return tp.height;
  }

  text('чек-ап', disp(54, w: 800, color: Colors.white), 80);
  text(
    'В моём чеке',
    body(46, w: 700, color: Colors.white.withValues(alpha: .88)),
    250,
  );
  final nh = text(
    '$cubes',
    disp(cubes >= 100 ? 330 : 400, color: Colors.white, ls: -.07),
    300,
  );
  text(capOf(cubes), disp(64, w: 500, color: Colors.white, ls: -.01), 310 + nh);

  // кубики по низу
  final n = cubes.clamp(0, 44);
  const s = 78.0;
  for (var i = 0; i < n; i++) {
    final col = i % 11, row = i ~/ 11;
    final x = 80 + col * (s + 8.5) + (row.isOdd ? 20 : 0),
        y = h - 330 - row * (s + 8);
    final rr = RRect.fromRectAndRadius(
      Rect.fromLTWH(x, y, s, s),
      const Radius.circular(13),
    );
    c.drawRRect(
      rr.shift(const Offset(0, 10)),
      Paint()..color = const Color(0xFFB4C4F6),
    );
    c.drawRRect(rr, Paint()..color = Colors.white);
  }

  final pill = RRect.fromRectAndRadius(
    const Rect.fromLTWH(80, h - 210, w - 160, 130),
    const Radius.circular(65),
  );
  c.drawRRect(pill, Paint()..color = Colors.white);
  c.drawCircle(
    const Offset(150, h - 145),
    20,
    Paint()..color = toneColor(tone),
  );
  text(
    '$score из 100 · $verdictLow',
    body(46, w: 800),
    h - 177,
    x: 195,
    maxW: w - 300,
  );
  text(
    where,
    body(34, w: 700, color: Colors.white.withValues(alpha: .85)),
    h - 62,
  );

  final img = await rec.endRecording().toImage(w.toInt(), h.toInt());
  final data = await img.toByteData(format: ui.ImageByteFormat.png);
  return data!.buffer.asUint8List();
}

/// Поделиться результатом: картинка + текст; если картинка не получилась — только текст.
Future<void> shareResult({
  required int cubes,
  required int score,
  required String where,
  required String text,
}) async {
  final v = verdict(score);
  try {
    final png = await _render(
      cubes: cubes,
      score: score,
      verdictLow: v.label.toLowerCase(),
      tone: v.tone,
      where: where,
    );
    await SharePlus.instance.share(
      ShareParams(
        text: text,
        files: [
          XFile.fromData(png, mimeType: 'image/png', name: 'chek-up.png'),
        ],
        fileNameOverrides: ['chek-up.png'],
      ),
    );
  } catch (_) {
    try {
      await SharePlus.instance.share(ShareParams(text: text));
    } catch (_) {
      showToast('Не получилось поделиться');
    }
  }
}

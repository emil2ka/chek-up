// Картинка-карточка для «Поделиться»: рисуется на Canvas и уходит в системное меню вместе с текстом.
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:share_plus/share_plus.dart';

import '../core/engine.dart';
import '../core/models.dart';
import 'kit.dart';
import 'food_piece.dart';
import 'pile.dart';

Future<Uint8List> _render({
  required MetricId metric,
  required Map<MetricId, int> cubesBy,
  required Map<MetricId, double> totals,
  required Set<MetricId> available,
  required int score,
  required String verdictLow,
  required Tone tone,
  required String where,
}) async {
  const w = 1080.0, h = 1350.0;
  final cubes = cubesBy[metric]!;
  final pal = pilePalettes[metric]!;
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
    TextAlign align = TextAlign.left,
  }) {
    final tp = TextPainter(
      text: TextSpan(text: s, style: st),
      textDirection: TextDirection.ltr,
      textAlign: align,
    )..layout(maxWidth: maxW);
    tp.paint(c, Offset(x, y));
    return tp.height;
  }

  text('чек-ап', disp(54, w: 800, color: Colors.white), 80);
  text(
    'В моём чеке',
    body(46, w: 700, color: Colors.white.withValues(alpha: .88)),
    220,
  );
  final number = available.contains(metric)
      ? bigNum(totals[metric]!, metric)
      : '—';
  final nh = text(
    number,
    disp(
      number.length >= 4
          ? 210
          : number.length >= 3
          ? 290
          : 400,
      color: Colors.white,
      ls: -.07,
    ),
    270,
  );
  text(
    available.contains(metric) ? bigCap(totals[metric]!, metric) : 'нет данных',
    disp(64, w: 500, color: Colors.white, ls: -.01),
    280 + nh,
  );

  // кубики своего цвета по низу
  final n = (metric == MetricId.salt ? saltGrainCount(totals[metric]!) : cubes)
      .clamp(0, 33);
  const s = 78.0;
  for (var i = 0; i < n; i++) {
    final col = i % 11, row = i ~/ 11;
    final x = 80 + col * (s + 8.5) + (row.isOdd ? 20 : 0),
        y = h - 410 - row * (s + 8);
    final rr = RRect.fromRectAndRadius(
      Rect.fromLTWH(x, y, s, s),
      const Radius.circular(13),
    );
    final shape = pal.shape;
    if (shape == null) {
      c.drawRRect(rr.shift(const Offset(0, 10)), Paint()..color = pal.side);
      c.drawRRect(rr, Paint()..color = pal.top);
    } else {
      c.save();
      c.translate(rr.center.dx, rr.center.dy);
      drawFoodPiece(
        c,
        shape,
        shape == FoodShape.salt ? s * .66 : s,
        variant: i % 4,
      );
      c.restore();
    }
  }

  // белая карточка: оценка и четыре показателя
  final sheet = RRect.fromRectAndRadius(
    const Rect.fromLTWH(0, h - 300, w, 420),
    const Radius.circular(70),
  );
  c.drawRRect(sheet, Paint()..color = Colors.white);
  c.drawCircle(
    const Offset(110, h - 232),
    16,
    Paint()..color = toneColor(tone),
  );
  text(
    '$score из 100 · $verdictLow',
    body(44, w: 800),
    h - 258,
    x: 144,
    maxW: w - 224,
  );
  final colW = (w - 120) / metricIds.length;
  for (final (i, m) in metricIds.indexed) {
    final cx = 60 + colW * (i + .5);
    c.drawCircle(
      Offset(cx, h - 188),
      10,
      Paint()..color = Color(metrics[m]!.color),
    );
    text(
      available.contains(m) ? bigNum(totals[m]!, m) : '—',
      disp(32, w: 900, ls: -.04),
      h - 168,
      x: cx - colW / 2,
      maxW: colW,
      align: TextAlign.center,
    );
    text(
      '${m == MetricId.carbs ? 'Углев.' : metrics[m]!.label} · ${isCubeMetric(m) ? 'куб.' : metrics[m]!.unit}',
      body(23, w: 700, color: mute),
      h - 112,
      x: cx - colW / 2,
      maxW: colW,
      align: TextAlign.center,
    );
  }
  text(
    where,
    body(32, w: 700, color: mute),
    h - 62,
    x: 0,
    maxW: w,
    align: TextAlign.center,
  );

  final img = await rec.endRecording().toImage(w.toInt(), h.toInt());
  final data = await img.toByteData(format: ui.ImageByteFormat.png);
  return data!.buffer.asUint8List();
}

/// Поделиться результатом: картинка + текст; если картинка не получилась — только текст.
Future<void> shareResult({
  required MetricId metric,
  required Map<MetricId, int> cubesBy,
  required Map<MetricId, double> totals,
  required Set<MetricId> available,
  required int score,
  required String where,
  required String text,
}) async {
  final v = verdict(score);
  try {
    final png = await _render(
      metric: metric,
      cubesBy: cubesBy,
      totals: totals,
      available: available,
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

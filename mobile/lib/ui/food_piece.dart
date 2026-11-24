// Фигурки показателей (перенос web/src/lib/pieces.ts: те же силуэты и цвета).
// Одна семья с кубиком сахара: простой силуэт, мягкий свет сверху-слева, максимум одна деталь.
import 'dart:math';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';

import '../core/models.dart';

enum FoodShape { crystal, drop, flame, grain, egg }

const shapeOf = {
  MetricId.salt: FoodShape.crystal,
  MetricId.fat: FoodShape.drop,
  MetricId.kcal: FoodShape.flame,
  MetricId.carbs: FoodShape.grain,
  MetricId.protein: FoodShape.egg,
};

class Piece {
  /// силуэт в квадрате 100×100 с центром в нуле (строка SVG)
  final String body;
  final List<Color> colors;

  /// единственная деталь: вторая форма, линия или грани
  final String? inner, line;
  final List<Color> innerColors;
  final Color lineColor;
  final double lineWidth, edge;
  final List<(String, double)> facets;
  final Color rim;

  /// выпуклый контур для столкновений, в долях стороны
  final List<Offset> hull;
  const Piece({
    required this.body,
    required this.colors,
    required this.rim,
    required this.hull,
    this.inner,
    this.innerColors = const [],
    this.line,
    this.lineColor = Colors.transparent,
    this.lineWidth = 0,
    this.edge = 10,
    this.facets = const [],
  });
}

const pieces = <FoodShape, Piece>{
  FoodShape.crystal: Piece(
    body:
        'M-4 -46Q0 -50 4 -46L25 -27Q29 -23 29 -17L29 15Q29 21 25 25L4 46Q0 50 -4 46L-25 25Q-29 21 -29 15L-29 -17Q-29 -23 -25 -27Z',
    colors: [Color(0xFFFFF6F9), Color(0xFFFFD3E0), Color(0xFFEE8FAD)],
    rim: Color(0x3DA83460),
    edge: 5.0,
    facets: [
      ('M0 -50L-29 -22L-13 -14L0 -27Z', 0.75),
      ('M0 -50L29 -22L13 -14L0 -27Z', 0.34),
      ('M-29 -22L-29 20L-13 12L-13 -14Z', 0.42),
      ('M29 -22L29 20L13 12L13 -14Z', -0.16),
      ('M-29 20L0 50L0 25L-13 12Z', -0.06),
      ('M29 20L0 50L0 25L13 12Z', -0.3),
      ('M0 -27L13 -14L13 12L0 25L-13 12L-13 -14Z', 0.66),
    ],
    hull: [
      Offset(-0.29, -0.2),
      Offset(0.0, -0.48),
      Offset(0.29, -0.2),
      Offset(0.29, 0.19),
      Offset(0.0, 0.48),
      Offset(-0.29, 0.19),
    ],
  ),
  FoodShape.drop: Piece(
    body:
        'M0 -48C4 -48 6 -45 9 -40C18 -24 37 -8 37 14C37 34 21 48 0 48C-21 48 -37 34 -37 14C-37 -8 -18 -24 -9 -40C-6 -45 -4 -48 0 -48Z',
    colors: [Color(0xFFFFF3B8), Color(0xFFFFCE45), Color(0xFFF39B0E)],
    rim: Color(0x42A05600),
    hull: [
      Offset(-0.36, 0.06),
      Offset(-0.22, -0.22),
      Offset(0.0, -0.48),
      Offset(0.22, -0.22),
      Offset(0.36, 0.06),
      Offset(0.3, 0.33),
      Offset(0.0, 0.48),
      Offset(-0.3, 0.33),
    ],
  ),
  FoodShape.flame: Piece(
    body:
        'M3 -47C5 -49 9 -47 10 -44C15 -28 38 -16 38 13C38 34 21 48 0 48C-21 48 -38 34 -38 12C-38 -2 -31 -12 -25 -20C-23 -23 -19 -22 -18 -19C-16 -14 -14 -11 -10 -9C-13 -23 -9 -37 3 -47Z',
    colors: [Color(0xFFFFC58A), Color(0xFFFF7F45), Color(0xFFE8412A)],
    rim: Color(0x3D8C1808),
    edge: 6.0,
    inner:
        'M2 -4C3 -6 6 -6 7 -4C10 6 21 11 21 25C21 38 12 46 0 46C-12 46 -21 38 -21 25C-21 16 -16 11 -12 6C-10 4 -8 5 -7 7C-6 9 -5 10 -3 11C-4 5 -2 0 2 -4Z',
    innerColors: [Color(0xFFFFF4C7), Color(0xFFFFDB73), Color(0xFFFFB63B)],
    hull: [
      Offset(-0.37, 0.06),
      Offset(-0.23, -0.22),
      Offset(0.05, -0.48),
      Offset(0.29, -0.18),
      Offset(0.38, 0.1),
      Offset(0.3, 0.34),
      Offset(0.0, 0.48),
      Offset(-0.3, 0.34),
    ],
  ),
  FoodShape.grain: Piece(
    body:
        'M0 -49C4 -49 8 -45 12 -40C24 -26 29 -8 27 12C25 34 13 48 0 49C-13 48 -25 34 -27 12C-29 -8 -24 -26 -12 -40C-8 -45 -4 -49 0 -49Z',
    colors: [Color(0xFFFFEBC2), Color(0xFFF3BE6E), Color(0xFFC9812F)],
    rim: Color(0x426E3A08),
    line: 'M0 -26C3 -10 3 12 0 32',
    lineColor: Color(0x758C4E12),
    lineWidth: 5.5,
    hull: [
      Offset(-0.27, 0.02),
      Offset(-0.18, -0.3),
      Offset(0.0, -0.49),
      Offset(0.18, -0.3),
      Offset(0.27, 0.02),
      Offset(0.21, 0.3),
      Offset(0.0, 0.49),
      Offset(-0.21, 0.3),
    ],
  ),
  FoodShape.egg: Piece(
    body:
        'M0 -48C20 -48 37 -18 38 9C38 32 22 47 0 47C-22 47 -38 32 -38 9C-37 -18 -20 -48 0 -48Z',
    colors: [Color(0xFFFFFFFF), Color(0xFFFFFAF0), Color(0xFFE3D4C3)],
    rim: Color(0x38785228),
    inner: 'M0 -9A20 20 0 1 1 0 31A20 20 0 1 1 0 -9Z',
    innerColors: [Color(0xFFFFE283), Color(0xFFFFBE2E), Color(0xFFF28E0B)],
    hull: [
      Offset(-0.37, 0.1),
      Offset(-0.23, -0.32),
      Offset(0.0, -0.48),
      Offset(0.23, -0.32),
      Offset(0.37, 0.1),
      Offset(0.28, 0.36),
      Offset(0.0, 0.47),
      Offset(-0.28, 0.36),
    ],
  ),
};

const _crystalScale = [.86, 1.04, .94, 1.12];

/// Крупинки соли чуть разного размера; остальные фигурки одинаковые.
double pieceScale(FoodShape shape, int variant) =>
    shape == FoodShape.crystal ? _crystalScale[variant % 4] : 1;

List<Offset> foodHull(FoodShape shape, int variant) => [
  for (final p in pieces[shape]!.hull) p * pieceScale(shape, variant),
];

final _paths = <String, Path>{};

/// Путь из строки SVG: команды M, L, Q, C, A, Z с абсолютными координатами.
Path svgPath(String d) => _paths.putIfAbsent(d, () {
  final path = Path();
  for (final m in RegExp(r'([MLQCAZ])([^MLQCAZ]*)').allMatches(d)) {
    final n = [
      for (final x in RegExp(r'-?\d*\.?\d+').allMatches(m[2]!))
        double.parse(x[0]!),
    ];
    switch (m[1]) {
      case 'M':
        path.moveTo(n[0], n[1]);
        for (var i = 2; i + 1 < n.length; i += 2) {
          path.lineTo(n[i], n[i + 1]);
        }
      case 'L':
        for (var i = 0; i + 1 < n.length; i += 2) {
          path.lineTo(n[i], n[i + 1]);
        }
      case 'Q':
        for (var i = 0; i + 3 < n.length; i += 4) {
          path.quadraticBezierTo(n[i], n[i + 1], n[i + 2], n[i + 3]);
        }
      case 'C':
        for (var i = 0; i + 5 < n.length; i += 6) {
          path.cubicTo(n[i], n[i + 1], n[i + 2], n[i + 3], n[i + 4], n[i + 5]);
        }
      case 'A':
        for (var i = 0; i + 6 < n.length; i += 7) {
          path.arcToPoint(
            Offset(n[i + 5], n[i + 6]),
            radius: Radius.elliptical(n[i], n[i + 1]),
            rotation: n[i + 2],
            largeArc: n[i + 3] == 1,
            clockwise: n[i + 4] == 1,
          );
        }
      default:
        path.close();
    }
  }
  return path;
});

final _pictures = <(FoodShape, int, bool), ui.Picture>{};

/// Нарисовать фигурку с центром в нуле. Холст уже повёрнут на [angle]: он нужен, чтобы блик остался сверху-слева.
void drawFoodPiece(
  Canvas canvas,
  FoodShape shape,
  double size, {
  int variant = 0,
  double angle = 0,
  bool shadow = false,
}) {
  final frame = shadow ? 0 : (angle * 24 / (pi * 2)).round() % 24;
  final picture = _pictures.putIfAbsent((
    shape,
    frame,
    shadow,
  ), () => _makePicture(shape, frame * pi / 12, shadow));
  canvas.save();
  canvas.scale(size * pieceScale(shape, variant) / 100);
  canvas.drawPicture(picture);
  canvas.restore();
}

ui.Picture _makePicture(FoodShape shape, double angle, bool shadow) {
  final p = pieces[shape]!;
  final record = ui.PictureRecorder();
  final canvas = Canvas(record);
  final body = svgPath(p.body);
  if (shadow) {
    canvas.drawPath(body, Paint()..color = const Color(0x3D041069));
    return record.endRecording();
  }
  // направление света в координатах повёрнутой фигурки
  Offset turn(double x, double y) =>
      Offset(x * cos(angle) + y * sin(angle), -x * sin(angle) + y * cos(angle));
  Paint shade(List<Color> c, double r, [Offset at = Offset.zero]) => Paint()
    ..shader = ui.Gradient.linear(
      at + turn(-r * .72, -r),
      at + turn(r * .6, r),
      c,
      const [0, .5, 1],
    );

  canvas.drawPath(body, shade(p.colors, 46));
  canvas.save();
  canvas.clipPath(body);
  for (final (path, light) in p.facets) {
    canvas.drawPath(
      svgPath(path),
      Paint()
        ..color = light > 0
            ? Colors.white.withValues(alpha: light)
            : const Color(0xFFC43A6E).withValues(alpha: -light),
    );
  }
  if (p.inner != null) {
    canvas.drawPath(
      svgPath(p.inner!),
      shade(p.innerColors, 22, Offset(0, shape == FoodShape.egg ? 11 : 22)),
    );
  }
  if (p.line != null) {
    canvas.drawPath(
      svgPath(p.line!),
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = p.lineWidth
        ..strokeCap = StrokeCap.round
        ..color = p.lineColor,
    );
  }
  // фаска: светлый край сверху-слева, тень снизу-справа
  canvas.drawPath(
    body,
    Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = p.edge
      ..shader = ui.Gradient.linear(
        turn(-40, -44),
        turn(40, 46),
        [
          Colors.white.withValues(alpha: .95),
          Colors.white.withValues(alpha: .18),
          p.rim,
        ],
        const [0, .42, 1],
      ),
  );
  // короткий блик
  if (shape != FoodShape.crystal) {
    final at = turn(
      shape == FoodShape.grain ? -11 : -17,
      shape == FoodShape.egg ? -19 : -6,
    );
    canvas.translate(at.dx, at.dy);
    canvas.rotate(-angle - .62);
    canvas.scale(1, .42);
    canvas.drawCircle(
      Offset.zero,
      15,
      Paint()
        ..shader = ui.Gradient.radial(Offset.zero, 15, [
          Colors.white.withValues(alpha: .92),
          Colors.white.withValues(alpha: 0),
        ]),
    );
  }
  canvas.restore();
  canvas.drawPath(
    body,
    Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2
      ..color = p.rim,
  );
  return record.endRecording();
}

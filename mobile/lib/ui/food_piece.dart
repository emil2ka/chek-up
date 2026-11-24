import 'dart:math';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';

enum FoodShape { salt, butter, bread, egg, ember }

const _hulls = {
  FoodShape.butter: [
    Offset(-.51, -.09),
    Offset(-.29, -.33),
    Offset(.51, -.22),
    Offset(.52, .05),
    Offset(.31, .28),
    Offset(-.50, .15),
  ],
  FoodShape.bread: [
    Offset(-.52, .02),
    Offset(-.39, -.21),
    Offset(-.09, -.30),
    Offset(.28, -.27),
    Offset(.49, -.14),
    Offset(.53, .05),
    Offset(.38, .23),
    Offset(-.29, .26),
  ],
  FoodShape.egg: [
    Offset(-.37, .10),
    Offset(-.23, -.32),
    Offset(0, -.48),
    Offset(.23, -.32),
    Offset(.37, .10),
    Offset(.28, .36),
    Offset(0, .47),
    Offset(-.28, .36),
  ],
  FoodShape.ember: [
    Offset(-.47, -.04),
    Offset(-.32, -.31),
    Offset(.02, -.43),
    Offset(.33, -.29),
    Offset(.47, -.03),
    Offset(.39, .23),
    Offset(.11, .39),
    Offset(-.30, .31),
  ],
};
const _saltOutlines = [
  [
    Offset(-.50, -.09),
    Offset(-.23, -.42),
    Offset(.16, -.46),
    Offset(.43, -.22),
    Offset(.49, .11),
    Offset(.21, .39),
    Offset(-.19, .42),
    Offset(-.46, .23),
  ],
  [
    Offset(-.52, .08),
    Offset(-.34, -.30),
    Offset(-.04, -.46),
    Offset(.34, -.35),
    Offset(.50, -.02),
    Offset(.32, .24),
    Offset(-.06, .40),
    Offset(-.39, .33),
  ],
  [
    Offset(-.46, -.15),
    Offset(-.13, -.44),
    Offset(.18, -.39),
    Offset(.50, -.13),
    Offset(.42, .18),
    Offset(.07, .45),
    Offset(-.31, .32),
    Offset(-.48, .07),
  ],
  [
    Offset(-.50, .00),
    Offset(-.24, -.32),
    Offset(.09, -.39),
    Offset(.41, -.25),
    Offset(.50, .05),
    Offset(.31, .29),
    Offset(-.04, .38),
    Offset(-.40, .24),
  ],
];
const _saltScale = [.85, 1.04, .92, 1.11];

List<Offset> foodHull(FoodShape shape, int variant) => shape == FoodShape.salt
    ? [for (final point in _saltOutlines[variant]) point * _saltScale[variant]]
    : _hulls[shape]!;

final _egg = Path()
  ..moveTo(0, -48)
  ..cubicTo(19, -48, 36, -17, 37, 9)
  ..cubicTo(38, 32, 22, 47, 0, 47)
  ..cubicTo(-23, 47, -39, 31, -38, 8)
  ..cubicTo(-37, -18, -18, -48, 0, -48)
  ..close();
final _butter = Path()
  ..moveTo(-49, -11)
  ..lineTo(-30, -30)
  ..quadraticBezierTo(-27, -33, -23, -32)
  ..lineTo(48, -22)
  ..quadraticBezierTo(52, -21, 52, -17)
  ..lineTo(52, 2)
  ..quadraticBezierTo(52, 5, 49, 8)
  ..lineTo(33, 25)
  ..quadraticBezierTo(31, 28, 27, 27)
  ..lineTo(-47, 15)
  ..quadraticBezierTo(-51, 14, -51, 10)
  ..lineTo(-51, -7)
  ..quadraticBezierTo(-51, -10, -49, -11)
  ..close();
final _butterTop = Path()
  ..moveTo(-49, -11)
  ..lineTo(-30, -30)
  ..quadraticBezierTo(-27, -33, -23, -32)
  ..lineTo(48, -22)
  ..quadraticBezierTo(52, -21, 51, -18)
  ..lineTo(33, 1)
  ..quadraticBezierTo(31, 4, 27, 3)
  ..lineTo(-47, -8)
  ..quadraticBezierTo(-50, -8, -49, -11)
  ..close();
final _butterEnd = Path()
  ..moveTo(32, 2)
  ..lineTo(51, -18)
  ..quadraticBezierTo(52, -20, 52, -17)
  ..lineTo(52, 2)
  ..quadraticBezierTo(52, 5, 49, 8)
  ..lineTo(33, 25)
  ..quadraticBezierTo(31, 28, 27, 27)
  ..lineTo(28, 5)
  ..close();
final _butterEdge = Path()
  ..moveTo(-46, -8)
  ..lineTo(27, 3)
  ..quadraticBezierTo(31, 4, 33, 1)
  ..lineTo(49, -16);
final _bread = Path()
  ..moveTo(-50, -4)
  ..cubicTo(-47, -19, -28, -27, -8, -29)
  ..cubicTo(13, -31, 37, -25, 47, -13)
  ..cubicTo(55, -5, 52, 9, 44, 17)
  ..cubicTo(27, 30, -3, 31, -28, 24)
  ..cubicTo(-43, 20, -55, 9, -50, -4)
  ..close();
final _breadBase = Path()
  ..moveTo(-51, 0)
  ..cubicTo(-40, 10, -22, 15, -1, 16)
  ..cubicTo(20, 17, 40, 11, 51, 1)
  ..cubicTo(52, 9, 48, 15, 44, 17)
  ..cubicTo(27, 30, -3, 31, -28, 24)
  ..cubicTo(-42, 21, -51, 11, -51, 0)
  ..close();
final _breadScore = Path()
  ..moveTo(-9, -13)
  ..cubicTo(-5, -18, 4, -17, 10, -11)
  ..cubicTo(11, -8, 7, -8, 4, -9)
  ..cubicTo(-1, -12, -5, -13, -9, -13)
  ..close();
final _breadScoreRim = Path()
  ..moveTo(-7, -12)
  ..cubicTo(-1, -12, 4, -10, 8, -9);
final _coal = Path()
  ..moveTo(-47, -4)
  ..lineTo(-33, -31)
  ..lineTo(-2, -43)
  ..lineTo(31, -29)
  ..lineTo(47, -4)
  ..lineTo(37, 25)
  ..lineTo(11, 39)
  ..lineTo(-29, 33)
  ..close();
final _fault = Path()
  ..moveTo(-31, 24)
  ..lineTo(-20, 9)
  ..lineTo(-6, 7)
  ..lineTo(-4, -4)
  ..lineTo(6, -10)
  ..lineTo(14, -24)
  ..lineTo(29, -25)
  ..moveTo(-4, -4)
  ..lineTo(-17, -13)
  ..lineTo(-18, -22)
  ..moveTo(6, -10)
  ..lineTo(19, -2)
  ..lineTo(30, -2)
  ..lineTo(39, 8)
  ..moveTo(11, 34)
  ..lineTo(11, 19)
  ..lineTo(3, 16)
  ..lineTo(-6, 7);
final _coalHighlight = Path()
  ..moveTo(-46, -5)
  ..lineTo(-33, -31)
  ..lineTo(-2, -43)
  ..lineTo(-10, -22)
  ..lineTo(-21, -9)
  ..close();
final _coalShadow = Path()
  ..moveTo(-8, 18)
  ..lineTo(7, -8)
  ..lineTo(30, -10)
  ..lineTo(38, 24)
  ..lineTo(11, 39)
  ..close();
final _faultHighlight = Path()
  ..moveTo(-5, 6)
  ..lineTo(-4, -4)
  ..lineTo(6, -10)
  ..lineTo(12, -21)
  ..moveTo(20, -2)
  ..lineTo(29, -2);

final _pictures = <(FoodShape, int, int, bool), ui.Picture>{};

void drawFoodPiece(
  Canvas canvas,
  FoodShape shape,
  double size, {
  int variant = 0,
  double angle = 0,
  bool shadow = false,
}) {
  final frame = shadow ? 0 : (angle * 24 / (pi * 2)).round() % 24;
  if (shape == FoodShape.butter || shape == FoodShape.bread) variant = 0;
  final picture = _pictures.putIfAbsent((
    shape,
    variant,
    frame,
    shadow,
  ), () => _makePicture(shape, variant, frame * pi / 12, shadow));
  canvas.save();
  canvas.scale(size / 100);
  canvas.drawPicture(picture);
  canvas.restore();
}

Path _poly(List<Offset> points) => Path()..addPolygon(points, true);

ui.Picture _makePicture(
  FoodShape shape,
  int variant,
  double angle,
  bool shadow,
) {
  final record = ui.PictureRecorder();
  final canvas = Canvas(record);
  final paint = Paint();
  final salt = shape == FoodShape.salt
      ? foodHull(shape, variant).map((point) => point * 100).toList()
      : const <Offset>[];
  final path = switch (shape) {
    FoodShape.salt => _poly(salt),
    FoodShape.butter => _butter,
    FoodShape.bread => _bread,
    FoodShape.egg => _egg,
    FoodShape.ember => _coal,
  };
  final light = Offset(
    -24 * cos(angle) - 29 * sin(angle),
    24 * sin(angle) - 29 * cos(angle),
  );

  void tint(Path outline, Color color) {
    canvas.drawPath(
      outline,
      paint
        ..shader = null
        ..style = PaintingStyle.fill
        ..color = color,
    );
  }

  void material(Path outline, List<Color> colors) {
    final gradient = ui.Gradient.radial(
      Offset(light.dx * .55, light.dy * .77),
      56,
      colors,
      [0, .57, 1],
    );
    canvas.drawPath(
      outline,
      paint
        ..shader = gradient
        ..style = PaintingStyle.fill
        ..color = Colors.white,
    );
  }

  void line(Path outline, Color color, double width) {
    canvas.drawPath(
      outline,
      paint
        ..shader = null
        ..style = PaintingStyle.stroke
        ..color = color
        ..strokeWidth = width
        ..strokeCap = StrokeCap.round
        ..strokeJoin = StrokeJoin.round,
    );
  }

  if (shadow) {
    tint(path, const Color(0x42182558));
    return record.endRecording();
  }
  switch (shape) {
    case FoodShape.salt:
      final ridge = [
        for (final (index, point) in salt.indexed)
          const Offset(4.5, -8.5) + point * (index % 3 == 0 ? .47 : .63),
      ];
      material(path, const [
        Color(0xFFFCFEFF),
        Color(0xFFCEE4FB),
        Color(0xFF7898D6),
      ]);
      for (var index = 0; index < salt.length; index++) {
        final next = (index + 1) % salt.length;
        final segment = salt[next] - salt[index];
        final dx = segment.dx * cos(angle) - segment.dy * sin(angle);
        final dy = segment.dx * sin(angle) + segment.dy * cos(angle);
        final shade = (dx - dy * .63) / segment.distance;
        final color = shade > 0
            ? Colors.white.withValues(alpha: .12 + shade * .45)
            : const Color(0xFF224899).withValues(alpha: .10 - shade * .32);
        tint(
          _poly([salt[index], salt[next], ridge[next], ridge[index]]),
          color,
        );
      }
      material(_poly(ridge), const [
        Color(0xFFFDFEFF),
        Color(0xFFE1EFFF),
        Color(0xFFADCDF4),
      ]);
    case FoodShape.egg:
      final colors = switch (variant % 3) {
        1 => const [Color(0xFFFFFAF0), Color(0xFFE8C7AD), Color(0xFF9D6E60)],
        2 => const [Color(0xFFFFFEF6), Color(0xFFEADED0), Color(0xFF827983)],
        _ => const [Color(0xFFFFF5DF), Color(0xFFE6B892), Color(0xFFA16754)],
      };
      material(path, colors);
      canvas.save();
      canvas.clipPath(path);
      for (var index = 0; index < 15; index++) {
        final x = ((index * 61 + variant * 31) % 65) - 32.0;
        final y = ((index * 23 + variant * 17) % 74) - 35.0;
        canvas.drawCircle(
          Offset(x, y),
          index % 5 == 0 ? 1.65 : .94,
          paint
            ..shader = null
            ..color = const Color(0x42713C2B),
        );
      }
      canvas.restore();
    case FoodShape.butter:
      material(path, const [
        Color(0xFFFFF3B4),
        Color(0xFFF3D080),
        Color(0xFFD69D4C),
      ]);
      material(_butterEnd, const [
        Color(0xFFEDC975),
        Color(0xFFD7A754),
        Color(0xFFB67D39),
      ]);
      material(_butterTop, const [
        Color(0xFFFFFBE0),
        Color(0xFFFFECAA),
        Color(0xFFF1D284),
      ]);
      line(_butterEdge, const Color(0xDBFFFCE0), 2.5);
    case FoodShape.bread:
      material(path, const [
        Color(0xFFEDB969),
        Color(0xFFCF8039),
        Color(0xFF914622),
      ]);
      material(_breadBase, const [
        Color(0xFFCA853F),
        Color(0xFFA95D2B),
        Color(0xFF743F25),
      ]);
      for (final offset in const [-24.0, 0.0, 24.0]) {
        canvas.save();
        canvas.translate(offset, offset.abs() * .095);
        canvas.rotate(.64);
        line(_breadScore, const Color(0xFFA14E22), 4.6);
        tint(_breadScore, const Color(0xFFFFE0A3));
        line(_breadScoreRim, const Color(0xFFFFF0C1), 2.4);
        canvas.restore();
      }
    case FoodShape.ember:
      material(path, const [
        Color(0xFF76645F),
        Color(0xFF3D303A),
        Color(0xFF1C1426),
      ]);
      tint(_coalHighlight, const Color(0x29ECA475));
      tint(_coalShadow, const Color(0x4A0D0A1A));
      line(_fault, const Color(0x80883E2D), 7.5);
      line(
        _fault,
        variant.isOdd ? const Color(0xFFE0783C) : const Color(0xFFC75A37),
        2.1,
      );
      line(_faultHighlight, const Color(0xFFFFD983), 1.4);
  }
  return record.endRecording();
}

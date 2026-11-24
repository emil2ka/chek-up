// Куча кубиков сахара: физика forge2d + отрисовка на Canvas.
// Виджет декларативный: меняешь target — кубики досыпаются сверху или лопаются.
// Тап подбрасывает кубики, наклон телефона пересыпает их, встряска подкидывает всю кучу.
import 'dart:async';
import 'dart:math';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';
import 'package:flutter/services.dart';
import 'package:forge2d/forge2d.dart' as f;
import 'package:sensors_plus/sensors_plus.dart';

import '../core/models.dart';
import 'food_piece.dart';

const _pourMs = 2400.0; // за сколько высыпается вся порция
const _popMs = 340.0;
const _unit = 0.6; // сторона кубика в единицах физики
const _g = 26.0;

class _Pop {
  final double x, y, a;
  final FoodShape? shape;
  final int variant;
  double t = 0;
  _Pop(this.x, this.y, this.a, this.shape, this.variant);
}

class _Spark {
  double x, y, vx, vy, t = 0;
  final double life, s;
  _Spark(this.x, this.y, this.vx, this.vy, this.life, this.s);
}

/// Цвета кубика: у каждого показателя свой материал.
class PilePalette {
  final Color top, side, edge, grain;
  final FoodShape? shape;
  const PilePalette({
    required this.top,
    required this.side,
    required this.edge,
    required this.grain,
    this.shape,
  });
}

const pileSugar = PilePalette(
  top: Colors.white,
  side: Color(0xFFB4C4F6),
  edge: Color(0xFFD9E2FC),
  grain: Color(0x5590A4E6),
);

/// Вид кубиков за стрик: рафинад → тростниковый → нават → кристалл (как CUBE_SKINS на сайте).
const _skins = <int, PilePalette>{
  4: PilePalette(
    top: Color(0xFFF3D3A0),
    side: Color(0xFFB9803A),
    edge: Color(0xFFDDAE6B),
    grain: Color(0x66966024),
  ),
  12: PilePalette(
    top: Color(0xFFFFE08A),
    side: Color(0xFFE79A12),
    edge: Color(0xFFFFCF5C),
    grain: Color(0x77FFF6CD),
  ),
  26: PilePalette(
    top: Color(0xFFE6F9FF),
    side: Color(0xFF79CBEF),
    edge: Color(0xFFBFE9FA),
    grain: Color(0x88FFFFFF),
  ),
  52: PilePalette(
    top: Color(0xFFF7E8FF),
    side: Color(0xFFBE86EE),
    edge: Color(0xFFE2C4F8),
    grain: Color(0x88FFFFFF),
  ),
};
PilePalette skinFor(int level) => _skins[level] ?? pileSugar;

/// Сахар — кубик, остальное — фигурки (food_piece.dart).
PilePalette _figure(MetricId m) => PilePalette(
  top: pileSugar.top,
  side: pileSugar.side,
  edge: pileSugar.edge,
  grain: pileSugar.grain,
  shape: shapeOf[m],
);
final pilePalettes = <MetricId, PilePalette>{
  for (final m in MetricId.values)
    m: m == MetricId.sugar ? pileSugar : _figure(m),
};

class SugarPile extends StatefulWidget {
  /// сколько кубиков должно лежать
  final int target;

  /// цвета кубиков; несколько — вперемешку (у каждого «рисунка» свой цвет)
  final List<PilePalette> palettes;

  /// сторона кубика в пикселях для данного размера области
  final double Function(Size size) cubeSize;

  /// вызывается при появлении и исчезновении каждого кубика
  final ValueChanged<int>? onCount;

  /// пол выше нижнего края области на столько пикселей

  /// сам ловит тапы (иначе их передают через tossAt)
  final bool interactive;
  const SugarPile({
    this.palettes = const [pileSugar],
    super.key,
    required this.target,
    required this.cubeSize,
    this.onCount,
    this.interactive = true,
  });

  @override
  State<SugarPile> createState() => SugarPileState();
}

class SugarPileState extends State<SugarPile>
    with SingleTickerProviderStateMixin {
  final _rnd = Random();
  final _repaint = ChangeNotifier();
  late final Ticker _ticker;
  f.World _world = f.World(f.Vector2(0, _g));
  f.Body? _walls;
  final List<f.Body> _cubes = [];
  final List<_Pop> _pops = [];
  final List<_Spark> _sparks = [];

  Size _size = Size.zero;
  double _s = 0; // сторона кубика, px
  double get _ppm => _s / _unit;
  int _queue = 0, _popQueue = 0;
  double _spawnEvery = 40, _spawnAcc = 0, _popEvery = 50, _popAcc = 0, _acc = 0;
  Duration _last = Duration.zero;
  double _gx = 0;
  int _lastShake = 0;
  Offset? _downAt;
  int _downT = 0;
  final _heat = <f.Body, double>{};
  bool get _granular =>
      widget.palettes.every((pal) => pal.shape == FoodShape.crystal);
  StreamSubscription? _accSub, _shakeSub;

  int get count => _cubes.length + _queue - _popQueue;

  void _listenContacts() {
    if (widget.palettes.any((pal) => pal.shape == FoodShape.flame)) {
      _world.setContactListener(
        _PileContacts((contact) {
          final speed =
              (contact.bodyA.linearVelocity - contact.bodyB.linearVelocity)
                  .length;
          if (speed < 5) return;
          for (final body in [contact.bodyA, contact.bodyB]) {
            if (body.userData is int &&
                _palette(body).shape == FoodShape.flame) {
              _heat[body] = max(_heat[body] ?? 0, min(.86, speed / 18));
            }
          }
        }),
      );
    }
  }

  @override
  void initState() {
    super.initState();
    _ticker = createTicker(_tick)..start();
    _listenSensors();
  }

  void _listenSensors() {
    if (kIsWeb) {
      return; // в браузере датчики требуют отдельного разрешения — там хватает тапов
    }
    try {
      _accSub =
          accelerometerEventStream(
            samplingPeriod: SensorInterval.gameInterval,
          ).listen(
            (e) {
              final gx = (-e.x / 9.8).clamp(-1.0, 1.0) * _g * .9;
              if ((gx - _gx).abs() < .5) return;
              _gx = gx;
              _world.gravity = f.Vector2(_gx, _g);
              _wake();
            },
            onError: (_) {},
            cancelOnError: true,
          );
      _shakeSub =
          userAccelerometerEventStream(
            samplingPeriod: SensorInterval.gameInterval,
          ).listen(
            (e) {
              final now = DateTime.now().millisecondsSinceEpoch;
              if (e.x * e.x + e.y * e.y + e.z * e.z > 190 &&
                  now - _lastShake > 700) {
                _lastShake = now;
                tossAll();
              }
            },
            onError: (_) {},
            cancelOnError: true,
          );
    } catch (_) {
      /* датчиков нет — работаем без наклона */
    }
  }

  @override
  void didUpdateWidget(SugarPile old) {
    super.didUpdateWidget(old);
    if (old.target != widget.target) _setTarget(widget.target);
  }

  @override
  void dispose() {
    _accSub?.cancel();
    _shakeSub?.cancel();
    _ticker.dispose();
    _repaint.dispose();
    super.dispose();
  }

  void _wake() {
    for (final b in _cubes) {
      b.setAwake(true);
    }
  }

  // ── размеры ──
  void _layout(Size size) {
    if (size == _size || size.isEmpty) return;
    final s = widget.cubeSize(size);
    final fresh = s != _s;
    _size = size;
    _s = s;
    if (fresh) {
      // другой размер кубика — начинаем заново
      _world = f.World(f.Vector2(_gx, _g));
      _listenContacts();
      _heat.clear();
      _walls = null;
      _cubes.clear();
      _pops.clear();
      _sparks.clear();
      _queue = 0;
      _popQueue = 0;
    }
    if (_walls != null) _world.destroyBody(_walls!);
    final w = size.width / _ppm,
        floor = size.height / _ppm,
        up = -size.height * 6 / _ppm;
    final walls = _world.createBody(f.BodyDef());
    for (final (a, b) in [
      (f.Vector2(-2, floor), f.Vector2(w + 2, floor)),
      (f.Vector2(0, up), f.Vector2(0, floor)),
      (f.Vector2(w, up), f.Vector2(w, floor)),
    ]) {
      walls.createFixture(
        f.FixtureDef(f.EdgeShape()..set(a, b), friction: .9, restitution: .1),
      );
    }
    _walls = walls;
    _wake();
    if (fresh) {
      WidgetsBinding.instance.addPostFrameCallback(
        (_) => mounted ? _setTarget(widget.target) : null,
      );
    }
  }

  // ── количество ──
  void _setTarget(int n) {
    final d = max(0, n) - count;
    if (d > 0) {
      // сначала отменяем ожидающие «лопнуть»
      final back = min(d, _popQueue);
      _popQueue -= back;
      _queue += d - back;
      _spawnEvery = (_pourMs / max(1, _queue)).clamp(10.0, 90.0);
    } else if (d < 0) {
      final cut = min(-d, _queue);
      _queue -= cut;
      _popQueue += -d - cut;
      _popEvery = (700 / max(1, _popQueue)).clamp(8.0, 70.0);
      HapticFeedback.mediumImpact();
    }
  }

  void _spawn() {
    final w = _size.width;
    final x =
        (w * .5 +
                (_rnd.nextDouble() - .5) * w * (_granular ? .42 : .62) +
                (_rnd.nextDouble() - .5) * w * .22)
            .clamp(_s, w - _s);
    final y = -_s * (1 + _rnd.nextDouble() * 2.5);
    final variant = _rnd.nextInt(6);
    final shape = widget.palettes[variant % widget.palettes.length].shape;
    final (density, friction, restitution) = switch (shape) {
      FoodShape.crystal => (1.15, .62, .13),
      FoodShape.drop => (1.3, .45, .12),
      FoodShape.grain => (1.0, .55, .20),
      FoodShape.egg => (1.5, .24, .26),
      FoodShape.flame => (1.0, .48, .24),
      null => (1.0, .55, .14),
    };
    final collision = f.PolygonShape();
    if (shape == null) {
      collision.setAsBoxXY(_unit * .485, _unit * .485);
    } else {
      collision.set([
        for (final point in foodHull(shape, variant))
          f.Vector2(point.dx * _unit, point.dy * _unit),
      ]);
    }
    final body = _world.createBody(
      f.BodyDef(
        type: f.BodyType.dynamic,
        position: f.Vector2(x / _ppm, y / _ppm),
        angle: _rnd.nextDouble() * pi,
        angularVelocity: (_rnd.nextDouble() - .5) * 5,
        linearVelocity: f.Vector2((_rnd.nextDouble() - .5) * 3, 4),
        angularDamping: shape == FoodShape.egg ? .36 : .7,
        linearDamping: .04,
        userData: variant,
      ),
    );
    body.createFixture(
      f.FixtureDef(
        collision,
        density: density,
        friction: friction,
        restitution: restitution,
      ),
    );
    _cubes.add(body);
    widget.onCount?.call(_cubes.length);
  }

  void _pop() {
    if (_cubes.isEmpty) return;
    // лопается один из верхних кубиков
    var best = 0;
    for (var i = 1; i < _cubes.length; i++) {
      if (_cubes[i].position.y < _cubes[best].position.y) best = i;
    }
    final b = _cubes.removeAt(best);
    final x = b.position.x * _ppm, y = b.position.y * _ppm;
    final shape = _palette(b).shape;
    _pops.add(_Pop(x, y, b.angle, shape, b.userData as int));
    for (var i = 0; shape == null && i < 6; i++) {
      final a = _rnd.nextDouble() * pi * 2,
          v = _s * (3 + _rnd.nextDouble() * 5);
      _sparks.add(
        _Spark(
          x,
          y,
          cos(a) * v,
          sin(a) * v - _s * 3,
          300 + _rnd.nextDouble() * 260,
          _s * (.08 + _rnd.nextDouble() * .1),
        ),
      );
    }
    _heat.remove(b);
    _world.destroyBody(b);
    _wake();
    widget.onCount?.call(_cubes.length);
  }

  // ── касания ──
  /// Подбросить кубики рядом с точкой (координаты области).
  void tossAt(Offset p) {
    var hit = false;
    final r = _granular ? max(65.0, _s * 4.8) : max(80.0, _s * 3.2);
    for (final b in _cubes) {
      final dx = b.position.x * _ppm - p.dx, dy = b.position.y * _ppm - p.dy;
      final d = sqrt(dx * dx + dy * dy);
      if (d > r) continue;
      hit = true;
      final shape = _palette(b).shape;
      final strength =
          (1 - d / r) * (_granular || shape == FoodShape.drop ? .74 : 1);
      if (shape == FoodShape.flame) _heat[b] = max(_heat[b] ?? 0, strength);
      final k = strength * b.mass;
      b.applyLinearImpulse(
        f.Vector2(
          dx / max(d, 1) * 5 * k + (_rnd.nextDouble() - .5) * 2 * k,
          -(9 + _rnd.nextDouble() * 6) * k,
        ),
      );
      b.applyAngularImpulse((_rnd.nextDouble() - .5) * .25 * k);
    }
    if (hit) HapticFeedback.lightImpact();
  }

  void tossAll() {
    if (_cubes.isEmpty) return;
    for (final b in _cubes) {
      b.applyLinearImpulse(
        f.Vector2((_rnd.nextDouble() - .5) * 6, -(8 + _rnd.nextDouble() * 9)) *
            b.mass,
      );
      b.applyAngularImpulse((_rnd.nextDouble() - .5) * .2 * b.mass);
    }
    HapticFeedback.heavyImpact();
  }

  PilePalette _palette(f.Body body) =>
      widget.palettes[((body.userData as int?) ?? 0) % widget.palettes.length];

  // ── цикл ──
  void _tick(Duration now) {
    final dt = min(50.0, (now - _last).inMicroseconds / 1000);
    _last = now;
    if (_s == 0) return;

    if (_queue > 0) {
      _spawnAcc += dt;
      while (_spawnAcc >= _spawnEvery && _queue > 0) {
        _spawnAcc -= _spawnEvery;
        _queue--;
        _spawn();
      }
    }
    if (_popQueue > 0) {
      _popAcc += dt;
      while (_popAcc >= _popEvery && _popQueue > 0) {
        _popAcc -= _popEvery;
        _popQueue--;
        _pop();
      }
    }

    var moving =
        _heat.isNotEmpty ||
        _queue > 0 ||
        _popQueue > 0 ||
        _pops.isNotEmpty ||
        _sparks.isNotEmpty;
    if (!moving) {
      for (final b in _cubes) {
        if (b.isAwake) {
          moving = true;
          break;
        }
      }
    }
    if (!moving) return;

    _acc += dt;
    var steps = 0;
    while (_acc >= 1000 / 60 && steps < 3) {
      _world.stepDt(1 / 60);
      _acc -= 1000 / 60;
      steps++;
    }
    if (steps == 3) _acc = 0;
    final cooling = pow(.8, dt / (1000 / 60));
    _heat.updateAll((body, heat) => heat * cooling);
    _heat.removeWhere((body, heat) => heat < .015);

    for (final p in _pops) {
      p.t += dt;
    }
    _pops.removeWhere((p) => p.t >= _popMs);
    for (final s in _sparks) {
      s.t += dt;
      s.x += s.vx * dt / 1000;
      s.y += s.vy * dt / 1000;
      s.vy += _s * 30 * dt / 1000;
    }
    _sparks.removeWhere((s) => s.t >= s.life);
    // ignore: invalid_use_of_protected_member, invalid_use_of_visible_for_testing_member
    _repaint.notifyListeners();
  }

  @override
  Widget build(BuildContext context) {
    final paint = LayoutBuilder(
      builder: (context, c) {
        _layout(c.biggest);
        return RepaintBoundary(
          child: CustomPaint(
            size: c.biggest,
            painter: _PilePainter(this),
            isComplex: true,
            willChange: true,
          ),
        );
      },
    );
    if (!widget.interactive) return IgnorePointer(child: paint);
    return Listener(
      behavior: HitTestBehavior.translucent,
      onPointerDown: (e) {
        _downAt = e.localPosition;
        _downT = DateTime.now().millisecondsSinceEpoch;
      },
      onPointerUp: (e) {
        final d = _downAt;
        _downAt = null;
        if (d != null &&
            (e.localPosition - d).distance < 12 &&
            DateTime.now().millisecondsSinceEpoch - _downT < 450) {
          tossAt(e.localPosition);
        }
      },
      onPointerCancel: (_) => _downAt = null,
      child: paint,
    );
  }
}

class _PileContacts extends f.ContactListener {
  final void Function(f.Contact) onContact;
  _PileContacts(this.onContact);

  @override
  void beginContact(f.Contact contact) => onContact(contact);
}

class _PilePainter extends CustomPainter {
  final SugarPileState st;
  _PilePainter(this.st) : super(repaint: st._repaint);

  static final _shadow = Paint()..color = const Color(0x38041069);
  static final _side = Paint();
  static final _top = Paint();
  static final _edge = Paint()..style = PaintingStyle.stroke;
  static final _grain = Paint();
  // рисунки крупинок: (x, y, размер) в долях стороны
  static const _grains = [
    [(-.22, -.2, .07), (.18, .1, .06), (-.05, .24, .05), (.24, -.24, .05)],
    [(.2, -.18, .07), (-.24, .14, .06), (.04, .02, .05), (.1, .26, .05)],
    [(-.2, .2, .07), (.22, .22, .05), (-.02, -.24, .06), (.26, -.04, .05)],
    [(0.0, 0.0, .07), (-.26, -.06, .05), (.2, -.26, .06), (-.12, .26, .05)],
  ];

  @override
  void paint(Canvas canvas, Size size) {
    final s = st._s;
    if (s == 0) return;
    final ppm = st._ppm, h = s * .96 / 2;
    final rr = RRect.fromRectAndRadius(
      Rect.fromLTRB(-h, -h, h, h),
      Radius.circular(s * .16),
    );
    _edge.strokeWidth = max(1, s * .05);

    void each(double dy, void Function(f.Body b) draw) {
      for (final b in st._cubes) {
        canvas.save();
        canvas.translate(b.position.x * ppm, b.position.y * ppm + dy);
        canvas.rotate(b.angle);
        draw(b);
        canvas.restore();
      }
    }

    each(s * .2, (b) {
      final shape = st._palette(b).shape;
      if (shape == null) {
        canvas.drawRRect(rr, _shadow);
      } else {
        drawFoodPiece(
          canvas,
          shape,
          s,
          variant: b.userData as int,
          shadow: true,
        );
      }
    });
    each(s * .12, (b) {
      final pal = st._palette(b);
      if (pal.shape == null) canvas.drawRRect(rr, _side..color = pal.side);
    });
    each(0, (b) {
      final pal = st._palette(b);
      final shape = pal.shape;
      if (shape != null) {
        drawFoodPiece(
          canvas,
          shape,
          s,
          variant: b.userData as int,
          angle: b.angle,
        );
        final heat = st._heat[b];
        if (heat != null) {
          final glow = Rect.fromCircle(center: Offset.zero, radius: s * .67);
          canvas.drawCircle(
            Offset.zero,
            glow.width / 2,
            Paint()
              ..blendMode = BlendMode.plus
              ..shader = RadialGradient(
                colors: [
                  const Color(0xFFFFDB8F).withValues(alpha: heat * .74),
                  const Color(0xFFFF7334).withValues(alpha: heat * .61),
                  const Color(0x00FF4E1F),
                ],
                stops: const [0, .28, 1],
              ).createShader(glow),
          );
        }
        return;
      }
      canvas.drawRRect(rr, _top..color = pal.top);
      canvas.drawRRect(
        rr.deflate(_edge.strokeWidth / 2),
        _edge..color = pal.edge,
      );
      _grain.color = pal.grain;
      if (s >= 16) {
        for (final (x, y, d) in _grains[((b.userData as int?) ?? 0) % 4]) {
          canvas.drawRRect(
            RRect.fromRectAndRadius(
              Rect.fromCenter(
                center: Offset(x * s, y * s),
                width: d * s,
                height: d * s,
              ),
              Radius.circular(d * s * .3),
            ),
            _grain,
          );
        }
      }
    });

    // лопающиеся кубики: белая рамка расширяется и тает
    for (final p in st._pops) {
      final q = p.t / _popMs;
      canvas.save();
      canvas.translate(p.x, p.y);
      canvas.rotate(p.a);
      final shape = p.shape;
      if (shape != null) {
        canvas.saveLayer(
          Rect.fromCircle(center: Offset.zero, radius: s),
          Paint()..color = Colors.white.withValues(alpha: 1 - q),
        );
        drawFoodPiece(canvas, shape, s, variant: p.variant, angle: p.a);
        canvas.restore();
        canvas.restore();
        continue;
      }
      canvas.scale(1 + q * .9);
      canvas.drawRRect(
        rr,
        Paint()
          ..color = Colors.white.withValues(alpha: (1 - q) * .9)
          ..style = PaintingStyle.stroke
          ..strokeWidth = max(1, s * .14 * (1 - q)),
      );
      canvas.restore();
    }
    for (final k in st._sparks) {
      final q = 1 - k.t / k.life;
      canvas.drawRRect(
        RRect.fromRectAndRadius(
          Rect.fromCenter(
            center: Offset(k.x, k.y),
            width: k.s * 2,
            height: k.s * 2,
          ),
          Radius.circular(k.s * .5),
        ),
        Paint()..color = Colors.white.withValues(alpha: q.clamp(0, 1)),
      );
    }
  }

  @override
  bool shouldRepaint(_PilePainter oldDelegate) => false;
}

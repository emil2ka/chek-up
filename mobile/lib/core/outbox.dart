// Очередь чеков: сфоткал и убрал телефон. Фото лежат в папке приложения, читаются по одному, без сети ждут.
// Как только чек прочитан, фото удаляются. В веб-сборке файлов нет, очередь живёт до закрытия вкладки.
import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:flutter/foundation.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:path_provider/path_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'calendar.dart';
import 'i18n.dart';
import 'models.dart';
import 'scan.dart';
import 'store.dart';

const _key = 'chekup.outbox';
const _maxTries = 8;

class ScanJob {
  final String id;
  final int createdAt;

  /// wait, work, error
  String status;
  String? error;
  int tries;
  String? qr;
  List<String> paths;
  List<Uint8List>? bytes;
  ScanJob({
    required this.id,
    required this.createdAt,
    this.status = 'wait',
    this.error,
    this.tries = 0,
    this.qr,
    this.paths = const [],
    this.bytes,
  });

  Map<String, dynamic> toJson() => {
    'id': id,
    'createdAt': createdAt,
    'status': status,
    'error': error,
    'tries': tries,
    'qr': qr,
    'paths': paths,
  };
  static ScanJob? tryJson(Object? j) =>
      j is Map && j['id'] is String && j['paths'] is List
      ? ScanJob(
          id: j['id'],
          createdAt: (j['createdAt'] as num?)?.toInt() ?? 0,
          // «работавший» прервался вместе с приложением
          status: j['status'] == 'error' ? 'error' : 'wait',
          error: j['error'] is String ? j['error'] : null,
          tries: (j['tries'] as num?)?.toInt() ?? 0,
          qr: j['qr'] is String ? j['qr'] : null,
          paths: [for (final p in j['paths'] as List) '$p'],
        )
      : null;
}

/// Итог: saved, duplicate, demo или error.
class ScanOutcome {
  final String kind;
  final String? entryId, code, notice;
  final Receipt? receipt;
  const ScanOutcome(
    this.kind, {
    this.entryId,
    this.receipt,
    this.code,
    this.notice,
  });
}

/// Ссылка на чек из QR на фото; null — не нашли или платформа не умеет.
Future<String?> findQr(String path) async {
  if (kIsWeb) return null;
  final c = MobileScannerController(
    autoStart: false,
    formats: const [BarcodeFormat.qrCode],
  );
  try {
    final found = await c
        .analyzeImage(path)
        .timeout(const Duration(seconds: 4));
    for (final b in found?.barcodes ?? const <Barcode>[]) {
      final v = b.rawValue ?? '';
      if (v.startsWith('http')) return v;
    }
  } catch (_) {
    /* прочитаем с фото */
  } finally {
    c.dispose();
  }
  return null;
}

class Outbox extends ChangeNotifier {
  final List<ScanJob> _jobs = [];
  final _waiters = <String, void Function(ScanOutcome)>{};
  final _cancelled = <String>{};
  SharedPreferences? _sp;
  Timer? _timer;
  bool _running = false;

  /// Кому сообщать о чеках, которых на экране никто не ждёт.
  void Function(ScanOutcome)? onBackground;

  List<ScanJob> get jobs => List.unmodifiable(_jobs);
  static String newId() =>
      'j${nowMs().toRadixString(36)}${Random().nextInt(1 << 20).toRadixString(36)}';

  Future<Directory> _dir() async {
    final d = Directory(
      '${(await getApplicationSupportDirectory()).path}/scans',
    );
    return d.create(recursive: true);
  }

  void _persist() {
    if (!kIsWeb) {
      _sp?.setString(_key, jsonEncode([for (final j in _jobs) j.toJson()]));
    }
    notifyListeners();
  }

  /// Поднять очередь, оставшуюся с прошлого раза.
  Future<void> load() async {
    try {
      _sp = await SharedPreferences.getInstance();
      final raw = jsonDecode(_sp!.getString(_key) ?? '[]') as List;
      for (final j in raw.map(ScanJob.tryJson).whereType<ScanJob>()) {
        // очень старые больше не нужны
        if (nowMs() - j.createdAt > 30 * 86400000) {
          await _deleteFiles(j);
        } else if (!_jobs.any((x) => x.id == j.id)) {
          _jobs.add(j);
        }
      }
    } catch (e) {
      debugPrint('Очередь чеков не прочиталась: $e');
    }
    _persist();
    unawaited(run());
  }

  Future<void> _deleteFiles(ScanJob j) async {
    for (final p in j.paths) {
      try {
        await File(p).delete();
      } catch (_) {
        /* уже удалён */
      }
    }
  }

  /// Добавить чек в очередь. Фото лежат по путям [paths] (временные файлы камеры).
  Future<void> enqueue(
    List<String> paths,
    List<Uint8List> bytes, {
    String? id,
  }) async {
    final jobId = id ?? newId();
    String? qr;
    final kept = <String>[];
    if (!kIsWeb) {
      for (final p in paths.take(3)) {
        qr ??= await findQr(p);
      }
      try {
        final dir = await _dir();
        for (final (i, b) in bytes.take(3).indexed) {
          final f = File('${dir.path}/$jobId-$i.jpg');
          await f.writeAsBytes(b);
          kept.add(f.path);
        }
      } catch (_) {
        kept.clear(); // места нет — прочитаем из памяти
      }
    }
    final job = ScanJob(
      id: jobId,
      createdAt: nowMs(),
      qr: qr,
      paths: kept,
      bytes: kept.isEmpty ? bytes.take(3).toList() : null,
    );
    if (_cancelled.remove(jobId)) {
      await _deleteFiles(job); // отменили, пока готовили фото
      return;
    }
    _jobs.add(job);
    _persist();
    unawaited(run());
  }

  /// Дождаться чека на экране; отмена ожидания не отменяет чтение.
  void waitFor(String id, void Function(ScanOutcome) fn) => _waiters[id] = fn;
  void stopWaiting(String id) => _waiters.remove(id);

  void _done(ScanJob j, ScanOutcome o) {
    final w = _waiters.remove(j.id);
    w != null ? w(o) : onBackground?.call(o);
  }

  Future<List<Uint8List>> _photos(ScanJob j) async =>
      j.bytes ?? [for (final p in j.paths) await File(p).readAsBytes()];

  Future<void> run() async {
    if (_running) return;
    _running = true;
    _timer?.cancel();
    try {
      for (;;) {
        final job = _jobs.where((j) => j.status == 'wait').firstOrNull;
        if (job == null) return;
        job
          ..status = 'work'
          ..tries += 1;
        _persist();
        try {
          final List<Uint8List> photos;
          try {
            photos = await _photos(job);
          } catch (_) {
            throw ScanError('bad_request');
          }
          final r = await recognize(photos, job.qr);
          if (!_jobs.contains(job)) continue; // пока читали, человек удалил
          await remove(job.id);
          if (r.notice != null) {
            _done(
              job,
              ScanOutcome('demo', receipt: r.receipt, notice: r.notice),
            );
            continue;
          }
          final s = store.saveReceipt(r.receipt);
          _done(
            job,
            ScanOutcome(
              s.duplicate ? 'duplicate' : 'saved',
              entryId: s.id,
              receipt: r.receipt,
            ),
          );
          if (!s.duplicate && r.pending.isNotEmpty) {
            unawaited(refineEntry(s.id, r.receipt, r.pending));
          }
        } catch (e) {
          if (!_jobs.contains(job)) continue;
          final code = e is ScanError ? e.code : 'unavailable';
          // без сети и при сбое сервера чек ждёт; остальное — про само фото
          final wait =
              (code == 'unavailable' || code == 'rate_limit') &&
              job.tries < _maxTries;
          job
            ..status = wait ? 'wait' : 'error'
            ..error = code;
          _persist();
          if (!wait) {
            _done(job, ScanOutcome('error', code: code));
            continue;
          }
          _waiters.remove(job.id)?.call(ScanOutcome('error', code: code));
          _timer = Timer(
            Duration(seconds: min(120, 4 * pow(2, job.tries).toInt())),
            run,
          );
          return;
        }
      }
    } finally {
      _running = false;
    }
  }

  void retry(String id) {
    final j = _jobs.where((j) => j.id == id).firstOrNull;
    if (j == null) return;
    j
      ..status = 'wait'
      ..tries = 0
      ..error = null;
    _persist();
    unawaited(run());
  }

  Future<void> remove(String id) async {
    final j = _jobs.where((j) => j.id == id).firstOrNull;
    if (j == null) {
      _cancelled.add(id);
      return;
    }
    _jobs.remove(j);
    _persist();
    await _deleteFiles(j);
  }

  Future<void> clear() async {
    for (final j in [..._jobs]) {
      await remove(j.id);
    }
  }
}

final outbox = Outbox();

String scanErrorText(String? code) =>
    t(scanErrors[code] ?? scanErrors['unavailable']!);

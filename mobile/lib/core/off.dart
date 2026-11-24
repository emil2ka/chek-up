// Товар по штрихкоду из открытой базы Open Food Facts (бесплатно, без ключа).
// В базе — все сахара с этикетки (и добавленные, и природные), поэтому экран честно это подписывает.
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;

import 'models.dart';

class ShelfProduct {
  final String code, name, brand, quantity;

  /// сахара на 100 г/мл
  /// сахар, соль, насыщенные жиры (г) и калории (ккал) на 100 г/мл; null — на этикетке не указано
  final Map<MetricId, double?> per100;

  /// вес или объём упаковки, г/мл (null — неизвестен)
  final double? amount;
  const ShelfProduct({
    required this.code,
    required this.name,
    required this.brand,
    required this.quantity,
    required this.per100,
    this.amount,
  });

  /// сахара на всю упаковку, а если её размер неизвестен — на 100 г
  double? valueOf(MetricId m) {
    final v = per100[m];
    return v == null ? null : (amount == null ? v : v * amount! / 100);
  }

  String get basis => amount == null ? 'в 100 г' : 'в упаковке';
}

class ShelfError implements Exception {
  final String message;
  const ShelfError(this.message);
}

double? _num(Object? v) => v is num
    ? v.toDouble()
    : v is String
    ? double.tryParse(v.replaceAll(',', '.'))
    : null;

Future<ShelfProduct> lookupBarcode(String code) async {
  if (!RegExp(r'^\d{8,14}$').hasMatch(code))
    throw const ShelfError('Это не похоже на штрихкод товара: нужно 8–13 цифр');
  final uri = Uri.parse(
    'https://world.openfoodfacts.org/api/v2/product/$code?fields=product_name,product_name_ru,brands,quantity,product_quantity,nutriments',
  );
  http.Response res;
  try {
    res = await http
        .get(
          uri,
          headers: kIsWeb ? null : {'User-Agent': 'ChekUp/0.2 (mobile app)'},
        )
        .timeout(const Duration(seconds: 15));
  } catch (_) {
    throw const ShelfError('Нет связи с базой товаров. Проверь интернет');
  }
  Map? p;
  try {
    final j = jsonDecode(utf8.decode(res.bodyBytes));
    if (j is Map && j['product'] is Map) p = j['product'];
  } catch (_) {}
  if (p == null)
    throw const ShelfError(
      'Этого товара пока нет в базе. Поищи похожий в справочнике',
    );

  final nu = p['nutriments'] is Map ? p['nutriments'] as Map : const {};
  final per100 = <MetricId, double?>{
    MetricId.sugar: _num(nu['sugars_100g']),
    MetricId.salt: _num(nu['salt_100g']),
    MetricId.fat: _num(nu['saturated-fat_100g']),
    MetricId.kcal: _num(nu['energy-kcal_100g']),
    MetricId.carbs: _num(nu['carbohydrates_100g']),
    MetricId.protein: _num(nu['proteins_100g']),
  };
  if (per100.values.every((v) => v == null)) {
    throw const ShelfError(
      'Товар в базе есть, но состав на этикетке не указан',
    );
  }
  String s(String k) => p![k] is String ? (p[k] as String).trim() : '';
  final name = s('product_name_ru').isNotEmpty
      ? s('product_name_ru')
      : s('product_name');
  final amount = _num(p['product_quantity']);
  return ShelfProduct(
    code: code,
    name: name.isEmpty ? 'Товар $code' : name,
    brand: s('brands').split(',').first.trim(),
    quantity: s('quantity'),
    per100: per100,
    amount: amount != null && amount > 0 && amount <= 20000 ? amount : null,
  );
}

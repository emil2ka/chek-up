// Результат → «Где дешевле»: те же покупки в других магазинах по чекам пользователей «Чек-апа».
import 'package:flutter/material.dart';

import '../core/engine.dart';
import '../core/models.dart';
import '../core/store.dart';
import '../ui/kit.dart';

class PricesCard extends StatefulWidget {
  final Receipt receipt;
  const PricesCard({super.key, required this.receipt});
  @override
  State<PricesCard> createState() => _PricesCardState();
}

class _PricesCardState extends State<PricesCard> {
  late final Future<PriceCompare?> _f = store.priceOffers(widget.receipt);

  Widget _note(String text) => Container(
    padding: const EdgeInsets.all(16),
    decoration: BoxDecoration(
      color: tint,
      borderRadius: BorderRadius.circular(20),
    ),
    child: Text(text, style: body(15, color: mute)),
  );

  @override
  Widget build(BuildContext context) {
    if (!store.syncEnabled) {
      return _note(
        'Сравнение цен работает с сервером «Чек-апа»: собери приложение с адресом сервера (API_URL).',
      );
    }
    return FutureBuilder<PriceCompare?>(
      future: _f,
      builder: (context, snap) {
        if (snap.connectionState != ConnectionState.done)
          return _note('Сравниваю с другими магазинами…');
        final r = snap.data;
        if (r == null)
          return _note(
            'Сравнение цен сейчас недоступно: нет связи с сервером.',
          );
        if (r.offers.isEmpty) {
          return _note(
            r.compared > 0
                ? 'В других магазинах такие же покупки пока не дешевле — по тем чекам, что есть у «Чек-апа».'
                : 'Пока мало данных: цены сравниваются по чекам пользователей «Чек-апа». Отсканируй чеки из других магазинов — и здесь появятся сравнения.',
          );
        }
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 4),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('до ${money(r.total)}', style: disp(34, ls: -.04)),
                  Text(
                    'можно сэкономить на тех же покупках',
                    style: body(15, color: mute),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),
            for (final o in r.offers)
              Container(
                margin: const EdgeInsets.only(bottom: 6),
                padding: const EdgeInsets.symmetric(
                  horizontal: 14,
                  vertical: 10,
                ),
                decoration: BoxDecoration(
                  color: tint,
                  borderRadius: BorderRadius.circular(16),
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(o.name, style: body(14, h: 1.3)),
                          Text(
                            '${money(o.yourPrice)}/${o.unit} здесь · ${o.store} ${money(o.bestPrice)}/${o.unit} (по ${o.n} ${pl(o.n, receiptsDatF)})',
                            style: body(12, color: mute, h: 1.35),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 10),
                    Text(
                      '−${money(o.saving)}',
                      style: disp(
                        15,
                        w: 800,
                        color: const Color(0xFF0E8A51),
                        ls: -.02,
                      ),
                    ),
                  ],
                ),
              ),
            Padding(
              padding: const EdgeInsets.fromLTRB(4, 4, 4, 0),
              child: Text(
                'Цены — медиана по чекам других пользователей за 90 дней, приблизительно.',
                style: body(13, color: mute, h: 1.4),
              ),
            ),
          ],
        );
      },
    );
  }
}

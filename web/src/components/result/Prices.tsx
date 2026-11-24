'use client';
// Результат → «Где дешевле»: те же покупки в других магазинах по чекам пользователей «Чек-апа».
import { useEffect, useState } from 'react';
import { money, pl, type Forms } from '@/lib/engine';
import { t } from '@/lib/i18n';
import { compareReceipt, type CompareResult } from '@/lib/prices';
import type { Receipt } from '@/lib/types';

const RECEIPTS_F: Forms = ['чеку', 'чекам', 'чекам'];

export function Prices({ receipt }: { receipt: Receipt }) {
  const [res, setRes] = useState<CompareResult | null>(null);
  const [state, setState] = useState<'load' | 'ok' | 'off'>('load');

  useEffect(() => {
    let dead = false;
    compareReceipt(receipt)
      .then(r => { if (!dead) { setRes(r); setState('ok'); } })
      .catch(() => { if (!dead) setState('off'); });
    return () => { dead = true; };
  }, [receipt]);

  return (
    <section className="rs-sec" aria-labelledby="rs-h-prices">
      <h2 id="rs-h-prices" className="rs-h">{t('Где дешевле')}</h2>
      {state === 'load' && <p className="rs-empty">{t('Сравниваю с другими магазинами…')}</p>}
      {state === 'off' && <p className="rs-empty">{t('Сравнение цен сейчас недоступно: нет связи с сервером.')}</p>}
      {state === 'ok' && res && (res.offers.length ? (
        <>
          <p className="rs-harm-big"><b>{t('до {m}', { m: money(res.total) })}</b> {t('можно сэкономить на тех же покупках')}</p>
          <ul className="rs-harm-top">
            {res.offers.map(o => (
              <li key={o.name} className="rs-offer">
                <span className="rs-harm-n">
                  {o.name}
                  <small>{t('{a}/{u} здесь · {s} {b}/{u} (по {n} {w})', { a: money(o.yourPrice), u: t(o.unit), s: o.store, b: money(o.bestPrice), n: o.n, w: pl(o.n, RECEIPTS_F) })}</small>
                </span>
                <span className="rs-offer-s">−{money(o.saving)}</span>
              </li>
            ))}
          </ul>
          <p className="rs-harm-sub">{t('Цены: медиана по чекам других пользователей за 90 дней, приблизительно.')}</p>
        </>
      ) : res.compared ? (
        <p className="rs-empty">{t('В других магазинах такие же покупки пока не дешевле по тем чекам, что есть у «Чек-апа».')}</p>
      ) : (
        <p className="rs-empty">{t('Пока мало данных: цены сравниваем по чекам пользователей «Чек-апа».')}</p>
      ))}
    </section>
  );
}

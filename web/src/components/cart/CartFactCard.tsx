// Чек сверен с корзиной: что осталось в магазине.
import { cubesOfValue, CUBES, money, pl } from '@/lib/engine';
import { t } from '@/lib/i18n';
import type { CartFact } from '@/lib/types';
import './cart.css';

export function CartFactCard({ fact }: { fact: CartFact }) {
  const cubes = cubesOfValue(Math.max(0, fact.saved.sugar), 'sugar');
  return (
    <section className="rs-sec rs-cartfact" aria-labelledby="rs-h-cart">
      <h2 id="rs-h-cart">{t('До кассы: {a} из {b}', { a: fact.kept, b: fact.planned })}</h2>
      {(cubes > 0 || fact.money > 0) && <p className="rs-cartfact-n">{[cubes > 0 ? `${cubes} ${pl(cubes, CUBES)}` : '', fact.money > 0 ? money(fact.money) : ''].filter(Boolean).join(' · ')}</p>}
      {fact.kept > 0 && <p>{t('осталось в магазине, а не дома.')}</p>}
      {fact.slipped.length > 0 && <p>{t('Всё-таки в чеке: {list}.', { list: fact.slipped.join('; ') })}</p>}
    </section>
  );
}

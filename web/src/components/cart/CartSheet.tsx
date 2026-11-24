'use client';
// «Проверить корзину»: сфоткать то, что в руках, или прислать скриншот заказа.
import { t } from '@/lib/i18n';
import { IconBasket, IconCamera, IconChevron, IconImage } from '@/components/icons';
import { iconCls, rowCls } from '@/components/ui/kit';
import { Sheet } from '@/components/ui/Sheet';

export function CartSheet({ onCamera, onGallery, onDemo, onClose }: { onCamera(): void; onGallery(): void; onDemo(): void; onClose(): void }) {
  const row = (Icon: typeof IconCamera, title: string, hint: string, fn: () => void, focus = false) => (
    <button type="button" data-autofocus={focus || undefined} className={`${rowCls} py-3`} onClick={fn}>
      <span className={iconCls}><Icon className="size-5" /></span>
      <span className="min-w-0 flex-1"><span className="block">{title}</span><span className="mt-0.5 block text-[13px] leading-snug font-semibold text-mute">{hint}</span></span>
      <IconChevron className="size-5 text-mute" />
    </button>
  );
  return (
    <Sheet title={t('Проверим корзину')} kicker={t('До кассы')} onClose={onClose}>
      <div className="grid gap-2">
        {row(IconCamera, t('Сфоткать корзину'), t('тележка, пакет или товары в руках; поверни упаковки названиями к камере'), onCamera, true)}
        {row(IconImage, t('Скриншот или фото'), t('корзина из приложения доставки, до трёх снимков'), onGallery)}
        {row(IconBasket, t('Показать на примере'), t('как это выглядит'), onDemo)}
      </div>
    </Sheet>
  );
}

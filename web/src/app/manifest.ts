import type { MetadataRoute } from 'next';

// Веб-манифест: с ним «Чек-ап» ставится на экран телефона и открывается без адресной строки.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Чек-ап: узнай всё, что ты покупаешь',
    short_name: 'Чек-ап',
    description: 'До кассы подскажем, что убрать из корзины, после покажем, что вышло по чеку: сахар, соль, жиры, калории, углеводы и белки.',
    lang: 'ru',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#1238F5',
    theme_color: '#1238F5',
    categories: ['health', 'food', 'lifestyle'],
    share_target: {
      action: '/share',
      method: 'post',
      enctype: 'multipart/form-data',
      params: { files: [{ name: 'photo', accept: ['image/*'] }] },
    },
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
    ],
  };
}

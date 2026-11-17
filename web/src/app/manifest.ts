import type { MetadataRoute } from 'next';

// Веб-манифест: с ним «Чек-ап» ставится на экран телефона и открывается без адресной строки.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Чек-ап — сколько сахара в твоём чеке',
    short_name: 'Чек-ап',
    description: 'Сфоткай чек из магазина — покажем сахар кубиками и подскажем, что заменить.',
    lang: 'ru',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#1238F5',
    theme_color: '#1238F5',
    categories: ['health', 'food', 'lifestyle'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
    ],
  };
}

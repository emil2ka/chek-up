import type { Metadata, Viewport } from 'next';
import '@fontsource-variable/unbounded';
import '@fontsource-variable/manrope';
import '@fontsource-variable/golos-text';
import '@fontsource-variable/montserrat';
import './globals.css';

export const metadata: Metadata = {
  title: 'Чек-ап: узнай всё, что ты покупаешь',
  description: 'До кассы подскажем, что убрать из корзины, после покажем, что вышло по чеку: сахар, соль, жиры, калории, углеводы и белки, траты.',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Чек-ап' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#1238F5',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}

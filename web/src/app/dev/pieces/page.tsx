// Страница для разработки фигурок: /dev/pieces
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Pieces } from './Pieces';

export const metadata: Metadata = { title: 'Чек-ап · фигурки (разработка)', robots: { index: false } };

export default function Page() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <Pieces />;
}

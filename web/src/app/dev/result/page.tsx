// Страница для разработки экрана результата: /dev/result?r=week|party|fit
import { Suspense } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import DevResult from './DevResult';

export const metadata: Metadata = { title: 'Чек-ап · экран результата (разработка)', robots: { index: false } };

export default function Page() {
  if (process.env.NODE_ENV === 'production') notFound();
  return (
    <Suspense fallback={<main className="h-dvh bg-sky" />}>
      <DevResult />
    </Suspense>
  );
}

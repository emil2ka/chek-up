// Страница для разработки экрана результата: /dev/result?r=week|party|fit
import { Suspense } from 'react';
import type { Metadata } from 'next';
import DevResult from './DevResult';

export const metadata: Metadata = { title: 'Чек-ап · экран результата (разработка)', robots: { index: false } };

export default function Page() {
  return (
    <Suspense fallback={<main className="h-dvh bg-sky" />}>
      <DevResult />
    </Suspense>
  );
}

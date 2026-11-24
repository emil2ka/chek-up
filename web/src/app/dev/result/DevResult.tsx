'use client';
// Экран результата в таком же прокручиваемом контейнере, как в оболочке (ChekupApp): чек — из ?r=.
import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { RECEIPTS } from '@/lib/data';
import Result from '@/components/result/Result';
import type { Receipt } from '@/lib/types';

const baseReceipt = RECEIPTS[0];
const saltSamples: Receipt[] = [
  { ...baseReceipt, id: 'salt-small', title: 'Маленькая покупка', items: baseReceipt.items.slice(0, 3) },
  { ...baseReceipt, id: 'salt-medium', title: 'Покупки на день', items: [0, 5, 6, 12].map(index => baseReceipt.items[index]) },
];

export default function DevResult() {
  const id = useSearchParams().get('r') ?? 'week';
  const [swaps, setSwaps] = useState<number[]>([]);
  const receipt = [...RECEIPTS, ...saltSamples].find(r => r.id === id) ?? baseReceipt;

  return (
    <main className="relative isolate mx-auto h-dvh w-full max-w-[430px] overflow-hidden bg-blue-1">
      <section className="no-scrollbar absolute inset-0 overflow-x-hidden overflow-y-auto overscroll-contain bg-sky text-white">
        <Result
          key={receipt.id}
          receipt={receipt}
          swaps={swaps}
          onBack={() => console.info('[dev] назад')}
          onScan={() => console.info('[dev] сканировать новый чек')}
          onSwaps={setSwaps}
        />
      </section>
    </main>
  );
}

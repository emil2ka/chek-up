'use client';
// Экран результата в таком же прокручиваемом контейнере, как в оболочке (ChekupApp): чек — из ?r=.
import { useSearchParams } from 'next/navigation';
import { RECEIPTS } from '@/lib/data';
import Result from '@/components/result/Result';
import type { Analysis } from '@/lib/types';

declare global {
  interface Window { __result?: { swaps: number[]; analysis: Analysis; calls: number } }
}

export default function DevResult() {
  const id = useSearchParams().get('r') ?? 'week';
  const receipt = RECEIPTS.find(r => r.id === id) ?? RECEIPTS[0];

  return (
    <main className="relative isolate mx-auto h-dvh w-full max-w-[430px] overflow-hidden bg-blue-1">
      <section className="no-scrollbar absolute inset-0 overflow-x-hidden overflow-y-auto overscroll-contain bg-sky text-white">
        <Result
          key={receipt.id}
          receipt={receipt}
          swaps={[]}
          onBack={() => console.info('[dev] назад')}
          onScan={() => console.info('[dev] сканировать новый чек')}
          onChange={({ swaps, analysis }) => {
            window.__result = { swaps, analysis, calls: (window.__result?.calls ?? 0) + 1 };
          }}
        />
      </section>
    </main>
  );
}

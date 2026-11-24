'use client';
// Очередь чеков на главной: читается, ждёт сети, не прочитался.
import { t } from '@/lib/i18n';
import { outbox, scanErrorText, type JobInfo } from '@/lib/outbox';
import { IconClock, IconReceipt, IconTrash } from '@/components/icons';

export function OutboxCards({ jobs, onManual }: { jobs: JobInfo[]; onManual(jobId: string): void }) {
  if (!jobs.length) return null;
  return (
    <ul className="pointer-events-auto mt-3 grid gap-2 [text-shadow:none]" aria-label={t('Очередь чеков')} aria-live="polite">
      {jobs.map(j => (
        <li key={j.id} className="on-light rounded-[20px] bg-white px-3.5 py-3 text-ink">
          <div className="flex items-center gap-3">
            <span className={`grid size-9 flex-none place-items-center rounded-xl bg-tint ${j.status === 'error' ? 'text-bad' : 'text-blue-1'}`}>{j.status === 'work' ? <IconReceipt className="size-5" /> : <IconClock className="size-5" />}</span>
            <p className="min-w-0 flex-1 text-[14px] leading-snug font-bold">
              {j.status === 'work' ? t('Читаю чек…') : j.status === 'error' ? t(scanErrorText(j.error ?? 'unavailable')) : j.error ? t('Чек в очереди: прочитаем, когда появится связь') : t('Чек в очереди')}
            </p>
            {j.status !== 'work' && <button type="button" onClick={() => void outbox.remove(j.id)} aria-label={t('Убрать чек из очереди')} className="-mr-1.5 grid size-11 flex-none place-items-center rounded-2xl text-mute active:scale-[.9]"><IconTrash className="size-5" /></button>}
          </div>
          {(j.status === 'error' || (j.status === 'wait' && j.error)) && (
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => void outbox.retry(j.id)} className="min-h-11 rounded-2xl bg-blue-1 text-[14px] font-bold text-white active:scale-[.97]">{t('Повторить')}</button>
              <button type="button" onClick={() => onManual(j.id)} className="min-h-11 rounded-2xl bg-tint text-[14px] font-bold active:scale-[.97]">{t('Внести вручную')}</button>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

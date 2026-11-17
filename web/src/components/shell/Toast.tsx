'use client';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { IconClose, IconInfo } from '@/components/icons';

export type ToastMsg = { id: number; text: string } | null;

export function Toast({ msg, onClose }: { msg: ToastMsg; onClose(): void }) {
  const reduce = useReducedMotion();
  return (
    <div role="status" aria-live="polite" style={{ zIndex: 2147483100 }} className="toast-pos pointer-events-none fixed inset-x-0 flex justify-center px-4">
      <AnimatePresence>
        {msg && (
          <motion.div
            key={msg.id}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 80 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 80 }}
            transition={reduce ? { duration: 0.2 } : { type: 'spring', stiffness: 420, damping: 32 }}
            className="pointer-events-auto flex w-full max-w-[398px] items-start gap-3 rounded-[20px] bg-ink px-4 py-3.5 text-sm leading-[1.35] font-semibold text-white shadow-[0_20px_50px_-12px_color-mix(in_srgb,var(--ink)_70%,transparent),inset_0_0_0_1px_color-mix(in_srgb,var(--white)_10%,transparent)]"
          >
            <span className="grid size-7 flex-none place-items-center rounded-[9px] bg-mid text-ink">
              <IconInfo className="size-4.5" />
            </span>
            <span className="flex-1 pt-1">{msg.text}</span>
            <button
              type="button"
              onClick={onClose}
              aria-label="Закрыть уведомление"
              className="-my-2.5 -mr-3 grid size-11 flex-none place-items-center rounded-xl text-white/70"
            >
              <IconClose className="size-4.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

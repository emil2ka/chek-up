'use client';
// Нижняя навигация: плавающая белая панель поверх экранов-разделов.
import { motion, useReducedMotion } from 'motion/react';
import { t } from '@/lib/i18n';
import { IconBars, IconCamera, IconSearch, IconUser } from '@/components/icons';

export type Tab = 'home' | 'week' | 'catalog' | 'profile';

const TABS = [
  { id: 'home', label: 'Чек', Icon: IconCamera },
  { id: 'week', label: 'Неделя', Icon: IconBars },
  { id: 'catalog', label: 'Продукты', Icon: IconSearch },
  { id: 'profile', label: 'Профиль', Icon: IconUser },
] as const;

export function TabBar({ tab, onTab }: { tab: Tab; onTab(t: Tab): void }) {
  const reduce = useReducedMotion();
  return (
    <motion.nav
      aria-label={t('Разделы')}
      initial={reduce ? { opacity: 0 } : { y: 90, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={reduce ? { opacity: 0 } : { y: 90, opacity: 0 }}
      transition={reduce ? { duration: 0.2 } : { type: 'spring', stiffness: 420, damping: 36 }}
      style={{ zIndex: 2147483000 }}
      className="on-light pointer-events-none absolute inset-x-0 bottom-0 px-3 pb-[calc(10px+env(safe-area-inset-bottom))]"
    >
      <ul className="pointer-events-auto grid grid-cols-4 gap-1 rounded-[26px] bg-white p-1.5 shadow-[0_16px_40px_-10px_color-mix(in_srgb,var(--ink)_55%,transparent),inset_0_0_0_1px_var(--line)]">
        {TABS.map(({ id, label, Icon }) => {
          const active = id === tab;
          return (
            <li key={id}>
              <button
                type="button"
                aria-current={active ? 'page' : undefined}
                onClick={() => onTab(id)}
                className={`relative grid h-13 w-full place-content-center justify-items-center gap-0.5 rounded-[20px] text-xs font-extrabold tracking-[-.01em] transition-[color,transform] duration-150 select-none active:scale-[.93] ${
                  active ? 'text-blue-1' : 'text-mute'
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="tab-pill"
                    aria-hidden
                    transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 520, damping: 40 }}
                    className="absolute inset-0 rounded-[20px] bg-tint"
                  />
                )}
                <Icon className="relative size-6" />
                <span className="relative">{t(label)}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </motion.nav>
  );
}

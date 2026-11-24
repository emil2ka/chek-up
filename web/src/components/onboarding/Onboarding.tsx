'use client';
// Знакомство при первом запуске: три шага и состав семьи. Можно пропустить.
import { useState, type CSSProperties } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { METRICS, pl, CUBES, SUGAR_CUBES } from '@/lib/engine';
import { t } from '@/lib/i18n';
import { MAX_ADULTS, MAX_KIDS, familyDailyCubes, profile as profileStore, type Profile } from '@/lib/profile';
import { IconArrow, IconCube } from '@/components/icons';
import { Stepper } from '@/components/ui/Stepper';

const STEPS = 3;
const NORM = 10;
const COLA = Math.round(106 / METRICS.sugar.cubeG);

export function Onboarding({ profile, onDone }: { profile: Profile; onDone(): void }) {
  const reduce = useReducedMotion();
  const [step, setStep] = useState(0);
  const last = step === STEPS - 1;
  const next = () => (last ? onDone() : setStep(s => s + 1));

  const slide = reduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.2 } }
    : {
        initial: { opacity: 0, x: 46 },
        animate: { opacity: 1, x: 0 },
        exit: { opacity: 0, x: -46 },
        transition: { duration: 0.32, ease: [0.2, 0.8, 0.2, 1] as const },
      };

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label={t('Знакомство с приложением')}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 1.04 }}
      transition={{ duration: 0.28 }}
      style={{ zIndex: 2147483200 }}
      className="absolute inset-0 flex flex-col overflow-hidden bg-sky px-5 pt-[calc(env(safe-area-inset-top)+12px)] pb-[calc(20px+env(safe-area-inset-bottom))] text-white"
    >
      <div aria-hidden className="pointer-events-none absolute -top-28 -right-32 size-105 rounded-full bg-[radial-gradient(closest-side,color-mix(in_srgb,var(--blue-3)_60%,transparent),transparent)]" />

      <header className="relative flex min-h-11 items-center justify-between">
        <ol className="flex gap-1.5" aria-label={t('Шаг {a} из {b}', { a: step + 1, b: STEPS })}>
          {Array.from({ length: STEPS }, (_, i) => (
            <li key={i} className={`h-1.5 rounded-full transition-all duration-300 ${i === step ? 'w-8 bg-white' : 'w-1.5 bg-white/40'}`} />
          ))}
        </ol>
        <div className="flex items-center gap-1">
          <button type="button" lang={profile.lang === 'kk' ? 'ru' : 'kk'} onClick={() => profileStore.update({ lang: profile.lang === 'kk' ? 'ru' : 'kk' })} className="min-h-11 rounded-xl px-3 text-[15px] font-extrabold text-white active:opacity-70">
            {profile.lang === 'kk' ? 'Русский' : 'Қазақша'}
          </button>
          {!last && (
            <button type="button" onClick={onDone} className="min-h-11 rounded-xl px-2 text-[15px] font-bold text-white/85 active:opacity-70">
              {t('Пропустить')}
            </button>
          )}
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1 flex-col">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={step} {...slide} className="flex min-h-0 flex-1 flex-col justify-center">
            {step === 0 && (
              <>
                <div className="relative mx-auto mb-9 h-44 w-56" aria-hidden="true">
                  <IconCube className="absolute top-2 left-3 size-36 -rotate-12 text-white drop-shadow-[0_22px_30px_color-mix(in_srgb,var(--ink)_45%,transparent)]" />
                  <IconCube className="absolute right-0 bottom-0 size-22 rotate-14 text-white drop-shadow-[0_14px_20px_color-mix(in_srgb,var(--ink)_45%,transparent)]" />
                  <IconCube className="absolute top-0 right-6 size-12 rotate-28 text-white/90 drop-shadow-[0_8px_12px_color-mix(in_srgb,var(--ink)_40%,transparent)]" />
                </div>
                <h1 className="font-display text-[clamp(34px,10.6vw,44px)] leading-[.98] font-black tracking-[-.045em] text-balance">
                  {t('Чек знает, что ты')} <span className="hl">{t('ешь')}</span>
                </h1>
                <p className="mt-4 max-w-[30ch] text-[17px] leading-[1.42] font-semibold text-white/90">
                  {t('Сфоткай чек из магазина. Покажем, сколько в нём сахара, соли и жиров, и подскажем, что заменить.')}
                </p>
              </>
            )}

            {step === 1 && (
              <>
                <ul className="mx-auto mb-9 grid w-fit grid-cols-5 gap-2.5" aria-label={`${NORM} ${pl(NORM, CUBES)}`}>
                  {Array.from({ length: NORM }, (_, i) => (
                    <li key={i} className="rise" style={{ '--d': `${i * 45}ms` } as CSSProperties}>
                      <IconCube className={`size-13 text-white drop-shadow-[0_8px_12px_color-mix(in_srgb,var(--ink)_38%,transparent)] ${i % 2 ? 'rotate-6' : '-rotate-6'}`} />
                    </li>
                  ))}
                </ul>
                <h1 className="font-display text-[clamp(34px,10.6vw,44px)] leading-[.98] font-black tracking-[-.045em] text-balance">
                  {t('Сахар считаем')} <span className="hl">{t('кубиками')}</span>
                </h1>
                <p className="mt-4 max-w-[30ch] text-[17px] leading-[1.42] font-semibold text-white/90">
                  {t('Один кубик: 5 г сахара. В литре колы около {a} {w}, а взрослому хватит {b} в день.', { a: COLA, w: pl(COLA, CUBES), b: NORM })}
                </p>
              </>
            )}

            {step === 2 && (
              <>
                <h1 className="font-display text-[clamp(32px,10vw,42px)] leading-[.98] font-black tracking-[-.045em] text-balance">
                  {t('Кто ест из этой')} <span className="hl">{t('корзины')}</span>?
                </h1>
                <p className="mt-4 max-w-[32ch] text-[17px] leading-[1.42] font-semibold text-white/90">
                  {t('От этого зависит норма на неделю. Изменить можно в профиле.')}
                </p>
                <div className="mt-6 grid gap-2.5">
                  <Stepper tone="glass" label={t('Взрослые')} hint={t('до {a} г сахара и {b} г соли в день', { a: METRICS.sugar.adult, b: METRICS.salt.adult })} value={profile.adults} min={1} max={MAX_ADULTS} onChange={v => profileStore.updateFamily({ adults: v })} />
                  <Stepper tone="glass" label={t('Дети')} hint={t('до {a} г сахара и {b} г соли в день', { a: METRICS.sugar.kid, b: METRICS.salt.kid })} value={profile.kids} min={0} max={MAX_KIDS} onChange={v => profileStore.updateFamily({ kids: v })} />
                </div>
                <p className="mt-5 text-[16px] font-semibold text-white/92" aria-live="polite">
                  {t('Норма семьи')}: <b className="font-display text-xl font-black">{familyDailyCubes(profile)}</b> {pl(familyDailyCubes(profile), SUGAR_CUBES)} {t('в день')}
                </p>
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <button
        type="button"
        onClick={next}
        className="btn-white relative inline-flex min-h-16 items-center justify-center gap-2.5 rounded-[22px] px-6 font-display text-lg font-bold tracking-[-.01em] transition-transform duration-150 select-none active:scale-[.965]"
      >
        <span>{last ? t('Начать') : t('Дальше')}</span>
        <IconArrow className="size-6" />
      </button>
    </motion.div>
  );
}

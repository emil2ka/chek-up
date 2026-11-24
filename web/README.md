# Чек-ап — веб-версия и сервер (Next.js)

Эта папка — **и сайт, и единственный сервер проекта**: мобильное приложение ([`../mobile`](../mobile)) ходит в те же `/api/*` и в ту же БД.

## Запуск

```bash
pnpm install
cp .env.local.example .env.local   # всё необязательно: без ключей — демо-режим, БД встроенная (PGlite)
pnpm dev                           # http://localhost:3000
```

## Сервер

| Адрес | Что делает |
|---|---|
| `POST /api/scan` | фото чека (до трёх кадров) или QR → позиции и показатели за 3–5 секунд; фото не сохраняются |
| `POST /api/cart` | фото корзины или скриншот заказа (до трёх) → товары до оплаты; цены только видимые, фото не сохраняются |
| `POST /api/cart/settle` | сверка чека с корзинами телефона (сайт считает её сам) |
| `POST /api/scan/enrich` | показатели позиций по названию: справочник, а чего в нём нет — модель |
| `POST /api/corrections` | запомнить исправленные строки для этого магазина |
| `POST /api/auth/anonymous` | гость и токен устройства |
| `GET /api/auth/providers` | какие способы входа настроены |
| `POST /api/auth/email/start` · `verify` | вход по коду из письма (Resend) |
| `POST /api/auth/oidc` | вход через Google или Apple (проверка ID-токена) |
| `POST /api/auth/link` · `link/redeem` | код на 10 минут для второго своего устройства |
| `GET/PATCH/DELETE /api/account` · `export` · `signout` | устройства, имя, выгрузка, удаление, выход |
| `POST /api/family/invite` · `join` · `leave`, `PATCH/DELETE /api/family/members` | семья: владелец, взрослый, ребёнок |
| `POST /api/sync` | только изменения в обе стороны: чеки, отметки недель, список, профиль, семья; стрик считает сервер |
| `POST /api/prices/compare` | где позиции чека дешевле (медианы по чекам за 90 дней) |
| `GET /api/health` | жив ли сервер и БД |

Контракт обмена — `src/lib/syncSchema.ts` (зеркало на Dart — `mobile/lib/core/store.dart`).

## Расчёты

`src/lib/engine.ts` (оценка и показатели), `insights.ts` (неделя, месяц, цель, достижения), `plan.ts` (план и факт, дубли), `streak.ts` (недели подряд), `calendar.ts` (недели по времени Казахстана). Те же формулы на Dart лежат в `mobile/lib/core`; совпадение проверяет `golden.test.ts` вместе с `mobile/test/golden_test.dart`.

Казахский перевод — `src/lib/kk.ts`, полноту проверяет `i18n.test.ts`. После правки словаря: `node scripts/kk-dart.mjs`.

## База данных

Схема — `src/server/db/schema.ts` (Drizzle ORM, Postgres), миграции — `drizzle/`.

- **Локально:** `DATABASE_URL` не задан → встроенный Postgres PGlite в `.data/`, миграции применяются сами.
- **Продакшен:** задай `DATABASE_URL` (Supabase, Neon, свой Postgres) и один раз выполни `pnpm db:migrate`.
- **Изменил схему:** `pnpm db:generate` создаст новую миграцию в `drizzle/`.

## Проверки

```bash
pnpm test          # расчёты, распознавание, клиент, семья, вход, переводы; сервер — на настоящем Postgres (PGlite в памяти)
pnpm exec next typegen && npx tsc --noEmit   # типы маршрутов Next генерирует typegen
pnpm lint
```

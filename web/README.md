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
| `POST /api/scan` | фото чека → позиции, сахар, замены (ИИ через OpenRouter / Gemini / OpenAI / …; без ключа — демо) |
| `POST /api/auth/anonymous` | новый анонимный аккаунт и токен устройства |
| `POST /api/auth/link` · `POST /api/auth/link/redeem` | код на 10 минут, чтобы войти в тот же аккаунт с другого устройства |
| `GET/POST /api/sync` | чеки, профиль, список покупок: слияние «последний записал — прав», удаления «надгробиями» |
| `GET /api/health` | жив ли сервер и БД |

Контракт обмена — `src/lib/syncSchema.ts` (зеркало на Dart — `mobile/lib/core/store.dart`).

## База данных

Схема — `src/server/db/schema.ts` (Drizzle ORM, Postgres), миграции — `drizzle/`.

- **Локально:** `DATABASE_URL` не задан → встроенный Postgres PGlite в `.data/`, миграции применяются сами.
- **Продакшен:** задай `DATABASE_URL` (Supabase, Neon, свой Postgres) и один раз выполни `pnpm db:migrate`.
- **Изменил схему:** `pnpm db:generate` создаст новую миграцию в `drizzle/`.

## Проверки

```bash
pnpm test          # расчёты, распознавание, слияние и интеграционный тест на настоящем Postgres (PGlite в памяти)
npx tsc --noEmit
pnpm lint
```

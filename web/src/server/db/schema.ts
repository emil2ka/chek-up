// Схема БД «Чек-апа» (Postgres). Одна БД на веб-версию и мобильное приложение.
// Данные принадлежат СЕМЬЕ: журнал, список покупок, недели стрика. У нового пользователя сразу есть своя семья из одного человека.
// RLS включена везде и без политик: через публичный API Supabase таблицы недоступны, а наш сервер ходит владельцем таблиц.
// Пользователь может быть анонимным (только устройства) или со входом (identities: почта, Google, Apple).
import { bigint, bigserial, boolean, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import type { Receipt } from '@/lib/types';

const ts = (name: string) => timestamp(name, { withTimezone: true }).notNull().defaultNow();
/** Время изменения в мс (с часов клиента) — по нему решается «кто новее» при синхронизации. */
const ms = (name: string) => bigint(name, { mode: 'number' }).notNull().default(0);
/** Номер изменения внутри сервера: клиент присылает последний виденный и получает только новое. */
const rev = () => bigint('rev', { mode: 'number' }).notNull().default(0);

export type Role = 'owner' | 'adult' | 'child';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull().default(''),
  createdAt: ts('created_at'),
}).enableRLS();

/** Чем человек входит: почта или аккаунт Google/Apple. Одна личность — один пользователь. */
export const identities = pgTable(
  'identities',
  {
    provider: text('provider').notNull(), // email | google | apple
    subject: text('subject').notNull(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    email: text('email').notNull().default(''),
    createdAt: ts('created_at'),
  },
  t => [primaryKey({ columns: [t.provider, t.subject] }), index('identities_user_idx').on(t.userId)],
).enableRLS();

/** Токен устройства хранится только хешем: утечка БД не раскрывает рабочие токены. */
export const devices = pgTable(
  'devices',
  {
    tokenHash: text('token_hash').primaryKey(),
    /** публичный id — чтобы показать устройство в списке и отключить его */
    id: uuid('id').notNull().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    label: text('label').notNull().default(''),
    createdAt: ts('created_at'),
    lastSeenAt: ts('last_seen_at'),
  },
  t => [index('devices_user_idx').on(t.userId)],
).enableRLS();

/** Одноразовый короткий код, чтобы войти в тот же аккаунт с другого устройства. */
export const linkCodes = pgTable('link_codes', {
  code: text('code').primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
}).enableRLS();

/** Коды входа по почте: хранится хеш кода, число попыток ограничено. */
export const emailCodes = pgTable('email_codes', {
  email: text('email').primaryKey(),
  codeHash: text('code_hash').notNull(),
  attempts: integer('attempts').notNull().default(0),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: ts('created_at'),
}).enableRLS();

// ── семья ──
export const families = pgTable('families', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull().default(''),
  adults: integer('adults').notNull().default(1),
  kids: integer('kids').notNull().default(0),
  /** личная цель: на сколько процентов меньше сахара; 0 — не выбрана */
  goal: integer('goal').notNull().default(0),
  updatedAt: ms('updated_at'),
  /** счётчик изменений семьи, выдаёт номера rev */
  rev: rev(),
  createdAt: ts('created_at'),
}).enableRLS();

/** Один человек — в одной семье. */
export const members = pgTable(
  'members',
  {
    userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
    familyId: uuid('family_id').notNull().references(() => families.id, { onDelete: 'cascade' }),
    role: text('role').$type<Role>().notNull().default('owner'),
    joinedAt: ts('joined_at'),
  },
  t => [index('members_family_idx').on(t.familyId)],
).enableRLS();

/** Приглашение в семью: в БД хеш кода, код живёт двое суток и одноразовый. */
export const invites = pgTable('invites', {
  codeHash: text('code_hash').primaryKey(),
  familyId: uuid('family_id').notNull().references(() => families.id, { onDelete: 'cascade' }),
  role: text('role').$type<Role>().notNull().default('adult'),
  createdBy: uuid('created_by').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
}).enableRLS();

/** Личное: не зависит от семьи. adults/kids — остались для старых клиентов, источник правды теперь families. */
export const profiles = pgTable('profiles', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  adults: integer('adults').notNull().default(1),
  kids: integer('kids').notNull().default(0),
  onboarded: boolean('onboarded').notNull().default(false),
  seen: jsonb('seen').$type<string[]>().notNull().default([]),
  lang: text('lang').notNull().default('ru'),
  updatedAt: ms('updated_at'),
}).enableRLS();

// Колонка исторически называется user_id: у старых аккаунтов id семьи равен id пользователя (см. миграцию 0002).
export const history = pgTable(
  'history',
  {
    familyId: uuid('user_id').notNull().references(() => families.id, { onDelete: 'cascade' }),
    id: text('id').notNull(),
    receiptId: text('receipt_id').notNull(),
    store: text('store').notNull().default(''),
    date: text('date').notNull().default(''),
    cubes: integer('cubes').notNull().default(0),
    score: integer('score').notNull().default(0),
    swaps: jsonb('swaps').$type<number[]>().notNull().default([]),
    off: jsonb('off').$type<number[]>().notNull().default([]),
    tag: text('tag').notNull().default(''),
    /** личный чек: другим участникам не отдаём */
    priv: boolean('priv').notNull().default(false),
    /** кто внёс; если аккаунт удалён — null */
    authorId: uuid('author_id').references(() => users.id, { onDelete: 'set null' }),
    /** сам чек — для распознанных по фото; у демо-чеков null */
    receipt: jsonb('receipt').$type<Receipt | null>(),
    updatedAt: ms('updated_at'),
    /** «надгробие»: удаление тоже синхронизируется, иначе чек вернётся с другого устройства */
    deleted: boolean('deleted').notNull().default(false),
    rev: rev(),
  },
  t => [primaryKey({ columns: [t.familyId, t.id] }), index('history_rev_idx').on(t.familyId, t.rev)],
).enableRLS();

export const shopItems = pgTable(
  'shop_items',
  {
    familyId: uuid('user_id').notNull().references(() => families.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    instead: text('instead').notNull().default(''),
    done: boolean('done').notNull().default(false),
    updatedAt: ms('updated_at'),
    deleted: boolean('deleted').notNull().default(false),
    rev: rev(),
  },
  t => [primaryKey({ columns: [t.familyId, t.name] })],
).enableRLS();

/** Закрытые недели — из них сервер считает стрик. */
export const weekMarks = pgTable(
  'week_marks',
  {
    familyId: uuid('family_id').notNull().references(() => families.id, { onDelete: 'cascade' }),
    week: text('week').notNull(), // понедельник YYYY-MM-DD
    state: text('state').$type<'closed' | 'none' | 'open'>().notNull(),
    updatedAt: ms('updated_at'),
    rev: rev(),
  },
  t => [primaryKey({ columns: [t.familyId, t.week] })],
).enableRLS();

/**
 * Цены из отсканированных чеков для сравнения магазинов. Хранится только «категория товара + цена за кг/л + магазин + дата»;
 * по названию чека и человеку купленное не восстановить. Строки привязаны к чеку: правится или удаляется чек — меняются они.
 */
export const pricePoints = pgTable(
  'price_points',
  {
    familyId: uuid('user_id').notNull().references(() => families.id, { onDelete: 'cascade' }),
    entryId: text('entry_id').notNull(),
    /** ключ категории справочника распознавания: soda, sausage, cheese… */
    category: text('category').notNull(),
    /** нормализованное название магазина: «Magnum», «Small» */
    store: text('store').notNull(),
    /** ₸ за 1000 г или 1000 мл */
    unitPrice: integer('unit_price').notNull(),
    /** «л» или «кг» — для подписи */
    unit: text('unit').notNull(),
    /** дата чека YYYY-MM-DD */
    seenOn: text('seen_on').notNull(),
  },
  t => [primaryKey({ columns: [t.familyId, t.entryId, t.category] }), index('price_points_cat_idx').on(t.category, t.store)],
).enableRLS();

/** Счётчики для достижений. Только растут, поэтому сливаются через max. */
export const stats = pgTable('stats', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  barcodes: integer('barcodes').notNull().default(0),
  shopDone: integer('shop_done').notNull().default(0),
  /** личный рекорд стрика: не пропадает при смене семьи */
  bestWeeks: integer('best_weeks').notNull().default(0),
}).enableRLS();

/**
 * Исправления строк чека: «в этом магазине МОЛ ПРОСТ 3,2 — это Молоко Простоквашино». Запоминаем для семьи.
 */
export const corrections = pgTable(
  'corrections',
  {
    familyId: uuid('family_id').notNull().references(() => families.id, { onDelete: 'cascade' }),
    store: text('store').notNull(),
    /** нормализованное прочитанное название */
    raw: text('raw').notNull(),
    item: jsonb('item').$type<{ n: string; s?: number; t?: number; f?: number; k?: number; c?: number; b?: number; w?: number; nf?: 1; junk?: 0 | 1 }>().notNull(),
    updatedAt: ms('updated_at'),
  },
  t => [primaryKey({ columns: [t.familyId, t.store, t.raw] })],
).enableRLS();

/** Сколько раз за день пользователь распознавал чеки: защита платного ключа, общая для всех экземпляров сервера. */
export const usage = pgTable(
  'usage',
  {
    /** userId, 'ip:<адрес>' или 'all' */
    key: text('key').notNull(),
    day: text('day').notNull(),
    n: integer('n').notNull().default(0),
  },
  t => [primaryKey({ columns: [t.key, t.day] })],
).enableRLS();

/** Журнал действий, важных для безопасности (входы, приглашения, удаление). Содержимого чеков нет. */
export const audit = pgTable(
  'audit',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    action: text('action').notNull(),
    createdAt: ts('created_at'),
  },
  t => [index('audit_user_idx').on(t.userId)],
).enableRLS();

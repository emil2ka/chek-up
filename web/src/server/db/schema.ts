// Схема БД «Чек-апа» (Postgres). Одна БД на веб-версию и мобильное приложение.
// Аккаунт анонимный: пользователь = users, а устройства (веб, телефон) — devices; их можно связать кодом.
import { bigint, boolean, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import type { Receipt } from '@/lib/types';

const ts = (name: string) => timestamp(name, { withTimezone: true }).notNull().defaultNow();
/** Время изменения в мс (с часов клиента) — по нему решается «кто новее» при синхронизации. */
const ms = (name: string) => bigint(name, { mode: 'number' }).notNull().default(0);

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  createdAt: ts('created_at'),
});

/** Токен устройства хранится только хешем: утечка БД не раскрывает рабочие токены. */
export const devices = pgTable(
  'devices',
  {
    tokenHash: text('token_hash').primaryKey(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    label: text('label').notNull().default(''),
    createdAt: ts('created_at'),
  },
  t => [index('devices_user_idx').on(t.userId)],
);

/** Одноразовый короткий код, чтобы войти в тот же аккаунт с другого устройства. */
export const linkCodes = pgTable('link_codes', {
  code: text('code').primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});

export const profiles = pgTable('profiles', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  adults: integer('adults').notNull().default(1),
  kids: integer('kids').notNull().default(0),
  onboarded: boolean('onboarded').notNull().default(false),
  seen: jsonb('seen').$type<string[]>().notNull().default([]),
  updatedAt: ms('updated_at'),
});

export const history = pgTable(
  'history',
  {
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    id: text('id').notNull(),
    receiptId: text('receipt_id').notNull(),
    store: text('store').notNull().default(''),
    date: text('date').notNull().default(''),
    cubes: integer('cubes').notNull().default(0),
    score: integer('score').notNull().default(0),
    swaps: jsonb('swaps').$type<number[]>().notNull().default([]),
    /** сам чек — для распознанных по фото; у демо-чеков null */
    receipt: jsonb('receipt').$type<Receipt | null>(),
    updatedAt: ms('updated_at'),
    /** «надгробие»: удаление тоже синхронизируется, иначе чек вернётся с другого устройства */
    deleted: boolean('deleted').notNull().default(false),
  },
  t => [primaryKey({ columns: [t.userId, t.id] })],
);

export const shopItems = pgTable(
  'shop_items',
  {
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    instead: text('instead').notNull().default(''),
    done: boolean('done').notNull().default(false),
    updatedAt: ms('updated_at'),
    deleted: boolean('deleted').notNull().default(false),
  },
  t => [primaryKey({ columns: [t.userId, t.name] })],
);

/**
 * Цены из отсканированных чеков для сравнения магазинов. Хранится только «категория товара + цена за кг/л + магазин + дата»;
 * по названию чека и пользователю купленное не восстановить. Строки привязаны к чеку: правится или удаляется чек — меняются они.
 */
export const pricePoints = pgTable(
  'price_points',
  {
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
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
  t => [primaryKey({ columns: [t.userId, t.entryId, t.category] }), index('price_points_cat_idx').on(t.category, t.store)],
);

/** Счётчики для достижений. Только растут, поэтому сливаются через max. */
export const stats = pgTable('stats', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  barcodes: integer('barcodes').notNull().default(0),
  shopDone: integer('shop_done').notNull().default(0),
});

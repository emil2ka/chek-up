// Что модель обязана вернуть на каждом шаге: JSON Schema для структурированного вывода
// (простое подмножество, которое понимают Gemini, OpenAI strict и Anthropic) и Zod для проверки.
import { z } from 'zod';

// ── Шаг 1: фото → позиции ─────────────────────────────────────────────

export const EXTRACTION_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['is_receipt', 'store', 'date', 'items'],
  properties: {
    is_receipt: { type: 'boolean', description: 'true, если на фото кассовый чек' },
    store: { type: 'string', description: 'магазин или сеть; пустая строка, если не видно' },
    date: { type: 'string', description: 'дата покупки YYYY-MM-DD; пустая строка, если не видно' },
    items: {
      type: 'array',
      description: 'товарные позиции по порядку, без итогов, НДС, оплаты и скидок отдельной строкой',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'qty', 'price'],
        properties: {
          name: { type: 'string', description: 'понятное название с объёмом/весом, сокращения кассы расшифрованы' },
          qty: { type: 'number', description: 'количество; для весового товара — вес в кг' },
          price: { type: 'number', description: 'сумма по строке в тенге' },
        },
      },
    },
  },
} as const;

/** «1 250,00», "1250", 1250 → 1250; иначе NaN */
const num = z.preprocess(v => {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const t = v.replace(/[\s  ₸тгТГ]/g, '').replace(',', '.');
    return t === '' ? NaN : Number(t);
  }
  return NaN;
}, z.number());

export const ExtractionSchema = z.object({
  is_receipt: z.boolean(),
  store: z.string().catch(''),
  date: z.string().catch(''),
  items: z.array(z.object({
    name: z.string(),
    qty: num.catch(1),
    price: num,
  }).loose()).catch([]),
}).loose();
export type Extraction = z.infer<typeof ExtractionSchema>;

// ── Шаг 2: позиции → сахар, «вредное», замена ─────────────────────────

export const ENRICHMENT_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['items'],
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['i', 'sugar_g', 'junk', 'swap_name', 'swap_price', 'swap_sugar_g'],
        properties: {
          i: { type: 'integer', description: 'номер позиции из запроса' },
          sugar_g: { type: 'number', description: 'добавленный сахар на всю позицию, г' },
          junk: { type: 'boolean', description: 'вредный товар: сладкие напитки, сладости, снеки, сладкая выпечка' },
          swap_name: { type: 'string', description: 'замена из того же класса товаров; пустая строка, если не нужна' },
          swap_price: { type: 'number', description: 'примерная цена замены в тенге; 0, если замены нет' },
          swap_sugar_g: { type: 'number', description: 'добавленный сахар замены на тот же объём, г' },
        },
      },
    },
  },
} as const;

export const EnrichmentSchema = z.object({
  items: z.array(z.object({
    i: z.number().int(),
    sugar_g: num,
    junk: z.boolean().catch(false),
    swap_name: z.string().catch(''),
    swap_price: num.catch(0),
    swap_sugar_g: num.catch(0),
  }).loose()),
}).loose();
export type Enrichment = z.infer<typeof EnrichmentSchema>;

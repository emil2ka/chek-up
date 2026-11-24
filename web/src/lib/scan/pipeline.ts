// Распознавание (только сервер).
//   extractPhotos — фото → позиции (модель с картинками), сразу собирается чек по справочнику;
//   enrichItems   — позиции, которых нет в справочнике → показатели и замена (дешёвая текстовая модель), отдельным запросом:
//                   человек видит первые кубики сразу, остальное уточняется в фоне.
import type { ReceiptItem } from '../types';
import { buildItem, lineOf } from './build';
import type { ScanConfig } from './config';
import { CART_JSON_SCHEMA, ENRICHMENT_JSON_SCHEMA, EXTRACTION_JSON_SCHEMA } from './model';
import { parseCart, parseEnrichment, parseExtraction, type Extracted, type ExtractedCart } from './parse';
import { CART_SYSTEM, CART_USER, ENRICH_SYSTEM, EXTRACT_SYSTEM, EXTRACT_USER, enrichUser } from './prompts';
import type { ImageInput } from './providers/types';

const VISION_TIMEOUT = 40_000;
const TEXT_TIMEOUT = 25_000;
/** За один запрос уточняем не больше строк: ответ короче и быстрее. */
export const ENRICH_MAX = 40;

export async function extractPhotos(images: ImageInput[], cfg: ScanConfig): Promise<Extracted> {
  const raw = await cfg.provider.generateJson({
    model: cfg.visionModel, system: EXTRACT_SYSTEM, user: EXTRACT_USER, images,
    schemaName: 'receipt_lines', schema: EXTRACTION_JSON_SCHEMA, signal: AbortSignal.timeout(VISION_TIMEOUT), maxTokens: 6000,
  });
  return parseExtraction(raw);
}

/** Фото корзины или скриншот заказа → товары. */
export async function extractCart(images: ImageInput[], cfg: ScanConfig): Promise<ExtractedCart> {
  const raw = await cfg.provider.generateJson({
    model: cfg.visionModel, system: CART_SYSTEM, user: CART_USER, images,
    schemaName: 'cart_items', schema: CART_JSON_SCHEMA, signal: AbortSignal.timeout(VISION_TIMEOUT), maxTokens: 4000,
  });
  return parseCart(raw);
}

export async function enrichItems(items: Pick<ReceiptItem, 'n' | 'p'>[], cfg: ScanConfig): Promise<(ReceiptItem | null)[]> {
  const lines = items.slice(0, ENRICH_MAX).map(lineOf);
  const raw = await cfg.provider.generateJson({
    model: cfg.textModel, system: ENRICH_SYSTEM, user: enrichUser(lines),
    schemaName: 'estimates', schema: ENRICHMENT_JSON_SCHEMA, signal: AbortSignal.timeout(TEXT_TIMEOUT), maxTokens: 6000,
  });
  const est = parseEnrichment(raw, lines.length);
  return items.map((_, i) => (est.has(i) ? buildItem(lines[i], est.get(i)) : null));
}

// Распознавание в два шага (только сервер):
//   1) фото → позиции (название, количество, сумма) — модель с картинками;
//   2) позиции → сахар, «вредное», замена — дешёвая текстовая модель + локальный справочник.
// Если шаг 2 не удался, чек всё равно собирается по справочнику.
import type { Receipt } from '../types';
import { buildReceipt } from './build';
import type { ScanConfig } from './config';
import { ENRICHMENT_JSON_SCHEMA, EXTRACTION_JSON_SCHEMA } from './model';
import { parseEnrichment, parseExtraction, type Estimate } from './parse';
import { ENRICH_SYSTEM, EXTRACT_SYSTEM, EXTRACT_USER, enrichUser } from './prompts';
import type { ImageInput } from './providers/types';

const VISION_TIMEOUT = 40_000;
const TEXT_TIMEOUT = 25_000;

export async function scanPhoto(image: ImageInput, cfg: ScanConfig): Promise<Receipt> {
  const raw = await cfg.provider.generateJson({
    model: cfg.visionModel,
    system: EXTRACT_SYSTEM,
    user: EXTRACT_USER,
    image,
    schemaName: 'receipt_lines',
    schema: EXTRACTION_JSON_SCHEMA,
    signal: AbortSignal.timeout(VISION_TIMEOUT),
    maxTokens: 4000,
  });
  const extracted = parseExtraction(raw);

  let estimates = new Map<number, Estimate>();
  try {
    const raw2 = await cfg.provider.generateJson({
      model: cfg.textModel,
      system: ENRICH_SYSTEM,
      user: enrichUser(extracted.lines),
      schemaName: 'sugar_estimates',
      schema: ENRICHMENT_JSON_SCHEMA,
      signal: AbortSignal.timeout(TEXT_TIMEOUT),
      maxTokens: 4000,
    });
    estimates = parseEnrichment(raw2, extracted.lines.length);
  } catch (err) {
    console.warn('[scan] оценка сахара моделью не удалась, считаю по справочнику:', err instanceof Error ? `${err.message} ${String(err.cause ?? '')}` : err);
  }

  return buildReceipt(extracted, estimates);
}

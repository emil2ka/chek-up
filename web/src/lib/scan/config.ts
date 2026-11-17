// Выбор провайдера и моделей из переменных окружения (только сервер).
// Достаточно одного ключа в .env.local — провайдер определится сам. Без ключей — демо-режим.
import { anthropic } from './providers/anthropic';
import { chatCompletions } from './providers/chat';
import { gemini } from './providers/gemini';
import { mistral } from './providers/mistral';
import { openAiResponses } from './providers/openai';
import type { LlmProvider, ProviderId } from './providers/types';

/**
 * Модели по умолчанию: шаг 1 (фото → позиции) и шаг 2 (позиции → сахар). Меняются SCAN_VISION_MODEL / SCAN_TEXT_MODEL.
 * Выбор и цены — docs/recognition-research.md (16.11.2026).
 */
export const DEFAULT_MODELS: Record<ProviderId, { vision: string; text: string }> = {
  gemini: { vision: 'gemini-3.5-flash-lite', text: 'gemini-3.5-flash-lite' }, // основной: бесплатный уровень без карты; платно ≈1,8 ₸ за чек
  openai: { vision: 'gpt-6-luna', text: 'gpt-6-luna' },                       // для масштаба: ≈0,47 ₸ за чек, предоплата $5
  mistral: { vision: 'mistral-ocr-4-1', text: 'mistral-small-2603' },         // ≈2,5 ₸ за чек, заявлен хороший казахский
  anthropic: { vision: 'claude-haiku-5-5', text: 'claude-haiku-5-5' },
  openrouter: { vision: 'z-ai/glm-5.3-flash', text: 'z-ai/glm-5.3-flash' }, // проверена на тестовом чеке: 12/12 позиций; ≈17–22 с на чек
};

const KEYS: Record<ProviderId, string> = {
  openai: 'OPENAI_API_KEY',
  mistral: 'MISTRAL_API_KEY',
  gemini: 'GEMINI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
};
/** Если ключей несколько и SCAN_PROVIDER не задан — берётся первый по этому порядку (рекомендация исследования). */
const ORDER: ProviderId[] = ['gemini', 'openai', 'mistral', 'anthropic', 'openrouter'];

export type ScanConfig = { provider: LlmProvider; visionModel: string; textModel: string };

const env = (name: string): string => (process.env[name] ?? '').trim();

function make(id: ProviderId, key: string): LlmProvider {
  switch (id) {
    case 'openai': return openAiResponses(key);
    case 'mistral': return mistral(key);
    case 'gemini': return gemini(key);
    case 'anthropic': return anthropic(key);
    case 'openrouter': return chatCompletions({ id, baseUrl: 'https://openrouter.ai/api/v1', apiKey: key, extraHeaders: { 'X-Title': 'Chek-up' } });
  }
}

/** null — ключей нет, работаем в демо-режиме. */
export function scanConfig(): ScanConfig | null {
  const forced = env('SCAN_PROVIDER') as ProviderId | '';
  const id = forced && forced in KEYS ? forced : ORDER.find(p => env(KEYS[p]));
  if (!id) return null;
  const key = env(KEYS[id]);
  if (!key) return null;
  return {
    provider: make(id, key),
    visionModel: env('SCAN_VISION_MODEL') || DEFAULT_MODELS[id].vision,
    textModel: env('SCAN_TEXT_MODEL') || DEFAULT_MODELS[id].text,
  };
}

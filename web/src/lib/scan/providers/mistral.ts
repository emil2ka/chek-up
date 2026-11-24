// Mistral (запасной вариант): фото → Document AI OCR с аннотацией по JSON-схеме (POST /v1/ocr),
// текстовый шаг → обычный chat/completions со строгой схемой.
import { ScanError } from '../errors';
import { chatCompletions } from './chat';
import { postJson } from './http';
import type { JsonTask, LlmProvider } from './types';

const BASE = 'https://api.mistral.ai/v1';

type OcrResponse = { document_annotation?: string | Record<string, unknown> | null; pages?: { markdown?: string }[] };

export function mistral(apiKey: string): LlmProvider {
  const text = chatCompletions({ id: 'mistral', baseUrl: BASE, apiKey, maxTokensField: 'max_tokens' });
  return {
    id: 'mistral',
    async generateJson(t: JsonTask) {
      const image = t.images?.[0];
      if (!image) return text.generateJson(t);
      if (t.images!.length > 1) throw new ScanError('bad_request', 'mistral: только один кадр');

      const data = await postJson(
        `${BASE}/ocr`,
        { authorization: `Bearer ${apiKey}` },
        {
          model: t.model,
          document: { type: 'image_url', image_url: `data:${image.mime};base64,${image.base64}` },
          document_annotation_format: { type: 'json_schema', json_schema: { name: t.schemaName, strict: true, schema: t.schema } },
          document_annotation_prompt: t.system,
          include_image_base64: false,
        },
        t.signal,
        'mistral-ocr',
      ) as OcrResponse;

      if (!data.document_annotation) {
        const seen = (data.pages ?? []).some(p => (p.markdown ?? '').trim());
        throw new ScanError(seen ? 'unreadable' : 'not_receipt', 'mistral-ocr: нет аннотации');
      }
      return data.document_annotation;
    },
  };
}

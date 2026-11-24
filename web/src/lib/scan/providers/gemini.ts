// Google Gemini API (generateContent, REST). Структурированный вывод — responseMimeType + responseJsonSchema.
import { ScanError } from '../errors';
import { postJson } from './http';
import type { JsonTask, LlmProvider } from './types';

const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

type GenResponse = {
  promptFeedback?: { blockReason?: string };
  candidates?: { finishReason?: string; content?: { parts?: { text?: string; thought?: boolean }[] } }[];
};

export function gemini(apiKey: string): LlmProvider {
  return {
    id: 'gemini',
    async generateJson(t: JsonTask) {
      const parts: unknown[] = [];
      for (const im of t.images ?? []) parts.push({ inlineData: { mimeType: im.mime, data: im.base64 } });
      parts.push({ text: t.user });

      const data = await postJson(
        `${BASE}/${encodeURIComponent(t.model)}:generateContent`,
        { 'x-goog-api-key': apiKey },
        {
          systemInstruction: { parts: [{ text: t.system }] },
          contents: [{ role: 'user', parts }],
          generationConfig: {
            responseMimeType: 'application/json',
            responseJsonSchema: t.schema,
            temperature: 0,
            maxOutputTokens: t.maxTokens,
            // «мысли» оплачиваются как выходные токены; thinkingLevel есть только у Gemini 3 и новее
            ...(/^gemini-([3-9]|\d{2})/.test(t.model) ? { thinkingConfig: { thinkingLevel: 'LOW' } } : {}),
          },
        },
        t.signal,
        'gemini',
      ) as GenResponse;

      if (data.promptFeedback?.blockReason) throw new ScanError('unreadable', `gemini: blocked ${data.promptFeedback.blockReason}`);
      const cand = data.candidates?.[0];
      const text = cand?.content?.parts?.filter(p => !p.thought).map(p => p.text ?? '').join('') ?? '';
      if (!text) throw new ScanError('unreadable', `gemini: пустой ответ (${cand?.finishReason ?? 'нет кандидатов'})`);
      return text;
    },
  };
}

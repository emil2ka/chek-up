// OpenAI-совместимый Chat Completions: OpenRouter (Qwen и другие открытые модели) и текстовый шаг Mistral.
// Структурированный вывод — response_format: json_schema (strict).
import { ScanError } from '../errors';
import { postJson } from './http';
import type { JsonTask, LlmProvider } from './types';

type ChatResponse = {
  choices?: { message?: { content?: string | null; refusal?: string | null }; finish_reason?: string }[];
};

export function chatCompletions(opts: {
  id: string;
  baseUrl: string;
  apiKey: string;
  extraHeaders?: Record<string, string>;
  /** max_completion_tokens (OpenAI-стиль) или max_tokens (Mistral, часть моделей OpenRouter) */
  maxTokensField?: 'max_completion_tokens' | 'max_tokens';
}): LlmProvider {
  return {
    id: opts.id,
    async generateJson(t: JsonTask) {
      const user: unknown[] = [{ type: 'text', text: t.user }];
      if (t.image) user.push({ type: 'image_url', image_url: { url: `data:${t.image.mime};base64,${t.image.base64}` } });

      const data = await postJson(
        `${opts.baseUrl}/chat/completions`,
        { authorization: `Bearer ${opts.apiKey}`, ...opts.extraHeaders },
        {
          model: t.model,
          messages: [
            { role: 'system', content: t.system },
            { role: 'user', content: user },
          ],
          response_format: { type: 'json_schema', json_schema: { name: t.schemaName, strict: true, schema: t.schema } },
          [opts.maxTokensField ?? 'max_tokens']: t.maxTokens,
        },
        t.signal,
        opts.id,
      ) as ChatResponse;

      const choice = data.choices?.[0];
      if (choice?.message?.refusal) throw new ScanError('unreadable', `${opts.id}: отказ модели`);
      const text = choice?.message?.content;
      if (!text) throw new ScanError('unreadable', `${opts.id}: пустой ответ (${choice?.finish_reason ?? 'нет choices'})`);
      return text;
    },
  };
}

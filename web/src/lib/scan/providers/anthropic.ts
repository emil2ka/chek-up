// Anthropic Claude (официальный SDK). Структурированный вывод — output_config.format (JSON Schema).
import Anthropic from '@anthropic-ai/sdk';
import { ScanError } from '../errors';
import type { JsonTask, LlmProvider } from './types';

type ImageMime = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
const IMAGE_MIMES: readonly string[] = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export function anthropic(apiKey: string): LlmProvider {
  const client = new Anthropic({ apiKey, maxRetries: 1 });
  return {
    id: 'anthropic',
    async generateJson(t: JsonTask) {
      const content: Anthropic.ContentBlockParam[] = [];
      for (const im of t.images ?? []) {
        if (!IMAGE_MIMES.includes(im.mime)) throw new ScanError('bad_request', `anthropic: формат ${im.mime}`);
        content.push({ type: 'image', source: { type: 'base64', media_type: im.mime as ImageMime, data: im.base64 } });
      }
      content.push({ type: 'text', text: t.user });

      let res: Anthropic.Message;
      try {
        res = await client.messages.create(
          {
            model: t.model,
            max_tokens: t.maxTokens,
            system: t.system,
            messages: [{ role: 'user', content }],
            output_config: { effort: 'low', format: { type: 'json_schema', schema: t.schema } },
          },
          { signal: t.signal },
        );
      } catch (err) {
        if (err instanceof Anthropic.RateLimitError) throw new ScanError('rate_limit', 'anthropic: 429');
        if (err instanceof Anthropic.APIError) throw new ScanError('unavailable', `anthropic: HTTP ${err.status ?? '?'} ${err.message.slice(0, 200)}`);
        throw new ScanError('unavailable', 'anthropic: сеть недоступна или таймаут');
      }

      if (res.stop_reason === 'refusal') throw new ScanError('unreadable', 'anthropic: отказ модели');
      const text = res.content.map(b => (b.type === 'text' ? b.text : '')).join('');
      if (!text) throw new ScanError('unreadable', `anthropic: пустой ответ (${res.stop_reason})`);
      return text;
    },
  };
}

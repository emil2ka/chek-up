// OpenAI Responses API (основной вариант: gpt-6-luna).
// Структурированный вывод — text.format: json_schema (strict). reasoning.effort: none — без «размышлений»,
// иначе по умолчанию medium, и выходных токенов (а значит денег) в разы больше.
import { ScanError } from '../errors';
import { postJson } from './http';
import type { JsonTask, LlmProvider } from './types';

type ResponsesOutput = {
  status?: string;
  incomplete_details?: { reason?: string } | null;
  output?: { type?: string; content?: { type?: string; text?: string; refusal?: string }[] }[];
};

export function openAiResponses(apiKey: string, baseUrl = 'https://api.openai.com/v1'): LlmProvider {
  return {
    id: 'openai',
    async generateJson(t: JsonTask) {
      const content: unknown[] = [{ type: 'input_text', text: t.user }];
      if (t.image) content.push({ type: 'input_image', image_url: `data:${t.image.mime};base64,${t.image.base64}`, detail: 'high' });

      const data = await postJson(
        `${baseUrl}/responses`,
        { authorization: `Bearer ${apiKey}` },
        {
          model: t.model,
          instructions: t.system,
          input: [{ role: 'user', content }],
          text: { format: { type: 'json_schema', name: t.schemaName, strict: true, schema: t.schema } },
          reasoning: { effort: 'none' },
          max_output_tokens: t.maxTokens,
          store: false,
        },
        t.signal,
        'openai',
      ) as ResponsesOutput;

      const parts = (data.output ?? []).filter(o => o.type === 'message').flatMap(o => o.content ?? []);
      if (parts.some(p => p.type === 'refusal')) throw new ScanError('unreadable', 'openai: отказ модели');
      const text = parts.filter(p => p.type === 'output_text').map(p => p.text ?? '').join('');
      if (!text) throw new ScanError('unreadable', `openai: пустой ответ (${data.status ?? '?'} ${data.incomplete_details?.reason ?? ''})`);
      return text;
    },
  };
}

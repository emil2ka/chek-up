// Интерфейс провайдера ИИ: один метод — «вот задача, верни JSON по схеме».
// Модель и провайдер меняются настройкой в .env.local (см. ../config.ts), код шагов не меняется.

export type ImageInput = { base64: string; mime: string };

export type JsonTask = {
  model: string;
  system: string;
  user: string;
  /** фото — только для шага распознавания */
  image?: ImageInput;
  schemaName: string;
  schema: Record<string, unknown>;
  signal: AbortSignal;
  /** ограничение длины ответа, токены */
  maxTokens: number;
};

export interface LlmProvider {
  readonly id: string;
  /** Вернуть ответ модели: объект или текст с JSON. Ошибки сети/лимитов — ScanError. */
  generateJson(task: JsonTask): Promise<unknown>;
}

export type ProviderId = 'openai' | 'mistral' | 'gemini' | 'anthropic' | 'openrouter';

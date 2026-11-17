import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';

const KEYS = ['OPENAI_API_KEY', 'MISTRAL_API_KEY', 'GEMINI_API_KEY', 'OPENROUTER_API_KEY', 'ANTHROPIC_API_KEY', 'SCAN_PROVIDER', 'SCAN_VISION_MODEL', 'SCAN_TEXT_MODEL'];

const send = (photo?: Blob, type = 'image/jpeg') => {
  const fd = new FormData();
  if (photo) fd.append('photo', new File([photo], 'r.jpg', { type }));
  return POST(new Request('http://localhost/api/scan', { method: 'POST', body: fd, headers: { 'x-forwarded-for': `10.0.0.${Math.random() * 250 | 0}` } }));
};
const jpeg = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])]);

const geminiText = (obj: unknown) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] }), { status: 200 });

beforeEach(() => KEYS.forEach(k => vi.stubEnv(k, '')));
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('POST /api/scan', () => {
  it('без ключа — демо-чек week и честное уведомление', async () => {
    const res = await send(jpeg);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.receipt.id).toBe('week');
    expect(body.notice).toMatch(/Демо-режим/);
  });

  it('без фото или не картинка — 400 bad_request', async () => {
    expect((await send()).status).toBe(400);
    const res = await send(new Blob(['hi']), 'text/plain');
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('bad_request');
  });

  it('с ключом Gemini — распознанный чек; ключ уходит только в заголовке', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'test-key');
    vi.stubEnv('OPENAI_API_KEY', 'sk-test'); // Gemini первый по порядку
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(geminiText({ is_receipt: true, store: 'Magnum', date: '2026-11-16', items: [{ name: 'Кола 1 л', qty: 1, price: 620 }] }))
      .mockResolvedValueOnce(geminiText({ items: [{ i: 0, sugar_g: 106, junk: true, swap_name: '', swap_price: 0, swap_sugar_g: 0 }] }));
    vi.stubGlobal('fetch', fetchMock);

    const res = await send(jpeg);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.notice).toBeNull();
    expect(body.receipt).toMatchObject({ store: 'Magnum', approx: true, items: [{ n: 'Кола 1 л', p: 620, s: 106, junk: 1 }] });

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).not.toContain('test-key');
    expect(init.headers['x-goog-api-key']).toBe('test-key');
    expect(JSON.parse(init.body).generationConfig.responseMimeType).toBe('application/json');
  });

  it('с ключом: «не чек» и лимит провайдера — понятные коды', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'test-key');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(geminiText({ is_receipt: false, store: '', date: '', items: [] })));
    let res = await send(jpeg);
    expect([res.status, (await res.json()).error.code]).toEqual([422, 'not_receipt']);

    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response('{}', { status: 429 })));
    res = await send(jpeg);
    expect([res.status, (await res.json()).error.code]).toEqual([429, 'rate_limit']);
  });
});

const step1 = { is_receipt: true, store: 'Magnum', date: '2026-11-16', items: [{ name: 'Кола 1 л', qty: 1, price: 620 }] };
const step2 = { items: [{ i: 0, sugar_g: 106, junk: true, swap_name: '', swap_price: 0, swap_sugar_g: 0 }] };

describe('POST /api/scan: основной и запасной провайдеры', () => {
  it('OpenAI (основной): Responses API, reasoning none, строгая схема, картинка data-URL', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'sk-test');
    vi.stubEnv('MISTRAL_API_KEY', 'mi-test'); // при двух ключах выбирается первый по порядку
    const out = (obj: unknown) => new Response(JSON.stringify({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(obj) }] }] }), { status: 200 });
    const fetchMock = vi.fn().mockResolvedValueOnce(out(step1)).mockResolvedValueOnce(out(step2));
    vi.stubGlobal('fetch', fetchMock);

    const res = await send(jpeg);
    expect(res.status).toBe(200);
    expect((await res.json()).receipt.items[0]).toMatchObject({ n: 'Кола 1 л', s: 106 });

    const [url, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(url).toBe('https://api.openai.com/v1/responses');
    expect(init.headers.authorization).toBe('Bearer sk-test');
    expect(body).toMatchObject({ model: 'gpt-6-luna', reasoning: { effort: 'none' }, store: false, text: { format: { type: 'json_schema', strict: true } } });
    expect(body.input[0].content[1]).toMatchObject({ type: 'input_image', detail: 'high' });
    expect(body.input[0].content[1].image_url).toMatch(/^data:image\/jpeg;base64,/);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).input[0].content).toHaveLength(1); // текстовый шаг без фото
  });

  it('OpenAI: отказ модели → unreadable', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'sk-test');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'no' }] }] }), { status: 200 })));
    const res = await send(jpeg);
    expect([res.status, (await res.json()).error.code]).toEqual([422, 'unreadable']);
  });

  it('Mistral (запасной): OCR с аннотацией по схеме, затем chat/completions', async () => {
    vi.stubEnv('MISTRAL_API_KEY', 'mi-test');
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ pages: [{ markdown: 'КОЛА 1Л 620' }], document_annotation: JSON.stringify(step1) }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(step2) } }] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const res = await send(jpeg);
    expect(res.status).toBe(200);
    expect((await res.json()).receipt.items[0]).toMatchObject({ n: 'Кола 1 л', s: 106 });

    const [url1, init1] = fetchMock.mock.calls[0];
    const b1 = JSON.parse(init1.body);
    expect(url1).toBe('https://api.mistral.ai/v1/ocr');
    expect(b1).toMatchObject({ model: 'mistral-ocr-4-1', document: { type: 'image_url' }, document_annotation_format: { type: 'json_schema' } });
    expect(fetchMock.mock.calls[1][0]).toBe('https://api.mistral.ai/v1/chat/completions');
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({ model: 'mistral-small-2603', response_format: { type: 'json_schema' } });
  });

  it('SCAN_PROVIDER и SCAN_VISION_MODEL переключают модель одной настройкой', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'sk-test');
    vi.stubEnv('GEMINI_API_KEY', 'g-test');
    vi.stubEnv('SCAN_PROVIDER', 'gemini');
    vi.stubEnv('SCAN_VISION_MODEL', 'gemini-4-hydrogen');
    const fetchMock = vi.fn().mockResolvedValueOnce(geminiText(step1)).mockResolvedValueOnce(geminiText(step2));
    vi.stubGlobal('fetch', fetchMock);
    await send(jpeg);
    expect(String(fetchMock.mock.calls[0][0])).toContain('/models/gemini-4-hydrogen:generateContent');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).generationConfig.thinkingConfig).toEqual({ thinkingLevel: 'LOW' });
  });
});

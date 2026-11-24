import { afterEach, describe, expect, it, vi } from 'vitest';
import { ScanError } from './errors';
import { enrichItems, extractPhotos } from './pipeline';
import { postJson } from './providers/http';
import type { JsonTask, LlmProvider } from './providers/types';

const IMG = { base64: 'AAAA', mime: 'image/jpeg' };

function fake(answers: (unknown | Error)[]): LlmProvider & { tasks: JsonTask[] } {
  const tasks: JsonTask[] = [];
  return {
    id: 'fake',
    tasks,
    async generateJson(t) {
      tasks.push(t);
      const a = answers.shift();
      if (a instanceof Error) throw a;
      return a;
    },
  };
}

const extraction = JSON.stringify({
  is_receipt: true, store: 'Small', date: '2026-11-14',
  items: [
    { name: 'Лимонад 2 л', qty: 1, price: 890 },
    { name: 'Бананы', qty: 1.5, price: 1200 },
  ],
});

const cfg = (p: LlmProvider) => ({ provider: p, visionModel: 'v', textModel: 't' });

describe('extractPhotos', () => {
  it('отдаёт позиции, несколько кадров уходят одним запросом', async () => {
    const p = fake([extraction]);
    const x = await extractPhotos([IMG, IMG], cfg(p));
    expect(p.tasks).toHaveLength(1);
    expect(p.tasks[0]).toMatchObject({ model: 'v', images: [IMG, IMG] });
    expect(x.lines.map(l => l.name)).toEqual(['Лимонад 2 л', 'Бананы']);
  });
  it('ошибки доходят до пользователя', async () => {
    await expect(extractPhotos([IMG], cfg(fake([{ is_receipt: false, store: '', date: '', items: [] }])))).rejects.toMatchObject({ code: 'not_receipt' });
    await expect(extractPhotos([IMG], cfg(fake([new ScanError('rate_limit')])))).rejects.toMatchObject({ code: 'rate_limit' });
  });
});

describe('enrichItems', () => {
  it('оценивает неизвестные позиции и расшифровывает название; чего нет в ответе — null', async () => {
    const p = fake([{ items: [{ i: 0, name: 'Печенье Орион 200 г', food: true, sugar_g: 60, kcal: 900, junk: true, swap_name: 'Хлебцы 100 г', swap_price: 300, swap_sugar_g: 2 }] }]);
    const r = await enrichItems([{ n: 'ORION XQ-17', p: 700 }, { n: 'НЕПОНЯТНО', p: 100 }], cfg(p));
    expect(p.tasks[0].images).toBeUndefined();
    expect(r[0]).toMatchObject({ n: 'Печенье Орион 200 г', p: 700, s: 60, k: 900, junk: 1, src: 'ai', swap: { n: 'Хлебцы 100 г' } });
    expect(r[1]).toBeNull();
  });
  it('модель сказала «не еда»', async () => {
    const r = await enrichItems([{ n: 'XYZ 12', p: 700 }], cfg(fake([{ items: [{ i: 0, name: 'Салют праздничный', food: false, sugar_g: 0 }] }])));
    expect(r[0]).toMatchObject({ nf: 1, s: 0 });
  });
});

describe('postJson: ошибки провайдера', () => {
  afterEach(() => vi.unstubAllGlobals());
  const call = () => postJson('https://x', {}, {}, AbortSignal.timeout(1000), 'test');

  it.each([
    [429, 'rate_limit'],
    [401, 'unavailable'],
    [500, 'unavailable'],
  ])('HTTP %i → %s', async (status, want) => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status })));
    await expect(call()).rejects.toMatchObject({ code: want });
  });

  it('сеть недоступна → unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed'); }));
    await expect(call()).rejects.toMatchObject({ code: 'unavailable' });
  });
});

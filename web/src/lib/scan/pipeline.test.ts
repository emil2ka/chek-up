import { afterEach, describe, expect, it, vi } from 'vitest';
import { ScanError } from './errors';
import { scanPhoto } from './pipeline';
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

describe('scanPhoto', () => {
  it('два шага: фото → позиции → сахар', async () => {
    const p = fake([
      extraction,
      { items: [
        { i: 0, sugar_g: 212, junk: true, swap_name: 'Вода с лимоном 2 л', swap_price: 420, swap_sugar_g: 0 },
        { i: 1, sugar_g: 0, junk: false, swap_name: '', swap_price: 0, swap_sugar_g: 0 },
      ] },
    ]);
    const r = await scanPhoto(IMG, { provider: p, visionModel: 'v', textModel: 't' });
    expect(p.tasks.map(t => [t.model, !!t.image])).toEqual([['v', true], ['t', false]]);
    expect(p.tasks[1].user).toContain('справочник: сладкая газировка');
    expect(r.items[0]).toMatchObject({ n: 'Лимонад 2 л', p: 890, s: 212, junk: 1, swap: { n: 'Вода с лимоном 2 л', p: 420, s: 0 } });
    expect(r.items[1]).toMatchObject({ n: 'Бананы', s: 0 });
    expect(r.approx).toBe(true);
  });

  it('если второй шаг упал — чек собирается по справочнику', async () => {
    const p = fake([extraction, new ScanError('unavailable', 'тест')]);
    const r = await scanPhoto(IMG, { provider: p, visionModel: 'v', textModel: 't' });
    expect(r.items[0].s).toBe(212);
  });

  it('ошибки первого шага доходят до пользователя', async () => {
    await expect(scanPhoto(IMG, { provider: fake([{ is_receipt: false, store: '', date: '', items: [] }]), visionModel: 'v', textModel: 't' }))
      .rejects.toMatchObject({ code: 'not_receipt' });
    await expect(scanPhoto(IMG, { provider: fake([new ScanError('rate_limit')]), visionModel: 'v', textModel: 't' }))
      .rejects.toMatchObject({ code: 'rate_limit' });
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

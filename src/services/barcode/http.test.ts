import { describe, expect, it, vi } from 'vitest';
import { fakeFetch } from '../../ai/testing/fakeFetch';
import { useFakeTime } from '../../test/time';
import { fetchWithin, readTextReply } from './http';

const PRODUCT = 'https://food.example.test/api/product/0071234567896.json';

describe('fetchWithin', () => {
  it('asks the browser to send no Referer, whatever the caller passed (S-12)', async () => {
    useFakeTime('2026-10-26T12:00:00Z');
    const fake = fakeFetch().on(PRODUCT, { json: { status: 1 } }, { json: { status: 1 } });
    const fetch = vi.fn(fake.fetch);

    await fetchWithin(
      PRODUCT,
      { headers: { 'X-Api-Key': 'test' } },
      { fetch },
      10_000,
      readTextReply,
    );
    await fetchWithin(PRODUCT, { referrerPolicy: 'origin' }, { fetch }, 10_000, readTextReply);

    const inits = fetch.mock.calls.map(([, init]) => init);
    expect(inits.map((init) => init?.referrerPolicy)).toEqual(['no-referrer', 'no-referrer']);
    expect(inits[0]?.headers).toEqual({ 'X-Api-Key': 'test' });
    expect(inits[0]?.signal).toBeInstanceOf(AbortSignal);
  });
});

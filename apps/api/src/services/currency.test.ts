import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CurrencyProviderError, fetchCurrencyApiRate, fetchFrankfurterRate } from './currency.js';

const now = new Date('2026-10-03T12:00:00.000Z');

describe('currency providers', () => {
  it('normalizes a Frankfurter TND quote with source date', async () => {
    const result = await fetchFrankfurterRate('EUR', 'TND', {
      now: () => now,
      fetchImpl: async () => new Response(JSON.stringify({ date: '2026-10-03', base: 'EUR', quote: 'TND', rate: 3.4012 }), { status: 200 }),
    });
    assert.equal(result.provider, 'frankfurter');
    assert.equal(result.quote, 'TND');
    assert.equal(result.rate, '3.4012');
    assert.equal(result.sourceTimestamp, '2026-10-03');
    assert.equal(result.stale, false);
  });

  it('marks an old source date stale instead of treating it as live', async () => {
    const result = await fetchFrankfurterRate('EUR', 'TND', {
      now: () => now,
      fetchImpl: async () => new Response(JSON.stringify({ date: '2026-09-30', base: 'EUR', quote: 'TND', rate: 3.4012 }), { status: 200 }),
    });
    assert.equal(result.sourceTimestamp, '2026-09-30');
    assert.equal(result.stale, true);
  });

  it('normalizes currencyapi freshness metadata and maps 429', async () => {
    const result = await fetchCurrencyApiRate('EUR', 'TND', {
      apiKey: 'test-key',
      now: () => now,
      fetchImpl: async () => new Response(JSON.stringify({ meta: { last_updated_at: '2026-10-03T11:00:00.000Z' }, data: { TND: { code: 'TND', value: 3.4012 } } }), { status: 200 }),
    });
    assert.equal(result.sourceTimestamp, '2026-10-03T11:00:00.000Z');
    await assert.rejects(
      fetchCurrencyApiRate('EUR', 'TND', { apiKey: 'test-key', fetchImpl: async () => new Response('', { status: 429 }) }),
      (error: unknown) => error instanceof CurrencyProviderError && error.code === 'provider_rate_limited',
    );
  });

  it('bounds provider response size and enforces the request timeout', async () => {
    await assert.rejects(
      fetchFrankfurterRate('EUR', 'TND', {
        fetchImpl: async () => new Response('x'.repeat(33_000), { status: 200 }),
      }),
      (error: unknown) => error instanceof CurrencyProviderError && error.code === 'provider_invalid_response',
    );
    await assert.rejects(
      fetchFrankfurterRate('EUR', 'TND', {
        timeoutMs: 250,
        fetchImpl: async () => new Promise<Response>(() => undefined),
      }),
      (error: unknown) => error instanceof CurrencyProviderError && error.code === 'provider_unavailable',
    );
  });

  it('rejects non-canonical Frankfurter dates before computing staleness', async () => {
    await assert.rejects(
      fetchFrankfurterRate('EUR', 'TND', {
        fetchImpl: async () => new Response(JSON.stringify({ date: 'October 3, 2026', base: 'EUR', quote: 'TND', rate: 3.4 }), { status: 200 }),
      }),
      (error: unknown) => error instanceof CurrencyProviderError && error.code === 'provider_invalid_response',
    );
  });

  it('times out a provider that sends headers but stalls its body', async () => {
    let aborted = false;
    await assert.rejects(fetchFrankfurterRate('EUR', 'TND', {
      timeoutMs: 250,
      fetchImpl: async (_input, init) => {
        init?.signal?.addEventListener('abort', () => { aborted = true; });
        return new Response(new ReadableStream({ start() { /* never completes */ } }));
      },
    }), /did not respond in time/);
    assert.equal(aborted, true);
  });

  it('rejects null provider data with a stable provider error', async () => {
    await assert.rejects(fetchFrankfurterRate('EUR', 'TND', { fetchImpl: async () => new Response('null') }),
      (error: unknown) => error instanceof CurrencyProviderError && error.code === 'provider_invalid_response');
  });
});

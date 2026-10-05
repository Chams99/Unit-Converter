import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from './app.js';

describe('API routes', () => {
  it('serves liveness, unit catalog, and server-side conversion', async () => {
    const app = await buildApp();
    try {
      const health = await app.inject({ method: 'GET', url: '/healthz' });
      assert.equal(health.statusCode, 200);
      const catalog = await app.inject({ method: 'GET', url: '/v1/units' });
      assert.equal(catalog.statusCode, 200);
      assert.ok(catalog.json().units.some((unit: { id: string }) => unit.id === 'kelvin'));
      const conversion = await app.inject({ method: 'POST', url: '/v1/convert', payload: { value: '32', from: 'fahrenheit', to: 'celsius' } });
      assert.equal(conversion.statusCode, 200);
      assert.equal(conversion.json().value, '0');
      const specification = app.swagger() as { paths?: Record<string, unknown> };
      assert.ok(specification.paths?.['/v1/convert']);
    } finally {
      await app.close();
    }
  });

  it('returns stable errors for incompatible units and missing currency provider data', async () => {
    const app = await buildApp({ currency: { provider: 'currencyapi', options: { apiKey: 'test-key', fetchImpl: async () => new Response(JSON.stringify({ data: {} }), { status: 200 }) } } });
    try {
      const invalid = await app.inject({ method: 'POST', url: '/v1/convert', payload: { value: '1', from: 'meter', to: 'second' } });
      assert.equal(invalid.statusCode, 422);
      assert.equal(invalid.json().code, 'incompatible_dimensions');
      const currency = await app.inject({ method: 'GET', url: '/v1/currency/rates?base=EUR&quote=TND' });
      assert.equal(currency.statusCode, 503);
      assert.equal(currency.json().code, 'provider_invalid_response');
    } finally {
      await app.close();
    }
  });

  it('maps malformed JSON and unsupported media to stable client errors', async () => {
    const app = await buildApp();
    try {
      const malformed = await app.inject({ method: 'POST', url: '/v1/convert', headers: { 'content-type': 'application/json' }, payload: '{' });
      assert.equal(malformed.statusCode, 400);
      assert.equal(malformed.json().code, 'invalid_request');
      const unsupported = await app.inject({ method: 'POST', url: '/v1/convert', headers: { 'content-type': 'text/plain' }, payload: 'value' });
      assert.equal(unsupported.statusCode, 415);
      assert.equal(unsupported.json().code, 'invalid_request');
    } finally {
      await app.close();
    }
  });

  it('reuses a short-lived currency quote instead of calling the provider per request', async () => {
    let calls = 0;
    const app = await buildApp({ currency: {
      provider: 'frankfurter',
      options: {
        now: () => new Date('2026-10-03T12:00:00.000Z'),
        fetchImpl: async () => {
          calls += 1;
          return new Response(JSON.stringify({ date: '2026-10-03', base: 'EUR', quote: 'TND', rate: 3.4 }), { status: 200 });
        },
      },
    } });
    try {
      const first = await app.inject({ method: 'GET', url: '/v1/currency/rates?base=EUR&quote=TND' });
      const second = await app.inject({ method: 'GET', url: '/v1/currency/rates?base=EUR&quote=TND' });
      assert.equal(first.statusCode, 200);
      assert.equal(second.statusCode, 200);
      assert.equal(calls, 1);
    } finally {
      await app.close();
    }
  });

  it('returns an actual image artifact from multipart upload', async () => {
    const app = await buildApp();
    const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
    const boundary = '----universal-convertal-test';
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="outputFormat"\r\n\r\nwebp\r\n`),
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="untrusted.png"\r\nContent-Type: image/png\r\n\r\n`),
      image,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    try {
      const response = await app.inject({ method: 'POST', url: '/v1/image/convert', headers: { 'content-type': `multipart/form-data; boundary=${boundary}` }, payload: body });
      assert.equal(response.statusCode, 200);
      assert.equal(response.headers['content-type'], 'image/webp');
      assert.equal(response.rawPayload.subarray(0, 4).toString('ascii'), 'RIFF');
    } finally {
      await app.close();
    }
  });

  it('rejects multipart requests containing more than one file', async () => {
    const app = await buildApp();
    const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
    const boundary = '----universal-convertal-two-files';
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="first.png"\r\nContent-Type: image/png\r\n\r\n`), image,
      Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="file2"; filename="second.png"\r\nContent-Type: image/png\r\n\r\n`), image,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    try {
      const response = await app.inject({ method: 'POST', url: '/v1/image/convert', headers: { 'content-type': `multipart/form-data; boundary=${boundary}` }, payload: body });
      assert.equal(response.statusCode, 400);
      assert.equal(response.json().code, 'invalid_request');
    } finally {
      await app.close();
    }
  });

  it('enforces a global budget even when clients change forwarded headers', async () => {
    const app = await buildApp({ limits: { apiBurst: 2, apiPerMinute: 1 } });
    try {
      for (let index = 0; index < 2; index++) assert.equal((await app.inject({ url: '/v1/units', headers: { 'x-forwarded-for': `192.0.2.${index}` } })).statusCode, 200);
      const blocked = await app.inject({ url: '/v1/units', headers: { 'x-forwarded-for': '198.51.100.1', 'x-device-id': 'new-device' } });
      assert.equal(blocked.statusCode, 429);
      assert.equal(blocked.json().code, 'rate_limited');
      assert.equal(blocked.headers['retry-after'], '60');
      assert.equal((await app.inject({ url: '/healthz' })).statusCode, 200);
    } finally { await app.close(); }
  });

  it('rejects oversized JSON before conversion', async () => {
    const app = await buildApp();
    try {
      const response = await app.inject({ method: 'POST', url: '/v1/convert', payload: { value: '1'.repeat(17_000), from: 'meter', to: 'centimeter' } });
      assert.equal(response.statusCode, 413);
      assert.equal(response.json().code, 'input_too_large');
    } finally { await app.close(); }
  });

  it('coalesces concurrent currency requests into one provider call', async () => {
    let calls = 0;
    let resolve!: (response: Response) => void;
    const app = await buildApp({ currency: { provider: 'frankfurter', options: { fetchImpl: async () => { calls += 1; return new Promise<Response>((done) => { resolve = done; }); } } } });
    try {
      const requests = Array.from({ length: 10 }, () => app.inject({ url: '/v1/currency/rates?base=EUR&quote=TND' }));
      await new Promise<void>((done) => setImmediate(done));
      assert.equal(calls, 1);
      resolve(new Response(JSON.stringify({ date: '2026-10-03', base: 'EUR', quote: 'TND', rate: 3.4 })));
      const responses = await Promise.all(requests);
      assert.ok(responses.every((response) => response.statusCode === 200));
    } finally { await app.close(); }
  });

  it('caps outgoing provider calls across different pairs and caches failures', async () => {
    let calls = 0;
    const app = await buildApp({ currency: { provider: 'frankfurter', options: { fetchImpl: async () => { calls += 1; return new Response('', { status: 503 }); } } } });
    try {
      const path = '/v1/currency/rates?base=EUR&quote=TND';
      assert.equal((await app.inject({ url: path })).statusCode, 503);
      assert.equal((await app.inject({ url: path })).statusCode, 503);
      assert.equal(calls, 1);
      for (const quote of ['USD', 'GBP', 'JPY', 'CHF']) assert.equal((await app.inject({ url: `/v1/currency/rates?base=EUR&quote=${quote}` })).statusCode, 503);
      assert.equal((await app.inject({ url: '/v1/currency/rates?base=EUR&quote=MAD' })).statusCode, 429);
      assert.equal(calls, 5);
    } finally { await app.close(); }
  });
});

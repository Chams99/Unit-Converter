import { it } from 'node:test';
import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import { buildApp } from './app.js';

const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
const boundary = 'convertal-slow-upload';
const prefix = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="test.png"\r\nContent-Type: image/png\r\n\r\n`);
const body = Buffer.concat([prefix, image, Buffer.from(`\r\n--${boundary}--\r\n`)]);
const headers = { 'content-type': `multipart/form-data; boundary=${boundary}` };

it('rejects excess slow uploads and releases slots after disconnect', { timeout: 5000 }, async () => {
  const app = await buildApp({ limits: { imagePerMinute: 60_000 } });
  const address = await app.listen({ host: '127.0.0.1', port: 0 });
  let received = 0;
  let resolve!: () => void;
  const admitted = new Promise<void>((done) => { resolve = done; });
  const observe = () => { if (++received === 2) setImmediate(resolve); };
  app.server.on('request', observe);
  const requests = Array.from({ length: 2 }, () => {
    const request = httpRequest(`${address}/v1/image/convert`, { method: 'POST', headers });
    request.on('error', () => undefined);
    request.write(prefix); // Deliberately leave the file and HTTP body unfinished.
    return request;
  });
  try {
    await admitted;
    const blocked = await app.inject({ method: 'POST', url: '/v1/image/convert', headers, payload: body });
    assert.equal(blocked.statusCode, 429);
    assert.equal((await app.inject({ url: '/healthz' })).statusCode, 200);
    await Promise.all(requests.map((request) => new Promise<void>((done) => { request.once('close', done); request.destroy(); })));
    // Let the server observe the two disconnects and unwind multipart parsing.
    await new Promise<void>((done) => setTimeout(done, 50));
    const retry = await app.inject({ method: 'POST', url: '/v1/image/convert', headers, payload: body });
    assert.equal(retry.statusCode, 200);
  } finally {
    for (const request of requests) request.destroy();
    app.server.removeListener('request', observe);
    await app.close();
  }
});

it('closes an unfinished upload at its total deadline and recovers', { timeout: 5000 }, async () => {
  const app = await buildApp({ limits: { imageRequestMs: 100, imagePerMinute: 60_000 } });
  const address = await app.listen({ host: '127.0.0.1', port: 0 });
  const request = httpRequest(`${address}/v1/image/convert`, { method: 'POST', headers });
  request.on('error', () => undefined);
  try {
    const closed = new Promise<void>((done) => request.once('close', done));
    request.write(prefix);
    await closed;
    assert.equal((await app.inject({ url: '/healthz' })).statusCode, 200);
    // A malformed request exercises admission recovery without starting a
    // legitimate worker whose startup can exceed this intentionally tiny limit.
    const retry = await app.inject({ method: 'POST', url: '/v1/image/convert', headers, payload: Buffer.from(`--${boundary}--\r\n`) });
    assert.equal(retry.statusCode, 422);
  } finally { request.destroy(); await app.close(); }
});

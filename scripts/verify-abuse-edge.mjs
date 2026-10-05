// This runs inside the CI web container against an isolated proxy. Its default
// self-signed certificate is accepted only for this private, fixed CI target.
import { request } from 'node:https';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';

function send(path, { method = 'GET', body, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = request({ hostname: 'proxy', port: 443, path, method, rejectUnauthorized: false,
      headers: { Host: 'convertal.ci.invalid', ...headers, ...(body ? { 'Content-Length': body.length } : {}) } }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
      res.on('error', reject);
    });
    req.setTimeout(15_000, () => req.destroy(new Error('CI proxy timed out')));
    req.on('error', reject);
    req.end(body);
  });
}

let ready = false;
for (let attempt = 0; attempt < 20; attempt++) {
  try { if ((await send('/api/healthz')).status === 200) { ready = true; break; } } catch { /* proxy startup */ }
  await delay(500);
}
assert.ok(ready, 'Isolated Traefik proxy became ready');
assert.equal((await send('/api/v1/units')).status, 200);
assert.equal((await send('/api/v1/convert', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: Buffer.alloc(16_385, 120) })).status, 413);
console.log('  OK proxy JSON body limit');

assert.equal((await send('/api/v1/image/convert', { method: 'POST', headers: { 'Content-Type': 'multipart/form-data; boundary=ci' }, body: Buffer.alloc(10_502_145, 120) })).status, 413);
console.log('  OK proxy image upload limit');

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
const imageBody = Buffer.concat([
  Buffer.from('--ci\r\nContent-Disposition: form-data; name="outputFormat"\r\n\r\nwebp\r\n--ci\r\nContent-Disposition: form-data; name="file"; filename="synthetic.png"\r\nContent-Type: image/png\r\n\r\n'), png, Buffer.from('\r\n--ci--\r\n'),
]);
const image = await send('/api/v1/image/convert', { method: 'POST', headers: { 'Content-Type': 'multipart/form-data; boundary=ci' }, body: imageBody });
assert.equal(image.status, 200);
assert.equal(image.body.subarray(0, 4).toString(), 'RIFF');
const imageLimited = await send('/api/v1/image/convert', { method: 'POST', headers: { 'Content-Type': 'multipart/form-data; boundary=ci', 'X-Forwarded-For': '192.0.2.55', 'X-Convertal-Scope': 'new-scope' }, body: imageBody });
assert.equal(imageLimited.status, 429);
assert.equal(imageLimited.body.toString().trim(), 'Too Many Requests');
console.log('  OK isolated image download and IP rate limit, including spoofed headers');

const burst = await Promise.all(Array.from({ length: 25 }, (_, index) => send('/api/healthz', { headers: { 'X-Forwarded-For': `192.0.2.${index}` } })));
assert.ok(burst.some((res) => res.status === 429));
assert.ok(burst.every((res) => res.status === 200 || res.status === 429));
console.log('  OK public API token bucket; spoofed forwarded headers cannot reset it');
console.log('Isolated proxy abuse checks passed.');

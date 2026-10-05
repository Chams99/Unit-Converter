import { it } from 'node:test';
import assert from 'node:assert/strict';
import { convertImageInProcess } from './image-process.js';
import { ImageConversionError } from './image-types.js';

const input = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
const hungWorker = new URL('../test-fixtures/hung-image-worker.mjs', import.meta.url);

it('returns a real image from an isolated process', async () => {
  const artifact = await convertImageInProcess(input, { outputFormat: 'webp' });
  assert.equal(artifact.data.subarray(0, 4).toString('ascii'), 'RIFF');
  assert.equal(artifact.width, 1);
});

it('does not release a failed operation before its blocked process exits', async () => {
  let pid = 0;
  await assert.rejects(convertImageInProcess(input, { outputFormat: 'png', timeoutMs: 2000 }, undefined, hungWorker), (error: unknown) => {
    assert.ok(error instanceof ImageConversionError);
    pid = Number(error.message);
    return Number.isSafeInteger(pid) && pid > 0;
  });
  assert.throws(() => process.kill(pid, 0), (error: unknown) => (error as NodeJS.ErrnoException).code === 'ESRCH');
});

it('hard-stops an unresponsive process at the deadline', async () => {
  await assert.rejects(convertImageInProcess(input, { outputFormat: 'webp', timeoutMs: 200 }, undefined, hungWorker), /exceeded the time limit/);
});

it('hard-stops an unresponsive process on cancellation', async () => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 100);
  try {
    await assert.rejects(convertImageInProcess(input, { outputFormat: 'webp', timeoutMs: 2000 }, controller.signal, hungWorker), /cancelled/);
  } finally { clearTimeout(timer); }
});

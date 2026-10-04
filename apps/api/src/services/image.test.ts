import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { convertImage, ImageConversionError } from './image.js';

const onePixelPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');

describe('bounded image conversion', () => {
  it('returns a real converted artifact with dimensions and MIME', async () => {
    const result = await convertImage(onePixelPng, { outputFormat: 'webp', maxOutputBytes: 1_000_000 });
    assert.equal(result.inputFormat, 'png');
    assert.equal(result.mimeType, 'image/webp');
    assert.equal(result.width, 1);
    assert.equal(result.height, 1);
    assert.ok(result.bytes > 0);
    assert.equal(result.data.subarray(0, 4).toString('ascii'), 'RIFF');
  });

  it('rejects input before decode when bytes exceed the limit', async () => {
    await assert.rejects(convertImage(onePixelPng, { outputFormat: 'jpeg', maxInputBytes: 8 }), (error: unknown) => error instanceof ImageConversionError && error.code === 'input_too_large');
  });

  it('rejects decoded pixels and encoded output beyond their limits', async () => {
    const twoByTwo = await sharp({ create: { width: 2, height: 2, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } } }).png().toBuffer();
    await assert.rejects(convertImage(twoByTwo, { outputFormat: 'webp', maxInputPixels: 3 }), (error: unknown) => error instanceof ImageConversionError && error.code === 'pixels_too_large');
    await assert.rejects(convertImage(onePixelPng, { outputFormat: 'webp', maxOutputBytes: 1 }), (error: unknown) => error instanceof ImageConversionError && error.code === 'output_too_large');
  });
});

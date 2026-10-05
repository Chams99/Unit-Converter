import sharp from 'sharp';
import { convertImage, ImageConversionError, type ImageConvertOptions } from './image.js';

// Each process handles exactly one operation. No file paths, URLs or commands
// are accepted; pixels and output remain buffers. The parent kills this process
// after the result, deadline, disconnect or API shutdown.
sharp.cache(false);
sharp.concurrency(1);
process.once('message', async (message: { input: Buffer; options: ImageConvertOptions }) => {
  try {
    const artifact = await convertImage(message.input, message.options);
    process.send?.({ ok: true, artifact });
  } catch (error) {
    const safe = error instanceof ImageConversionError ? error : new ImageConversionError('conversion_failed', 'Image conversion failed.');
    process.send?.({ ok: false, code: safe.code, message: safe.message });
  }
});
